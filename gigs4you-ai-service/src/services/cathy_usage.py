"""
Cathy Usage Unit (CUU) definitions for Gigs4You AI Service.

A CUU is a normalised unit that abstracts the real cost of an AI operation.
All values are configurable — tune them as model pricing or usage patterns evolve.

IMPORTANT: Never expose model names, token counts, or raw dollar costs to users.
Surface only "AI usage", "AI capacity", and "CUU" terminology.
"""

import os
from typing import Dict, Tuple

# ── CUU cost map ──────────────────────────────────────────────────────────────
#
# Each entry: operation_type -> (min_cuu, max_cuu)
# The actual cost charged for a call is the midpoint, rounded to 1 decimal place.
# min/max exist so callers can show a conservative estimate before execution.
#
# Tuning guide:
#   - Fast-model (Haiku) calls are cheap: 1–3 CUU
#   - Chat (Sonnet) with tool loops: 5–20 CUU depending on turns
#   - Vision calls cost more due to image pre-processing: bump by ~50%
#   - Batch/matching calls over many candidates: scale with N workers
#
CUU_COST_MAP: Dict[str, Tuple[int, int]] = {
    # ── Chat ──────────────────────────────────────────────────────────────────
    "chat_simple":          (3,  6),   # Haiku, no tool use, short message
    "chat_complex":         (8, 16),   # Sonnet, complex query or multi-tool
    "chat_tool_loop":       (5, 10),   # each additional tool-loop round
    # ── Job / Task parsing ────────────────────────────────────────────────────
    "parse_job_intent":     (2,  4),   # Haiku, structured extraction
    "parse_task_intent":    (2,  4),   # Haiku, structured extraction
    # ── Pricing ───────────────────────────────────────────────────────────────
    "suggest_job_pricing":  (3,  5),   # Haiku, pricing recommendation
    # ── Matching ──────────────────────────────────────────────────────────────
    "match_workers":        (5, 12),   # Haiku, scales with candidate count
    # ── Vision ────────────────────────────────────────────────────────────────
    "verify_completion_photo": (6, 10), # Haiku + image, vision call
    # ── Narratives / recommendations ─────────────────────────────────────────
    "generate_agent_narrative":    (3,  6),  # Haiku, short generation
    "recommend_subscription_plan": (3,  6),  # Haiku, recommendation
    "generate_insights":           (4,  8),  # Haiku, analytics summary
}

_CUU_MIDPOINT_CACHE: Dict[str, int] = {}

def get_cuu_cost(operation: str) -> int:
    """
    Return the CUU cost for an operation (midpoint of its range).
    Unknown operations default to 5 CUU — conservative but not punishing.
    """
    if operation not in _CUU_MIDPOINT_CACHE:
        lo, hi = CUU_COST_MAP.get(operation, (5, 5))
        _CUU_MIDPOINT_CACHE[operation] = round((lo + hi) / 2)
    return _CUU_MIDPOINT_CACHE[operation]


def get_cuu_range(operation: str) -> Tuple[int, int]:
    """Return (min, max) CUU range for an operation."""
    return CUU_COST_MAP.get(operation, (5, 5))


# ── Plan CUU limits ───────────────────────────────────────────────────────────
#
# Monthly CUU allowances per subscription plan.
# These are ALSO stored in the subscriptions table as `monthly_cuu_limit`
# (added via NestJS migration). The values here are the authoritative defaults
# used when the DB row has no limit set yet, or for the FREE plan.
#
PLAN_CUU_LIMITS: Dict[str, int] = {
    "FREE":       200,    # Very light usage — enough for basic queries
    "STARTER":    800,    # 15 agents, 30 jobs — moderate Cathy usage
    "GROWTH":    4000,    # 50 agents, 100 jobs — active teams
    "SCALE":    15000,    # 200 agents, 500 jobs — heavy daily usage
    "ENTERPRISE": -1,     # -1 = unlimited (configurable per org in DB)
}

# Environment override: set ENTERPRISE_CUU_LIMIT to a positive int to cap it.
_ENTERPRISE_LIMIT_ENV = int(os.getenv("ENTERPRISE_CUU_LIMIT", "0"))
if _ENTERPRISE_LIMIT_ENV > 0:
    PLAN_CUU_LIMITS["ENTERPRISE"] = _ENTERPRISE_LIMIT_ENV


def get_plan_cuu_limit(plan: str) -> int:
    """
    Return the monthly CUU limit for a plan name.
    Case-insensitive. Falls back to STARTER limit for unknown plans.
    """
    return PLAN_CUU_LIMITS.get(plan.upper(), PLAN_CUU_LIMITS["STARTER"])


# ── Overage behaviour ─────────────────────────────────────────────────────────
#
# OVERAGE_ALLOWED=true  → soft limit: warn but still process the request
# OVERAGE_ALLOWED=false → hard limit: reject requests over the monthly cap
#
# Default: soft limit (True) — avoids surprising production users with hard blocks.
# Set CATHY_OVERAGE_ALLOWED=false to enforce hard cuts.
#
OVERAGE_ALLOWED: bool = os.getenv("CATHY_OVERAGE_ALLOWED", "true").lower() != "false"


# ── Warning thresholds ────────────────────────────────────────────────────────
#
# Cathy will proactively warn users when usage crosses these usage percentages.
# Override via CATHY_WARN_PCT (comma-separated, e.g. "70,90").
#
def _parse_warn_pcts() -> list:
    raw = os.getenv("CATHY_WARN_PCT", "80,90")
    try:
        return sorted(int(x.strip()) for x in raw.split(",") if x.strip().isdigit())
    except Exception:
        return [70, 90]

WARN_THRESHOLDS: list = _parse_warn_pcts()
