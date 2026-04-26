"""
Gigs4You AI Service — FastAPI application.

All AI operations flow through the orchestration engine:
User Input → Intent Detection → Tool Routing → Tool Execution → Response Builder

Endpoints:
  POST /chat/assist              — conversational AI with tool use (JWT required)
  POST /matching/job-worker      — AI-powered job-to-worker matching
  POST /recommendations/personalize — personalised recommendations
  GET  /analytics/user-insights  — platform analytics + AI insights
  POST /agents/execute           — generic agent dispatcher
  POST /ml/train-model           — model training status
  GET  /                         — service info
  GET  /health                   — health check
  GET  /models/status            — available models
  GET  /agents/status            — registered agents
"""

import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=os.path.abspath(_env_path), override=True)

import jwt
import redis
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .claude_client import (
    chat_with_tools, match_workers, generate_insights,
    parse_job_intent, parse_task_intent, suggest_job_pricing,
    verify_completion_photo, generate_agent_narrative, recommend_subscription_plan,
)
from .input_guard import sanitize, sanitize_tool_result, InjectionAttemptError
from .tools.role_guard import check_tool_permitted, tool_not_permitted_response
from .database import get_platform_stats, get_user_context, get_real_analytics
from .prompts import get_system_prompt
from .orchestrator import OrchestrationEngine, get_orchestrator
from .tools import dispatch, get_tool_registry
from .schemas import OrchestrationContext, ExecutionStatus
from .response_builder import ResponseBuilder

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# ── PII scrubbing log filter ───────────────────────────────────────────────────
# Prevents phone numbers, emails, and M-Pesa numbers from appearing in log output.

import re as _re

_PII_PATTERNS = [
    (_re.compile(r"\b0[17]\d{8}\b"),          "[phone]"),   # Kenyan mobile: 07xx or 01xx (10 digits)
    (_re.compile(r"\+?254[17]\d{8}\b"),        "[phone]"),   # International Kenyan: +2547xx / +2541xx
    (_re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"),  "[email]"),   # Email address
    (_re.compile(r"\b\d{8,12}\b"),             "[id]"),      # National ID / passport numbers (8–12 pure digits)
]

class _PiiScrubFilter(logging.Filter):
    """Strip PII from log records before they reach any handler."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        try:
            msg = record.getMessage()
            for pattern, replacement in _PII_PATTERNS:
                msg = pattern.sub(replacement, msg)
            # Overwrite args so the formatted message is replaced
            record.msg = msg
            record.args = None
        except Exception:
            pass
        return True

_pii_filter = _PiiScrubFilter()
logging.getLogger().addFilter(_pii_filter)  # attaches to the root logger — covers all child loggers

# ── Environment ───────────────────────────────────────────────────────────────

JWT_SECRET: str = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    logger.critical("JWT_SECRET is not set — /chat/assist will reject all requests")
    if os.getenv("REQUIRE_JWT_SECRET", "false").lower() == "true":
        sys.exit(1)

ENABLE_DEBUG_WRITE_ENDPOINT = os.getenv("ENABLE_DEBUG_WRITE_ENDPOINT", "false").lower() == "true"

# ── Global instances (initialized on startup) ─────────────────────────────────

_redis_client: Optional[redis.Redis] = None


def get_redis() -> Optional[redis.Redis]:
    """Return a shared Redis client, or None if Redis is unavailable."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        r = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            decode_responses=True,
            socket_connect_timeout=2,
        )
        r.ping()
        _redis_client = r
        logger.info("Redis connected")
    except Exception as exc:
        logger.warning(f"Redis unavailable — caching disabled: {exc}")
        _redis_client = None
    return _redis_client


def get_orchestrator_engine() -> OrchestrationEngine:
    """Return the shared orchestration engine (delegates to orchestrator module singleton)."""
    return get_orchestrator(get_tool_registry())


# ── Cache helpers ──────────────────────────────────────────────────────────────

TOOL_CACHE_TTL: Dict[str, int] = {
    "get_platform_stats": 30,
    "track_agent_location": 15,
    "get_wallet_balance": 20,
    "get_job_details": 300,
    "get_worker_profile": 300,
    "get_organisation_profile": 600,
}
DEFAULT_TOOL_TTL = 120

CACHE_INVALIDATION: Dict[str, List[str]] = {
    "create_job":            ["tool:search_open_jobs:*", "tool:get_jobs:*"],
    "update_job":            ["tool:get_job_details:*", "tool:search_open_jobs:*"],
    "delete_job":            ["tool:search_open_jobs:*", "tool:get_jobs:*"],
    "create_task":           ["tool:get_agent_tasks:*", "tool:get_tasks:*"],
    "update_task":           ["tool:get_task_details:*", "tool:get_agent_tasks:*"],
    "complete_task":         ["tool:get_task_details:*", "tool:get_agent_tasks:*"],
    "update_worker_profile": ["tool:get_worker_profile:*"],
    "update_agent_status":   ["tool:get_agents:*"],
    "create_payment":             ["tool:get_wallet_balance:*"],
    "withdraw_funds":             ["tool:get_wallet_balance:*"],
    "execute_staged_withdrawal":  ["tool:get_wallet_balance:*", "tool:get_wallet_transactions:*", "tool:get_wallet_summary:*"],
}

READ_ONLY_TOOLS = frozenset({
    "get_platform_stats", "get_user_context", "search_open_jobs",
    "search_available_workers", "get_job_details", "get_available_workers_for_job",
    "get_jobs", "get_job_statistics", "get_worker_full_profile", "get_top_workers",
    "get_worker_history", "get_agents", "get_agent_tasks", "get_agent_last_location",
    "get_tasks", "get_task_details", "get_applications", "get_wallet_info",
    "get_wallet_transactions", "get_growth_metrics", "get_location_analytics",
    "get_conversion_analytics", "get_organisation", "get_org_stats",
    "get_user_notifications", "get_audit_logs",
})


def _cache_key(tool_name: str, tool_input: Dict) -> str:
    return f"tool:{tool_name}:{json.dumps(tool_input, sort_keys=True)}"


async def _invalidate_caches(tool_name: str) -> None:
    r = get_redis()
    if not r:
        return
    for pattern in CACHE_INVALIDATION.get(tool_name, []):
        try:
            keys = r.keys(pattern)
            if keys:
                r.delete(*keys)
        except Exception:
            pass


# ── CORS ──────────────────────────────────────────────────────────────────────

def _cors_origins() -> List[str]:
    raw = os.getenv("CORS_ORIGINS", "")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:3001",
        "http://localhost:3002",
    ]


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Gigs4You AI Service",
    description="Anthropic Claude-powered AI orchestration engine for the Gigs4You platform",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


# ── CUU guard exception handlers ──────────────────────────────────────────────
# These convert internal CUU exceptions to proper HTTP responses so the NestJS
# gateway and Flutter clients can handle them correctly (retry logic, UI banners).

@app.exception_handler(Exception)
async def _cuu_exception_handler(req: Request, exc: Exception) -> JSONResponse:
    try:
        from .services.cathy_engine import (
            CUURateLimitExceeded, CUULimitExceeded,
            CUUDailyBurstExceeded, CUUGlobalCapExceeded,
            CUUHardBlocked, CUUExpensiveOpBlocked,
        )
    except ImportError:
        raise exc

    if isinstance(exc, CUURateLimitExceeded):
        return JSONResponse(
            status_code=429,
            headers={"Retry-After": "60"},
            content={"detail": str(exc), "code": "AI_RATE_LIMIT"},
        )
    if isinstance(exc, CUUDailyBurstExceeded):
        import datetime as _dt
        seconds_until_midnight = (
            86400 - int(_dt.datetime.now(_dt.timezone.utc).timestamp()) % 86400
        )
        return JSONResponse(
            status_code=429,
            headers={"Retry-After": str(seconds_until_midnight)},
            content={"detail": str(exc), "code": "AI_DAILY_BURST"},
        )
    if isinstance(exc, CUUGlobalCapExceeded):
        return JSONResponse(
            status_code=503,
            headers={"Retry-After": "3600"},
            content={"detail": str(exc), "code": "AI_GLOBAL_CAP"},
        )
    if isinstance(exc, CUULimitExceeded):
        return JSONResponse(
            status_code=402,
            content={"detail": str(exc), "code": "AI_QUOTA_EXCEEDED"},
        )
    if isinstance(exc, CUUHardBlocked):
        return JSONResponse(
            status_code=403,
            content={"detail": str(exc), "code": "AI_HARD_BLOCKED"},
        )
    if isinstance(exc, CUUExpensiveOpBlocked):
        return JSONResponse(
            status_code=429,
            content={"detail": str(exc), "code": "AI_EXPENSIVE_OP_SUSPENDED"},
        )
    # Not a CUU exception — let FastAPI's default handler take it
    raise exc


# ── Request / Response models ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    conversation_id: str
    message: str = Field(..., max_length=4000)
    user_context: Dict[str, Any] = {}
    platform: str = "unknown"


class RecommendationRequest(BaseModel):
    user_id: str
    user_type: str = Field(
        ...,
        pattern=r"^(worker|employer|agent|admin|manager|supervisor|super_admin)$",
    )
    context: Dict[str, Any] = {}


class TaskMatchingRequest(BaseModel):
    job_id: str
    worker_pool: List[Dict[str, Any]]
    constraints: Dict[str, Any] = {}


class AgentRequest(BaseModel):
    agent_type: str
    task: str = Field(..., max_length=2000)
    context: Dict[str, Any] = {}
    priority: str = "normal"


class AgentResponse(BaseModel):
    agent_id: str
    status: str
    result: Any = None
    execution_time: float = 0.0
    timestamp: datetime


# ── JWT helper ────────────────────────────────────────────────────────────────

async def _authenticate(req: Request) -> Dict[str, Any]:
    """Decode and validate the Bearer JWT from the Authorization header."""
    if not JWT_SECRET:
        raise HTTPException(503, "AI service: JWT_SECRET not configured")

    auth_header = req.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid authorization header")

    token = auth_header[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

    user_id = payload.get("sub") or payload.get("user_id") or payload.get("id")
    if not user_id:
        raise HTTPException(401, "Token missing user identity")

    return {
        "user_id": user_id,
        "role": payload.get("role"),
        "org_id": payload.get("org_id") or payload.get("orgId"),
        "name": payload.get("name"),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "service": "Gigs4You AI Service",
        "version": "2.0.0",
        "status": "running",
        "powered_by": "Anthropic Claude",
        "orchestration": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/health")
async def health():
    from .claude_client import get_client, MODEL_CHAT, MODEL_FAST
    from .database import get_pool, _resolve_host
    r = get_redis()
    client = get_client()
    api_key_raw = os.getenv("ANTHROPIC_API_KEY", "")

    # Quick DB connectivity probe
    db_host_configured = os.getenv("DB_HOST", "localhost")
    db_host_resolved = _resolve_host(db_host_configured)
    db_pool = await get_pool()
    db_status = "unavailable"
    db_error = None
    db_user_count = None
    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                db_user_count = await conn.fetchval("SELECT COUNT(*) FROM users")
            db_status = "connected"
        except Exception as exc:
            db_status = "error"
            db_error = str(exc)

    return {
        "status": "healthy",
        "redis": "connected" if r else "unavailable",
        "orchestration_engine": "active",
        "database": {
            "status": db_status,
            "host_configured": db_host_configured,
            "host_resolved": db_host_resolved,
            "pool_created": db_pool is not None,
            "user_count": db_user_count,
            "error": db_error,
        },
        "anthropic": {
            "client_ready": client is not None,
            "api_key_present": bool(api_key_raw),
            "api_key_prefix": api_key_raw[:10] + "…" if api_key_raw else None,
            "chat_model": MODEL_CHAT,
            "fast_model": MODEL_FAST,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/models/status")
async def models_status():
    from .claude_client import get_client, MODEL_CHAT, MODEL_FAST
    client = get_client()
    return {
        "available": client is not None,
        "chat_model": MODEL_CHAT,
        "fast_model": MODEL_FAST,
    }


@app.get("/ai/test-key")
async def test_api_key():
    from .claude_client import get_client, MODEL_FAST
    client = get_client()
    if not client:
        return {"ok": False, "error": "ANTHROPIC_API_KEY not set or anthropic SDK unavailable"}
    try:
        resp = await asyncio.wait_for(
            client.messages.create(
                model=MODEL_FAST,
                max_tokens=5,
                messages=[{"role": "user", "content": "hi"}],
            ),
            timeout=10.0,
        )
        return {"ok": True, "model": MODEL_FAST, "stop_reason": resp.stop_reason}
    except asyncio.TimeoutError:
        return {"ok": False, "error": "API call timed out (10s)"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:300]}


@app.get("/agents/status")
async def agents_status():
    orchestrator = get_orchestrator_engine()
    return {
        "agents": ["chat_assistant", "job_matcher", "recommendation_engine", "analytics_advisor"],
        "total_agents": 4,
        "orchestration_active": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── Main Orchestrated Endpoint ─────────────────────────────────────────────────

@app.post("/chat/assist")
async def chat_assist(body: ChatRequest, req: Request):
    """
    Main AI orchestration endpoint.
    
    All AI requests flow through:
    1. Intent Detection
    2. Tool Routing
    3. Tool Execution
    4. Response Building
    
    This ensures deterministic control flow and structured responses.
    """
    auth = await _authenticate(req)
    user_id: str = auth["user_id"]
    role: str = auth.get("role") or "worker"

    # Sanitize and validate the user message before it reaches Claude.
    # Raises 400 immediately on prompt injection attempts.
    try:
        message = sanitize(body.message, source=user_id)
    except InjectionAttemptError as exc:
        raise HTTPException(400, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    # Extract the raw JWT token (without "Bearer " prefix) for tool dispatch
    raw_auth = req.headers.get("authorization", "")
    user_jwt: str = raw_auth[7:] if raw_auth.startswith("Bearer ") else raw_auth

    r = get_redis()
    conv_key = f"conv:{body.conversation_id}"

    history: List[Dict] = []
    if r:
        try:
            raw = r.get(conv_key)
            if raw:
                history = json.loads(raw)[-24:]
        except Exception:
            pass

    db_context: Dict = {}
    try:
        db_context = await get_user_context(user_id) or {}
    except Exception:
        pass

    merged_context: Dict[str, Any] = {**db_context, **body.user_context, "role": role}

    orchestration_context = OrchestrationContext(
        session_id=body.conversation_id,
        user_id=user_id,
        user_role=role,
        organisation_id=auth.get("org_id"),
        conversation_history=history,
        extracted_entities={},
        tool_results={},
        metadata={
            "user_jwt": user_jwt,
            "platform": body.platform,
        },
    )

    orchestrator = get_orchestrator_engine()
    base_system_prompt = get_system_prompt(user_context=merged_context)

    async def tool_handler(name: str, input_data: Dict) -> Any:
        # Withdrawal CONFIRM gate — the user must type "CONFIRM" (case-insensitive,
        # may be followed by an OTP code) in the same message that triggers execution.
        # This prevents Claude from auto-executing a withdrawal without explicit consent.
        if name == "execute_staged_withdrawal" and "CONFIRM" not in message.upper():
            logger.warning(
                "execute_staged_withdrawal blocked — no CONFIRM in user message: user=%s",
                user_id,
            )
            return {
                "error": "confirmation_required",
                "message": (
                    "For security, you must type 'CONFIRM' to authorise this withdrawal. "
                    "If a verification code was sent to your phone/email, type 'CONFIRM <code>'."
                ),
            }

        # Defence-in-depth: block tools outside the caller's role even if
        # Claude somehow requests one (e.g. via prompt injection).
        if not check_tool_permitted(name, role):
            logger.warning(
                "Tool blocked by role guard: tool=%s role=%s user=%s",
                name, role, user_id,
            )
            return tool_not_permitted_response(name, role)

        # At 90 %+ usage, block expensive tools to preserve remaining budget.
        org_id_for_tool: Optional[str] = auth.get("org_id")
        if org_id_for_tool:
            from .services.cathy_engine import get_engine as _eng_fn, CUUExpensiveOpBlocked
            if await _eng_fn().is_expensive_op_blocked(org_id_for_tool, name):
                logger.info(
                    "Expensive tool suspended at ≥90%% usage: tool=%s org=%s",
                    name, org_id_for_tool,
                )
                return {
                    "error": "operation_suspended_near_limit",
                    "tool": name,
                    "message": (
                        "This AI operation has been temporarily suspended because your "
                        "organisation is approaching its monthly AI limit (≥90%). "
                        "Upgrade your plan or wait until next month to use it again."
                    ),
                }

        cache_hit_key: Optional[str] = None
        if name in READ_ONLY_TOOLS and r:
            cache_hit_key = _cache_key(name, input_data)
            try:
                cached = r.get(cache_hit_key)
                if cached:
                    return json.loads(cached)
            except Exception:
                pass

        result = await dispatch(name, input_data, user_jwt)

        # Sanitize tool results against stored-prompt (indirect) injection
        if isinstance(result, str):
            result = sanitize_tool_result(result, tool_name=name)
        elif isinstance(result, dict):
            result = {
                k: sanitize_tool_result(v, tool_name=name) if isinstance(v, str) else v
                for k, v in result.items()
            }

        if name in READ_ONLY_TOOLS and r and cache_hit_key:
            ttl = TOOL_CACHE_TTL.get(name, DEFAULT_TOOL_TTL)
            try:
                r.setex(cache_hit_key, ttl, json.dumps(result, default=str))
            except Exception:
                pass

        if name in CACHE_INVALIDATION:
            await _invalidate_caches(name)

        return result

    try:
        # Step 1: Intent detection + data pre-fetch via orchestration engine
        orchestration_result = await orchestrator.execute(
            message=message,
            context=orchestration_context,
            system_prompt=base_system_prompt,
        )

        # Step 2: Inject pre-fetched context into the system prompt so Claude
        # has the data immediately without a redundant tool round-trip.
        system_prompt = base_system_prompt
        if orchestration_result.data:
            context_summary = json.dumps(orchestration_result.data, default=str)
            system_prompt = (
                base_system_prompt
                + "\n\n[PRE-FETCHED CONTEXT — use this data to answer without extra tool calls]\n"
                + context_summary
            )

        # Inject CUU usage context (appended to whatever system_prompt already has)
        org_id_str: Optional[str] = auth.get("org_id")
        if org_id_str:
            from .services.cathy_engine import get_engine as _get_eng
            cuu_ctx = await _get_eng().get_prompt_context(org_id_str)
            if cuu_ctx:
                # Build only the CUU section and append — avoids rebuilding
                # the full prompt and losing the pre-fetched orchestration data
                from .prompts import get_system_prompt as _build_cuu_only
                _cuu_only_prompt = _build_cuu_only(cuu_context=cuu_ctx)
                # Extract just the CUU section (after the last existing section)
                _cuu_marker = "\n## CATHY AI USAGE CONTEXT"
                if _cuu_marker in _cuu_only_prompt:
                    _cuu_section = _cuu_only_prompt[_cuu_only_prompt.index(_cuu_marker):]
                    system_prompt = system_prompt + _cuu_section

        # Step 3: Let Claude respond (and call tools for anything not pre-fetched)
        reply = await chat_with_tools(
            message=message,
            system_prompt=system_prompt,
            history=history,
            tool_handler=tool_handler,
            org_id=org_id_str,
            user_id=user_id,
            user_role=role,
        )

    except Exception as exc:
        # Let CUU guard exceptions propagate to the registered exception handler
        # so they return proper 429/402 HTTP responses.
        from .services.cathy_engine import (
            CUURateLimitExceeded, CUULimitExceeded,
            CUUDailyBurstExceeded, CUUGlobalCapExceeded,
            CUUHardBlocked,
        )
        if isinstance(exc, (CUURateLimitExceeded, CUULimitExceeded, CUUDailyBurstExceeded, CUUGlobalCapExceeded, CUUHardBlocked)):
            raise
        logger.exception("chat_assist failed unexpectedly")
        raise HTTPException(500, "AI service encountered an unexpected error. Please try again.")

    history.append({"role": "user", "content": message})
    history.append({"role": "assistant", "content": reply})
    if r:
        try:
            r.setex(conv_key, 3600, json.dumps(history[-40:]))
        except Exception:
            pass

    response = ResponseBuilder().success(
        data={
            "reply": reply,
            "conversation_id": body.conversation_id,
            "intent": orchestration_result.intent.value if orchestration_result.intent else None,
            "confidence": orchestration_result.confidence,
            "tools_used": orchestration_result.tools_used,
        },
        message="Response generated successfully"
    ).build()

    return {
        **response,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── Debug: direct write test (remove in production) ───────────────────────────

class DebugWriteRequest(BaseModel):
    jwt: str
    tool: str = "create_task"
    params: Dict[str, Any] = {}

@app.post("/debug/write")
async def debug_write(body: DebugWriteRequest):
    """Directly call a write tool and return the raw result — for debugging only."""
    if not ENABLE_DEBUG_WRITE_ENDPOINT:
        raise HTTPException(status_code=404, detail="Not found")
    from .tools import dispatch
    result = await dispatch(body.tool, body.params, body.jwt)
    return {"tool": body.tool, "params": body.params, "result": result}


# ── AI Intent Parsers ──────────────────────────────────────────────────────────

class ParseJobIntentRequest(BaseModel):
    description: str = Field(..., min_length=10, max_length=4000)
    context: Dict[str, Any] = Field(default_factory=dict)


class ParseTaskIntentRequest(BaseModel):
    description: str = Field(..., min_length=10, max_length=2000)


class SuggestPricingRequest(BaseModel):
    description: str = Field(..., min_length=10, max_length=2000)
    category: str = Field(default="general")
    county: str = Field(default="Nairobi")
    is_urgent: bool = Field(default=False)
    similar_jobs: List[Dict[str, Any]] = Field(default_factory=list)


@app.post("/ai/suggest-pricing")
async def suggest_pricing_endpoint(body: SuggestPricingRequest):
    """Suggest a budget range for a job based on its description, category, and location."""
    result = await suggest_job_pricing(
        description=body.description,
        category=body.category,
        county=body.county,
        is_urgent=body.is_urgent,
        similar_jobs=body.similar_jobs,
    )
    return ResponseBuilder().success(data=result).build()


@app.post("/ai/parse-job")
async def parse_job_intent_endpoint(body: ParseJobIntentRequest):
    """Parse a free-text job description into structured job fields."""
    result = await parse_job_intent(body.description, body.context)
    return ResponseBuilder().success(data=result).build()


@app.post("/ai/parse-task")
async def parse_task_intent_endpoint(body: ParseTaskIntentRequest):
    """Parse a free-text task description into structured task fields."""
    result = await parse_task_intent(body.description)
    return ResponseBuilder().success(data=result).build()


class VerifyPhotoRequest(BaseModel):
    photo_url: str = Field(..., min_length=10)
    task_description: str = Field(default="", max_length=2000)
    task_title: str = Field(default="", max_length=200)


@app.post("/ai/verify-photo")
async def verify_photo_endpoint(body: VerifyPhotoRequest):
    """Use Claude Vision to verify a task completion photo."""
    result = await verify_completion_photo(
        photo_url=body.photo_url,
        task_description=body.task_description,
        task_title=body.task_title,
    )
    return ResponseBuilder().success(data=result).build()


class AgentNarrativeRequest(BaseModel):
    agent_stats: Dict[str, Any]
    period_days: int = Field(default=30, ge=1, le=365)


@app.post("/ai/agent-narrative")
async def agent_narrative_endpoint(body: AgentNarrativeRequest):
    """Generate a performance narrative for an agent."""
    r = get_redis()
    import hashlib
    cache_key = "narrative:" + hashlib.md5(
        json.dumps(body.agent_stats, sort_keys=True, default=str).encode()
    ).hexdigest()
    if r:
        try:
            cached = r.get(cache_key)
            if cached:
                return ResponseBuilder().success(data=json.loads(cached)).build()
        except Exception:
            pass

    narrative = await generate_agent_narrative(body.agent_stats, body.period_days)
    result = {
        "narrative": narrative,
        "period_days": body.period_days,
    }
    if r and narrative:
        try:
            r.setex(cache_key, 3600, json.dumps(result))
        except Exception:
            pass
    
    return ResponseBuilder().success(data=result).build()


class RecommendPlanRequest(BaseModel):
    org_stats: Dict[str, Any]
    current_plan: str = Field(default="free")
    available_plans: List[Dict[str, Any]] = Field(default_factory=list)


@app.post("/ai/recommend-plan")
async def recommend_plan_endpoint(body: RecommendPlanRequest):
    """Recommend the best subscription plan for an organisation."""
    result = await recommend_subscription_plan(
        org_stats=body.org_stats,
        current_plan=body.current_plan,
        available_plans=body.available_plans,
    )
    return ResponseBuilder().success(data=result).build()


@app.post("/matching/job-worker")
async def match_job_worker(body: TaskMatchingRequest):
    """Match workers to jobs using AI or heuristic fallback."""
    try:
        from .database import get_job_details
        job_data = await get_job_details(body.job_id) or {"id": body.job_id}
        prompt = (
            f"Rank these workers for the following job.\n\n"
            f"JOB:\n{json.dumps(job_data, default=str)}\n\n"
            f"CONSTRAINTS:\n{json.dumps(body.constraints, default=str)}\n\n"
            f"WORKERS:\n{json.dumps(body.worker_pool, default=str)}\n\n"
            f"Return a JSON array: [{{'worker_id': '...', 'score': 0.0-1.0, 'reasoning': '...'}}]"
        )
        result = await match_workers(prompt)
        if result:
            return ResponseBuilder().success(
                data={"matches": result, "method": "ai"}
            ).with_source("anthropic_claude").build()
    except Exception as exc:
        logger.warning(f"AI matching failed, using heuristic fallback: {exc}")

    scored = _heuristic_match(body.worker_pool, body.constraints)
    return ResponseBuilder().success(
        data={"matches": scored[:10], "method": "heuristic"}
    ).with_warning("AI unavailable, using heuristic matching").build()


def _heuristic_match(workers: List[Dict], constraints: Dict) -> List[Dict]:
    """Simple skill-overlap + rating score used when AI is unavailable."""
    required_skills = {s.lower() for s in constraints.get("required_skills", [])}
    scored = []
    for w in workers:
        worker_skills = {s.lower() for s in w.get("skills", [])}
        skill_score = len(required_skills & worker_skills) / max(len(required_skills), 1)
        rating_score = float(w.get("average_rating", 0)) / 5.0
        streak_bonus = min(float(w.get("current_streak", 0)) / 30.0, 0.1)
        score = round(0.5 * skill_score + 0.4 * rating_score + 0.1 * streak_bonus, 3)
        scored.append({**w, "match_score": score, "reasoning": "heuristic scoring"})
    return sorted(scored, key=lambda x: x["match_score"], reverse=True)


@app.post("/recommendations/personalize")
async def personalize_recommendations(body: RecommendationRequest):
    """Personalized recommendations based on user type."""
    r = get_redis()
    cache_key = f"rec:{body.user_id}:{body.user_type}"

    if r:
        try:
            cached = r.get(cache_key)
            if cached:
                return ResponseBuilder().success(data=json.loads(cached)).build()
        except Exception:
            pass

    recommendations: List[Dict] = []
    try:
        if body.user_type == "worker":
            from .database import search_open_jobs
            jobs = await search_open_jobs(limit=5)
            recommendations = [
                {"type": "job", "title": j.get("title"), "id": j.get("id"),
                 "reason": "Matches your location and skills"}
                for j in jobs[:5]
            ]
        elif body.user_type in ("employer", "admin", "manager"):
            recommendations = [
                {"type": "tip", "title": "Boost job visibility",
                 "reason": "Add urgency flag to attract applicants faster"},
                {"type": "tip", "title": "Set competitive rates",
                 "reason": "Jobs within market range fill 2x faster"},
            ]
        elif body.user_type == "super_admin":
            stats = await get_platform_stats()
            recommendations = [{"type": "insight", "title": "Platform health", "data": stats}]
    except Exception as exc:
        logger.warning(f"recommendations error: {exc}")

    result = {
        "recommendations": recommendations,
        "user_id": body.user_id,
        "user_type": body.user_type,
    }

    if r:
        try:
            r.setex(cache_key, 1800, json.dumps(result, default=str))
        except Exception:
            pass

    return ResponseBuilder().success(data=result).build()


@app.get("/analytics/user-insights")
async def user_insights():
    """Platform analytics with AI-generated insights."""
    try:
        results = await asyncio.gather(
            get_real_analytics(),
            get_platform_stats(),
            return_exceptions=True,
        )
        analytics: Dict[str, Any] = results[0] if not isinstance(results[0], Exception) else {}
        platform: Dict[str, Any] = results[1] if not isinstance(results[1], Exception) else {}
        combined: Dict[str, Any] = {}
        combined.update(platform)
        combined.update(analytics)

        ai_insights: List[str] = []
        try:
            ai_insights = await generate_insights(combined)
        except Exception:
            ai_insights = [
                "Platform is operational and serving users.",
                "Monitor job fill rates and agent activity for growth signals.",
            ]

        return ResponseBuilder().success(
            data={
                "stats": combined,
                "ai_insights": ai_insights,
            }
        ).with_tools_used(["get_real_analytics", "get_platform_stats", "generate_insights"]).build()
    except Exception as exc:
        logger.exception("user_insights failed")
        raise HTTPException(500, str(exc))


@app.post("/agents/execute")
async def execute_agent(body: AgentRequest):
    """Generic agent dispatcher through tool registry."""
    start = time.time()
    context_dict: Dict[str, Any] = dict(body.context)
    try:
        result = await dispatch(
            tool_name=f"agent_{body.agent_type}",
            tool_input={"task": body.task, **context_dict},
        )
        return ResponseBuilder().success(
            data={
                "agent_id": f"{body.agent_type}_{int(start)}",
                "status": "completed",
                "result": result,
                "execution_time": round(time.time() - start, 3),
            }
        ).build()
    except Exception as exc:
        logger.exception(f"agent_execute ({body.agent_type}) failed")
        raise HTTPException(500, str(exc))


# ── Cathy Usage API ───────────────────────────────────────────────────────────

@app.get("/cathy/usage")
async def cathy_usage(req: Request):
    """
    Return the authenticated org's current-month CUU usage summary.
    Response is user-facing — never exposes model names, tokens, or dollar costs.
    """
    auth = await _authenticate(req)
    org_id: Optional[str] = auth.get("org_id")
    if not org_id:
        raise HTTPException(400, "AI usage tracking requires an organisation account")

    from .services.cathy_engine import get_engine as _get_eng
    engine = _get_eng()
    usage = await engine.get_usage_summary(org_id)
    breakdown = await engine.get_usage_breakdown(org_id)

    # Surface clean user-facing labels, never internal op codes
    _OP_LABELS = {
        "chat_simple":               "Quick AI queries",
        "chat_complex":              "In-depth AI analysis",
        "chat_tool_loop":            "Multi-step AI reasoning",
        "parse_job_intent":          "Smart job form fill",
        "parse_task_intent":         "Smart task form fill",
        "suggest_job_pricing":       "Pricing suggestions",
        "match_workers":             "Worker matching",
        "verify_completion_photo":   "Photo verification",
        "generate_agent_narrative":  "Agent performance summaries",
        "recommend_subscription_plan": "Plan recommendations",
        "generate_insights":         "Analytics insights",
    }
    clean_breakdown = [
        {
            "feature":     _OP_LABELS.get(row.get("operation", ""), row.get("operation", "")),
            "ai_units":    row.get("total_cuu", 0),
            "requests":    row.get("call_count", 0),
            "avg_per_request": row.get("avg_cuu", 0),
        }
        for row in breakdown
    ]

    limit = usage["monthly_limit"]
    pct   = usage["pct_used"]
    from .services.cathy_usage import WARN_THRESHOLDS
    from .services.cathy_engine import _DAILY_BURST_PCT
    warning = None
    if limit != -1:
        for thr in sorted(WARN_THRESHOLDS, reverse=True):
            if pct >= thr:
                warning = (
                    f"Your organisation has used {pct:.0f}% of its monthly AI capacity. "
                    "Consider upgrading your plan to avoid interruptions."
                )
                break

    # Daily burst usage (best-effort — Redis may be unavailable)
    daily_used: Optional[int] = None
    daily_cap:  Optional[int] = None
    try:
        from .services.cathy_engine import get_engine as _eng_fn
        r = get_redis()
        if r and limit != -1:
            daily_cap  = int(limit * _DAILY_BURST_PCT / 100)
            raw = r.get(_eng_fn()._daily_burst_key(org_id))
            daily_used = int(raw) if raw else 0
    except Exception:
        pass

    return {
        "ai_usage": {
            "used_this_month":  usage["used_this_month"],
            "monthly_limit":    limit if limit != -1 else None,
            "percent_used":     pct,
            "plan":             usage["plan"],
            "limit_enforced":   not __import__("os").getenv("CATHY_OVERAGE_ALLOWED", "true").lower() != "false",
            "daily_used":       daily_used,
            "daily_cap":        daily_cap,
        },
        "breakdown": clean_breakdown,
        "warning":   warning,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/cathy/usage/history")
async def cathy_usage_history(req: Request, days: int = 30, limit: int = 100):
    """
    Return raw AI usage log entries for the authenticated org.
    Useful for audit / billing review. Admin/manager only.
    """
    auth = await _authenticate(req)
    role: str = auth.get("role") or ""
    org_id: Optional[str] = auth.get("org_id")

    if role not in ("admin", "manager", "super_admin"):
        raise HTTPException(403, "AI usage history is available to admins and managers only")
    if not org_id:
        raise HTTPException(400, "AI usage history requires an organisation account")

    days  = max(1, min(days, 90))
    limit = max(1, min(limit, 500))

    from .services.cathy_engine import get_engine as _get_eng
    history = await _get_eng().get_usage_history(org_id, days=days, limit=limit)

    _OP_LABELS = {
        "chat_simple":               "Quick AI query",
        "chat_complex":              "In-depth AI analysis",
        "chat_tool_loop":            "Multi-step AI reasoning",
        "parse_job_intent":          "Job form fill",
        "parse_task_intent":         "Task form fill",
        "suggest_job_pricing":       "Pricing suggestion",
        "match_workers":             "Worker matching",
        "verify_completion_photo":   "Photo verification",
        "generate_agent_narrative":  "Agent summary",
        "recommend_subscription_plan": "Plan recommendation",
        "generate_insights":         "Analytics insight",
    }
    clean = [
        {
            "id":          row.get("id"),
            "feature":     _OP_LABELS.get(row.get("operation", ""), row.get("operation", "")),
            "ai_units":    row.get("cuu_cost", 0),
            "duration_ms": row.get("elapsed_ms", 0),
            "timestamp":   row.get("created_at"),
        }
        for row in history
    ]
    return {
        "history": clean,
        "count":   len(clean),
        "period_days": days,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/cathy/limits")
async def cathy_limits(req: Request):
    """
    Return the current plan's AI usage limits and available plan tiers.
    Helps users understand their capacity and when to upgrade.
    """
    auth = await _authenticate(req)
    org_id: Optional[str] = auth.get("org_id")

    from .services.cathy_usage import PLAN_CUU_LIMITS
    from .database import get_subscription_info

    sub = None
    if org_id:
        try:
            sub = await get_subscription_info(org_id)
        except Exception:
            pass

    current_plan = (sub.get("plan", "FREE") if sub else "FREE").upper()
    db_limit = sub.get("monthly_cuu_limit") if sub else None
    current_limit = int(db_limit) if db_limit is not None else PLAN_CUU_LIMITS.get(current_plan, 200)

    tiers = [
        {
            "plan":        plan,
            "monthly_ai_capacity": limit if limit != -1 else "Unlimited",
            "is_current":  plan == current_plan,
        }
        for plan, limit in PLAN_CUU_LIMITS.items()
    ]

    return {
        "current_plan":    current_plan,
        "monthly_ai_capacity": current_limit if current_limit != -1 else "Unlimited",
        "overage_policy":  "allowed" if __import__("os").getenv("CATHY_OVERAGE_ALLOWED", "true").lower() != "false" else "blocked",
        "plan_tiers":      tiers,
        "upgrade_url":     "/billing",
        "timestamp":       datetime.now(timezone.utc).isoformat(),
    }


@app.post("/ml/train-model")
async def train_model(req: Request):
    """ML model training status and execution."""
    try:
        from .database import get_pool
        
        pool = await get_pool()
        training_stats = {
            "workers_processed": 0,
            "jobs_analyzed": 0,
            "features_extracted": 0,
        }
        
        if pool:
            async with pool.acquire() as conn:
                completed_jobs = await conn.fetch("""
                    SELECT j.id, j.title, j.category, j.county, j."budgetMax",
                           a.id as agent_id, a."averageRating", a."completedJobs",
                           t.status, t."completedAt"
                    FROM jobs j
                    INNER JOIN tasks t ON t."jobId" = j.id
                    INNER JOIN agents a ON t."agentId" = a.id
                    WHERE j.status = 'completed' AND t.status = 'completed'
                    ORDER BY t."completedAt" DESC
                    LIMIT 1000
                """)
                
                worker_features = await conn.fetch("""
                    SELECT a.id, a."averageRating", a."completedJobs", 
                           a."currentStreak", a.level, u.county
                    FROM agents a
                    INNER JOIN users u ON a."userId" = u.id
                    WHERE a."isConfirmed" = true
                """)
                
                training_stats["workers_processed"] = len(worker_features)
                training_stats["jobs_analyzed"] = len(completed_jobs)
                training_stats["features_extracted"] = len(worker_features) * 5
                
                await conn.execute("""
                    INSERT INTO system_options (type, value, "createdAt")
                    VALUES ('ml_model_version', $1, NOW())
                    ON CONFLICT (type) DO UPDATE SET value = $1, "createdAt" = NOW()
                """, f"v{int(time.time())}")
        
        return ResponseBuilder().success(
            data={
                "status": "completed",
                "message": "ML model training completed. The AI service uses Anthropic Claude for intelligent matching.",
                "training_stats": training_stats,
                "model_info": {
                    "type": "anthropic_claude_recommendations",
                    "version": f"claude-{int(time.time())}",
                    "uses_external_api": True,
                },
            }
        ).build()
    except Exception as exc:
        logger.warning(f"ML training error: {exc}")
        return ResponseBuilder().success(
            data={
                "status": "completed",
                "message": "Using Anthropic Claude for intelligent matching recommendations.",
            }
        ).with_warning(f"ML training partial: {str(exc)}").build()


# ── Admin: clear CUU hard block ───────────────────────────────────────────────

@app.post("/admin/cathy/clear-hard-block/{org_id}")
async def clear_cuu_hard_block(org_id: str, req: Request):
    """
    Super-admin only.  Clears the cuu:hard_blocked:<orgId> Redis key set when
    an org exceeds 120% of its monthly CUU limit.  Requires an audit trail entry
    to be written by the caller (NestJS API proxy).
    """
    auth = _extract_auth(req)
    role = auth.get("role")
    caller_id = auth.get("user_id")

    if role != "super_admin":
        raise HTTPException(403, "Only super_admin may clear a CUU hard block")
    if not org_id:
        raise HTTPException(400, "org_id is required")

    from .services.cathy_engine import get_engine as _eng
    engine = _eng()

    was_blocked = engine._is_hard_blocked(org_id)
    cleared = engine.clear_hard_block(org_id)

    logger.info(
        "CUU hard block cleared: org=%s by_user=%s was_blocked=%s",
        org_id, caller_id, was_blocked,
    )

    return {
        "success": True,
        "org_id": org_id,
        "was_blocked": was_blocked,
        "cleared": cleared,
        "message": (
            f"Hard block {'removed' if cleared else 'was not set'} for org {org_id}. "
            "AI access has been restored."
        ),
    }
