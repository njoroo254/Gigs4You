"""
Cathy Execution Engine — the single mandatory layer through which ALL Claude
API calls must pass.

Responsibilities:
  1. Enforce per-org monthly CUU limits (hard or soft, per config)
  2. Execute the actual Claude call (delegated to the caller-supplied coroutine)
  3. Measure elapsed time and calculate final CUU cost
  4. Fire-and-forget async DB logging (zero added latency)
  5. Expose usage context that prompts.py injects into every system prompt

Usage
-----
    from .services import get_engine

    engine = get_engine()

    result = await engine.run(
        operation="chat_complex",
        org_id=auth["org_id"],
        user_id=auth["user_id"],
        coro=client.messages.create(...),
    )

The engine is a singleton; call `get_engine()` from anywhere.
"""

import asyncio
import logging
import os
import time
from typing import Any, Awaitable, Callable, Dict, Optional

from .cathy_usage import (
    OVERAGE_ALLOWED,
    WARN_THRESHOLDS,
    get_cuu_cost,
    get_plan_cuu_limit,
)

# ── Rate guard config ─────────────────────────────────────────────────────────
# Max AI requests per org per minute before we start throttling.
_MAX_RPM: int = int(os.getenv("CATHY_MAX_RPM", "15"))
# Global monthly CUU ceiling across ALL orgs combined.
# Protects against unbounded API spend if many orgs are active simultaneously.
# Set to 0 to disable. Default: 500 000 CUU/month.
_GLOBAL_MONTHLY_CUU_CAP: int = int(os.getenv("ANTHROPIC_GLOBAL_MONTHLY_CUU", "500000"))
# Max AI requests per user per minute (stricter than org; catches single-user abuse).
_MAX_USER_RPM: int = int(os.getenv("CATHY_MAX_USER_RPM", "5"))
# At what usage % to auto-downgrade complex requests to the fast (Haiku) model.
_DOWNGRADE_PCT: float = float(os.getenv("CATHY_DOWNGRADE_PCT", "95"))
# Max percentage of the monthly CUU limit that can be consumed in a single day.
# Prevents a single burst from draining the full month quota.
_DAILY_BURST_PCT: float = float(os.getenv("CATHY_DAILY_BURST_PCT", "30"))
# Emergency hard-cap percentage — org is locked out and admin is alerted.
# Only reachable via reconciliation lag (usage logged after the call).
_HARD_BLOCK_PCT: float = float(os.getenv("CATHY_HARD_BLOCK_PCT", "120"))

# ── Expensive operations — blocked at 90 % usage ─────────────────────────────
# Tools that consume significant compute or API cost.
_EXPENSIVE_TOOLS: frozenset = frozenset({
    "verify_face_match",       # vision / face recognition
    "rank_workers_for_job",    # AI matching
    "recommend_workers",       # AI matching
    "auto_match_workers",      # AI matching
    "detect_anomalies",        # bulk platform scan
    "get_engagement_metrics",  # heavy aggregation
    "get_growth_metrics",      # heavy aggregation
    "predict_job_success",     # ML prediction
    "predict_worker_performance",
})

logger = logging.getLogger("gigs4you.cathy_engine")

# ── Lazy imports ──────────────────────────────────────────────────────────────
_db_module: Optional[Any] = None

def _db():
    global _db_module
    if _db_module is None:
        from .. import database as _m
        _db_module = _m
    return _db_module

_redis_client: Optional[Any] = None

def _get_redis() -> Optional[Any]:
    """Return a shared Redis client, or None if Redis is unavailable."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        import redis as _redis_lib
        r = _redis_lib.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            decode_responses=True,
            socket_connect_timeout=1,
        )
        r.ping()
        _redis_client = r
    except Exception:
        pass
    return _redis_client


# ── Engine ────────────────────────────────────────────────────────────────────

class CathyEngine:
    """
    Thin orchestration layer wrapping every Claude API call.

    Thread-safe: uses asyncio.create_task() for non-blocking DB writes.
    The engine itself holds no DB connection — it borrows the shared pool.
    """

    async def run(
        self,
        operation: str,
        coro: Awaitable[Any],
        org_id: Optional[str] = None,
        user_id: Optional[str] = None,
        plan: Optional[str] = None,
        monthly_limit: Optional[int] = None,
    ) -> Any:
        """
        Execute a Claude call through the CUU engine.

        Parameters
        ----------
        operation     : CUU operation key (must exist in CUU_COST_MAP)
        coro          : The awaitable Claude API call (already constructed)
        org_id        : Organisation ID for per-org usage tracking
        user_id       : Requesting user ID (for per-user breakdown logs)
        plan          : Subscription plan name (e.g. "GROWTH") — used for limit
                        lookup when monthly_limit is not provided directly
        monthly_limit : Override the plan-derived limit with an explicit value.
                        Pass -1 for unlimited (ENTERPRISE).

        Returns
        -------
        Whatever the awaitable returns (the raw Claude response object).

        Raises
        ------
        CUULimitExceeded  — when hard limits are enforced and the org is over quota.
        """
        cuu_cost = get_cuu_cost(operation)

        # ── Hard block check (120% emergency ceiling, admin-cleared only) ───────
        if org_id and self._is_hard_blocked(org_id):
            raise CUUHardBlocked(
                "Your organisation's AI access has been suspended by an administrator. "
                "Please contact support to restore access."
            )

        # ── Global platform cap (protects against unbounded API spend) ───────
        if _GLOBAL_MONTHLY_CUU_CAP > 0:
            self._check_global_cap()

        # ── Per-minute rate guards ────────────────────────────────────────────
        if org_id:
            self._check_rpm(org_id)
        if user_id:
            self._check_user_rpm(user_id)

        # ── Monthly limit + daily burst cap ───────────────────────────────────
        usage_ctx: Dict[str, Any] = {}
        if org_id:
            usage_ctx = await self._get_usage_context(
                org_id, plan=plan, monthly_limit=monthly_limit
            )
            limit = usage_ctx["monthly_limit"]
            used  = usage_ctx["used_this_month"]
            pct   = usage_ctx["pct_used"]

            if limit != -1:  # -1 = unlimited (ENTERPRISE)
                # 100 %+ — always block, regardless of OVERAGE_ALLOWED
                if used >= limit:
                    raise CUULimitExceeded(
                        "Your organisation has reached its monthly AI usage limit. "
                        "Please upgrade your plan to continue using Cathy. "
                        "Go to **Billing → Change Plan** in your admin dashboard."
                    )

                # Daily burst cap — prevents draining monthly quota in one day
                daily_cap = int(limit * _DAILY_BURST_PCT / 100)
                if daily_cap > 0:
                    self._check_daily_burst(org_id, daily_cap)

        # ── Execute ───────────────────────────────────────────────────────────
        t0 = time.monotonic()
        result = await coro
        elapsed_ms = int((time.monotonic() - t0) * 1000)

        # Increment per-minute counters and global cap after a successful call
        if org_id:
            self._increment_rpm(org_id)
            self._increment_daily_burst(org_id)
        if user_id:
            self._increment_user_rpm(user_id)
        if _GLOBAL_MONTHLY_CUU_CAP > 0:
            self._increment_global_cap(cuu_cost)

        # ── Post-call 120 % hard-block check ─────────────────────────────────
        # Usage is logged after the call (reconciliation lag) — it's possible for
        # an org to drift past 120 % before the check at the top of run() fires.
        # Detect it here and lock the org for admin review.
        if org_id and usage_ctx:
            new_used = usage_ctx.get("used_this_month", 0) + cuu_cost
            limit    = usage_ctx.get("monthly_limit", -1)
            if limit != -1 and limit > 0:
                new_pct = (new_used / limit) * 100
                if new_pct >= _HARD_BLOCK_PCT and not self._is_hard_blocked(org_id):
                    self._set_hard_block(org_id)
                    logger.critical(
                        "Org %s exceeded %.0f%% CUU (%.1f%%) — hard block applied",
                        org_id, _HARD_BLOCK_PCT, new_pct,
                    )

        # ── Fire-and-forget logging (no added latency) ────────────────────────
        if org_id:
            asyncio.create_task(
                self._log_usage(
                    org_id=org_id,
                    user_id=user_id,
                    operation=operation,
                    cuu_cost=cuu_cost,
                    elapsed_ms=elapsed_ms,
                )
            )

        return result

    # ── Internal helpers ──────────────────────────────────────────────────────

    async def _get_usage_context(
        self,
        org_id: str,
        plan: Optional[str] = None,
        monthly_limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Fetch or derive the org's CUU usage context.
        Returns dict with keys: used_this_month, monthly_limit, pct_used, plan.
        Falls back gracefully if the DB is unavailable.
        """
        db = _db()
        used = 0
        resolved_limit = monthly_limit

        try:
            used = await db.get_org_cuu_usage(org_id) or 0
        except Exception as exc:
            logger.debug("Could not fetch CUU usage for org %s: %s", org_id, exc)

        if resolved_limit is None:
            # Try to read monthly_cuu_limit from the subscriptions table
            try:
                sub = await db.get_subscription_info(org_id)
                if sub:
                    resolved_plan = plan or sub.get("plan", "STARTER")
                    db_limit = sub.get("monthly_cuu_limit")
                    if db_limit is not None:
                        resolved_limit = int(db_limit)
                    else:
                        resolved_limit = get_plan_cuu_limit(resolved_plan)
                    plan = resolved_plan
                else:
                    resolved_limit = get_plan_cuu_limit(plan or "STARTER")
            except Exception as exc:
                logger.debug("Could not fetch subscription for org %s: %s", org_id, exc)
                resolved_limit = get_plan_cuu_limit(plan or "STARTER")

        pct = 0.0
        if resolved_limit and resolved_limit > 0:
            pct = round(min((used / resolved_limit) * 100, 100.0), 1)

        return {
            "used_this_month": used,
            "monthly_limit": resolved_limit,
            "pct_used": pct,
            "plan": (plan or "STARTER").upper(),
        }

    async def _log_usage(
        self,
        org_id: str,
        user_id: Optional[str],
        operation: str,
        cuu_cost: int,
        elapsed_ms: int,
    ) -> None:
        """Write one row to cathy_usage_logs and upsert cathy_usage_summary."""
        try:
            await _db().log_cuu_usage(
                org_id=org_id,
                user_id=user_id,
                operation=operation,
                cuu_cost=cuu_cost,
                elapsed_ms=elapsed_ms,
            )
        except Exception as exc:
            # Never let a logging failure surface to the user
            logger.warning("CUU log write failed (non-fatal): %s", exc)

    # ── Usage context for prompt injection ────────────────────────────────────

    async def get_prompt_context(
        self,
        org_id: Optional[str],
        plan: Optional[str] = None,
        monthly_limit: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Return a dict suitable for injection into the system prompt.
        Returns None when org_id is missing (personal/no-org users).
        """
        if not org_id:
            return None
        try:
            return await self._get_usage_context(
                org_id, plan=plan, monthly_limit=monthly_limit
            )
        except Exception:
            return None

    # ── Self-awareness queries (used by Cathy tools) ──────────────────────────

    async def get_usage_summary(self, org_id: str) -> Dict[str, Any]:
        """Current month usage + limit for an org — used by Cathy tools."""
        return await self._get_usage_context(org_id)

    async def get_usage_breakdown(
        self, org_id: str, limit: int = 10
    ) -> list:
        """Per-operation CUU breakdown for an org — used by Cathy tools."""
        try:
            return await _db().get_org_cuu_breakdown(org_id, limit=limit)
        except Exception as exc:
            logger.debug("CUU breakdown error for org %s: %s", org_id, exc)
            return []

    async def get_usage_history(
        self, org_id: str, days: int = 30, limit: int = 100
    ) -> list:
        """Raw usage log entries for an org — used by /cathy/usage/history endpoint."""
        try:
            return await _db().get_org_cuu_history(org_id, days=days, limit=limit)
        except Exception as exc:
            logger.debug("CUU history error for org %s: %s", org_id, exc)
            return []

    # ── Rate guard helpers ────────────────────────────────────────────────────

    def _rpm_key(self, org_id: str) -> str:
        bucket = int(time.time() / 60)  # changes every minute
        return f"cathy:rpm:{org_id}:{bucket}"

    def _check_rpm(self, org_id: str) -> None:
        """Raise CUURateLimitExceeded if the org has exceeded _MAX_RPM this minute."""
        r = _get_redis()
        if not r:
            return  # Fail open when Redis is unavailable
        try:
            count = r.get(self._rpm_key(org_id))
            if count and int(count) >= _MAX_RPM:
                logger.warning("Org %s hit per-minute rate limit (%d rpm)", org_id, _MAX_RPM)
                raise CUURateLimitExceeded(
                    f"AI request rate limit reached ({_MAX_RPM} requests/minute). "
                    "Please wait a moment before trying again."
                )
        except CUURateLimitExceeded:
            raise
        except Exception:
            pass  # Redis error — fail open

    def _increment_rpm(self, org_id: str) -> None:
        """Increment the per-minute counter and set TTL=65s on first increment."""
        r = _get_redis()
        if not r:
            return
        try:
            key = self._rpm_key(org_id)
            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, 65)  # slightly longer than a minute to avoid edge-case drops
            pipe.execute()
        except Exception:
            pass

    # ── Global platform cap ───────────────────────────────────────────────────

    def _global_cap_key(self) -> str:
        month = time.strftime("%Y-%m", time.gmtime())
        return f"cathy:global:{month}"

    def _check_global_cap(self) -> None:
        """Raise CUUGlobalCapExceeded if total platform CUU this month hits the cap."""
        r = _get_redis()
        if not r:
            return
        try:
            raw = r.get(self._global_cap_key())
            if raw and int(raw) >= _GLOBAL_MONTHLY_CUU_CAP:
                logger.critical(
                    "Global CUU cap reached (%d). Halting all AI calls.", _GLOBAL_MONTHLY_CUU_CAP
                )
                raise CUUGlobalCapExceeded(
                    "Platform AI capacity is temporarily exhausted. Please try again later."
                )
        except CUUGlobalCapExceeded:
            raise
        except Exception:
            pass

    def _increment_global_cap(self, cuu_cost: int) -> None:
        r = _get_redis()
        if not r:
            return
        try:
            key = self._global_cap_key()
            pipe = r.pipeline()
            pipe.incrby(key, cuu_cost)
            pipe.expire(key, 35 * 24 * 3600)   # 35 days
            pipe.execute()
        except Exception:
            pass

    # ── Dynamic max_tokens based on remaining budget ──────────────────────────

    @staticmethod
    def max_tokens_for_budget(pct_used: float) -> int:
        """
        Scale down max_tokens as the org's monthly budget is consumed.
        Reduces response verbosity (and cost) as the limit approaches.
        """
        if pct_used >= 95:
            return 256
        if pct_used >= 80:
            return 512
        if pct_used >= 60:
            return 768
        return 1024

    # ── Per-user rate guard ───────────────────────────────────────────────────

    def _user_rpm_key(self, user_id: str) -> str:
        bucket = int(time.time() / 60)
        return f"cathy:user_rpm:{user_id}:{bucket}"

    def _check_user_rpm(self, user_id: str) -> None:
        """Raise CUURateLimitExceeded if this user has exceeded _MAX_USER_RPM."""
        r = _get_redis()
        if not r:
            return
        try:
            count = r.get(self._user_rpm_key(user_id))
            if count and int(count) >= _MAX_USER_RPM:
                logger.warning("User %s hit per-minute rate limit (%d rpm)", user_id, _MAX_USER_RPM)
                raise CUURateLimitExceeded(
                    f"You are sending AI requests too quickly ({_MAX_USER_RPM}/minute limit). "
                    "Please wait a moment before trying again."
                )
        except CUURateLimitExceeded:
            raise
        except Exception:
            pass

    def _increment_user_rpm(self, user_id: str) -> None:
        r = _get_redis()
        if not r:
            return
        try:
            key = self._user_rpm_key(user_id)
            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, 65)
            pipe.execute()
        except Exception:
            pass

    # ── Daily burst cap ───────────────────────────────────────────────────────

    def _daily_burst_key(self, org_id: str) -> str:
        # Key rotates every calendar day (UTC)
        day = int(time.time() / 86400)
        return f"cathy:daily:{org_id}:{day}"

    def _check_daily_burst(self, org_id: str, daily_cap: int) -> None:
        """Raise CUUDailyBurstExceeded if the org has consumed ≥ daily_cap CUU today."""
        r = _get_redis()
        if not r:
            return
        try:
            raw = r.get(self._daily_burst_key(org_id))
            if raw and int(raw) >= daily_cap:
                logger.warning(
                    "Org %s hit daily burst cap (%d CUU today)", org_id, daily_cap
                )
                raise CUUDailyBurstExceeded(
                    f"Your organisation has used its daily AI capacity ({_DAILY_BURST_PCT:.0f}% of monthly limit). "
                    "Usage will resume tomorrow."
                )
        except CUUDailyBurstExceeded:
            raise
        except Exception:
            pass

    def _increment_daily_burst(self, org_id: str) -> None:
        """Add this call's CUU cost to today's counter. TTL = 25 hours."""
        r = _get_redis()
        if not r:
            return
        try:
            key = self._daily_burst_key(org_id)
            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, 90_000)  # 25 hours — enough to cover midnight boundary
            pipe.execute()
        except Exception:
            pass

    async def should_downgrade_model(self, org_id: Optional[str]) -> bool:
        """
        Returns True when the org has used ≥ CATHY_DOWNGRADE_PCT% of its monthly limit.
        At this threshold, complex chat requests are automatically routed to the fast
        (Haiku) model to conserve remaining CUU budget.
        """
        if not org_id:
            return False
        try:
            ctx = await self._get_usage_context(org_id)
            return ctx["pct_used"] >= _DOWNGRADE_PCT
        except Exception:
            return False

    async def is_expensive_op_blocked(self, org_id: Optional[str], tool_name: str) -> bool:
        """
        Returns True when the org is at ≥ 90% usage and the requested tool is
        in the expensive-operations list.  At this threshold, vision, AI matching,
        and heavy analytics tools are suspended to conserve remaining budget.
        """
        if tool_name not in _EXPENSIVE_TOOLS:
            return False
        if not org_id:
            return False
        try:
            ctx = await self._get_usage_context(org_id)
            return ctx["pct_used"] >= 90.0
        except Exception:
            return False

    # ── Hard block (120 % emergency ceiling) ─────────────────────────────────

    @staticmethod
    def _hard_block_key(org_id: str) -> str:
        return f"cuu:hard_blocked:{org_id}"

    def _is_hard_blocked(self, org_id: str) -> bool:
        r = _get_redis()
        if not r:
            return False
        try:
            return bool(r.exists(self._hard_block_key(org_id)))
        except Exception:
            return False

    def _set_hard_block(self, org_id: str) -> None:
        """Set the hard-block flag.  Requires admin action to clear."""
        r = _get_redis()
        if not r:
            return
        try:
            # No TTL — only admin can clear via POST /admin/cathy/clear-hard-block/:orgId
            r.set(self._hard_block_key(org_id), "1")
        except Exception:
            pass

    def clear_hard_block(self, org_id: str) -> bool:
        """Delete the hard-block flag.  Returns True if a key was removed."""
        r = _get_redis()
        if not r:
            return False
        try:
            return bool(r.delete(self._hard_block_key(org_id)))
        except Exception:
            return False


# ── Custom exceptions ─────────────────────────────────────────────────────────

class CUULimitExceeded(Exception):
    """Raised when an org has reached 100% of its monthly CUU limit."""

class CUURateLimitExceeded(Exception):
    """Raised when an org or user exceeds the per-minute request rate."""

class CUUDailyBurstExceeded(Exception):
    """Raised when an org exceeds the daily burst cap (CATHY_DAILY_BURST_PCT of monthly limit)."""

class CUUGlobalCapExceeded(Exception):
    """Raised when the platform-wide monthly CUU ceiling is reached."""

class CUUHardBlocked(Exception):
    """Raised when an org is hard-blocked at 120%+ usage — requires admin clearance."""

class CUUExpensiveOpBlocked(Exception):
    """Raised when an expensive tool is requested at ≥ 90% usage."""


# ── Singleton ─────────────────────────────────────────────────────────────────

_engine: Optional[CathyEngine] = None


def get_engine() -> CathyEngine:
    """Return the shared CathyEngine singleton."""
    global _engine
    if _engine is None:
        _engine = CathyEngine()
    return _engine
