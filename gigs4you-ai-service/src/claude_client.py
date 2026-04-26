"""
Anthropic Claude API wrapper for Gigs4You AI Service.

Provides:
- chat_with_tools()    — conversational AI with tool use + loop guard + timeout
- match_workers()      — structured JSON worker-ranking
- generate_insights()  — short bullet insights from analytics data
"""

import asyncio
import json
import logging
import os
import re
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    logger.warning("anthropic SDK not installed — AI features disabled")
    ANTHROPIC_AVAILABLE = False

# ── CUU engine (lazy import to avoid circular deps at module load) ─────────────
_engine_module: Optional[Any] = None

def _get_engine():
    global _engine_module
    if _engine_module is None:
        from .services.cathy_engine import get_engine
        _engine_module = get_engine()
    return _engine_module

# ── Safety limits ─────────────────────────────────────────────────────────────
MAX_TOOL_LOOPS: int = 5          # Claude may call at most this many tool rounds
API_TIMEOUT: float = 45.0        # Seconds before we give up on a Claude call

# ── Model aliases ─────────────────────────────────────────────────────────────
MODEL_CHAT = os.getenv("ANTHROPIC_CHAT_MODEL", "claude-sonnet-4-6")
MODEL_FAST = os.getenv("ANTHROPIC_FAST_MODEL", "claude-haiku-4-5-20251001")

# ── Keywords that signal a complex request → use Sonnet ──────────────────────
_COMPLEX_KEYWORDS = {
    "analyze", "analyse", "compare", "explain", "detailed", "breakdown",
    "report", "strategy", "recommend", "summarize", "summarise",
    "difference", "pros", "cons", "how do", "why does", "deep dive",
}

# ── Import all tool definitions from tools package (166+ tools) ───────────────
from .tools import CHAT_TOOLS
from .tools.role_guard import filter_tools_for_role

# ── Client singleton ──────────────────────────────────────────────────────────
_client: Optional[Any] = None


def get_client() -> Optional[Any]:
    """Return (or lazily create) the Anthropic async client."""
    global _client
    if not ANTHROPIC_AVAILABLE:
        return None
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            logger.error("ANTHROPIC_API_KEY not set")
            return None
        _client = anthropic.AsyncAnthropic(api_key=api_key)
    return _client


# ── Public API ────────────────────────────────────────────────────────────────

async def chat_with_tools(
    message: str,
    system_prompt: str,
    history: List[Dict[str, str]],
    tool_handler: Optional[Callable] = None,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
    plan: Optional[str] = None,
    monthly_cuu_limit: Optional[int] = None,
    user_role: Optional[str] = None,
) -> str:
    """
    Send a message to Claude with conversation history and optional tool use.

    Protections:
    - Tool call loop capped at MAX_TOOL_LOOPS (avoids infinite tool chains)
    - Each Claude call wrapped in asyncio.wait_for(timeout=API_TIMEOUT)
    - Auth errors propagated; all other errors return a safe fallback string
    - All calls tracked through the CUU engine (fire-and-forget async logging)
    """
    client = get_client()
    if not client:
        return _fallback_response(message)

    engine = _get_engine()

    # Auto-downgrade to Haiku when org has consumed ≥ 95 % of its monthly budget
    # This preserves remaining capacity for critical requests.
    if org_id and await engine.should_downgrade_model(org_id):
        model = MODEL_FAST
        logger.info("Auto-downgrade: org %s at ≥95%% CUU — routing to fast model", org_id)
    else:
        model = _pick_model(message)

    # Determine CUU operation type based on model selected
    cuu_op = "chat_complex" if model == MODEL_CHAT else "chat_simple"

    # Check limit and derive dynamic max_tokens before calling
    dynamic_max_tokens = 1024
    if org_id:
        from .services.cathy_engine import CUULimitExceeded
        try:
            usage_ctx = await engine._get_usage_context(
                org_id, plan=plan, monthly_limit=monthly_cuu_limit
            )
            limit = usage_ctx["monthly_limit"]
            used  = usage_ctx["used_this_month"]
            pct   = usage_ctx["pct_used"]

            if limit != -1 and used >= limit:
                from .services.cathy_usage import OVERAGE_ALLOWED
                if not OVERAGE_ALLOWED:
                    return (
                        "Your organisation has reached its monthly AI usage limit. "
                        "Please upgrade your plan to continue using Cathy. "
                        "Go to **Billing → Change Plan** in your admin dashboard."
                    )

            # Scale down max_tokens as budget is consumed
            dynamic_max_tokens = engine.max_tokens_for_budget(pct)
        except Exception:
            pass  # Fail open on limit-check errors

    # Build message list from history (last 12 turns)
    messages: List[Dict[str, Any]] = []
    for h in history[-12:]:
        role = h.get("role", "user")
        if role in ("user", "assistant"):
            messages.append({"role": role, "content": h["content"]})
    messages.append({"role": "user", "content": message})

    # Filter to only tools the caller's role may use — Claude never sees the rest
    allowed_tools = filter_tools_for_role(CHAT_TOOLS, user_role) if tool_handler else []
    tools = allowed_tools

    try:
        # Build kwargs conditionally — avoids referencing anthropic.NOT_GIVEN
        # when the SDK may not be bound (e.g. import failed).
        create_kwargs: Dict[str, Any] = {
            "model":      model,
            "max_tokens": dynamic_max_tokens,
            "system":     system_prompt,
            "messages":   messages,
        }
        if tools:
            create_kwargs["tools"] = tools

        # Route through the CUU engine (tracks cost + async logging)
        response = await engine.run(
            operation=cuu_op,
            coro=asyncio.wait_for(
                client.messages.create(**create_kwargs),
                timeout=API_TIMEOUT,
            ),
            org_id=org_id,
            user_id=user_id,
            plan=plan,
            monthly_limit=monthly_cuu_limit,
        )

        # ── Tool use loop (bounded) ───────────────────────────────────────────
        loop_count = 0
        while (
            response.stop_reason == "tool_use"
            and tool_handler
            and loop_count < MAX_TOOL_LOOPS
        ):
            loop_count += 1
            logger.info(f"Tool loop {loop_count}/{MAX_TOOL_LOOPS}")

            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    try:
                        result = await tool_handler(block.name, block.input)
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": json.dumps(result, default=str),
                            }
                        )
                    except Exception as exc:
                        logger.error(f"Tool '{block.name}' error: {exc}")
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": f"Tool returned an error: {exc}",
                                "is_error": True,
                            }
                        )

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

            # Each additional tool-loop round costs CUU too
            response = await engine.run(
                operation="chat_tool_loop",
                coro=asyncio.wait_for(
                    client.messages.create(
                        model=model,
                        max_tokens=dynamic_max_tokens,
                        system=system_prompt,
                        messages=messages,
                    ),
                    timeout=API_TIMEOUT,
                ),
                org_id=org_id,
                user_id=user_id,
            )

        return _extract_text(response)

    except asyncio.TimeoutError:
        logger.error(f"Claude chat timed out after {API_TIMEOUT}s")
        return "I'm taking too long to respond right now. Please try again in a moment."
    except Exception as exc:
        from .services.cathy_engine import (
            CUURateLimitExceeded, CUULimitExceeded,
            CUUDailyBurstExceeded, CUUGlobalCapExceeded,
            CUUHardBlocked,
        )
        # Re-raise CUU guard exceptions so the HTTP layer can return proper 429/402/403 responses
        if isinstance(exc, (CUURateLimitExceeded, CUULimitExceeded, CUUDailyBurstExceeded, CUUGlobalCapExceeded, CUUHardBlocked)):
            raise
        err_str = str(exc).lower()
        _log_api_error(exc, f"chat_with_tools (model={model})")

        if _is_auth_error(err_str):
            # Propagate auth failures so the operator sees them in service logs —
            # but show a polite message to the end user rather than a raw 503.
            logger.critical("Anthropic API key rejected — check ANTHROPIC_API_KEY in AI service env")
            return "I'm unable to connect right now. Please contact support if this persists."

        if _is_credits_error(err_str):
            logger.critical(
                "Anthropic account has no remaining credits — "
                "visit console.anthropic.com to top up."
            )
            return (
                "My AI capabilities are temporarily unavailable due to an account issue. "
                "Please contact the platform administrator."
            )

        if "rate_limit" in err_str or "overloaded" in err_str:
            logger.warning(f"Claude rate-limited / overloaded: {exc}")
            return "I'm a bit overwhelmed right now — please try again in a few seconds."

        if _is_model_error(err_str):
            logger.error(
                "Model '%s' is not accessible with your API key. "
                "Check model availability at console.anthropic.com/settings/limits",
                model,
            )
            return (
                "I'm having trouble accessing my AI model right now. "
                "Please try again later or contact support."
            )

        return "Sorry, I ran into a problem. Please try again or contact support if this persists."


async def match_workers(
    prompt: str,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Ask Claude (Haiku) to rank workers for a job.
    Returns [{"worker_id": ..., "score": ..., "reasoning": ...}] or raises on failure
    (caller should fall back to heuristic scoring).
    """
    client = get_client()
    if not client:
        return []

    try:
        response = await _get_engine().run(
            operation="match_workers",
            coro=asyncio.wait_for(
                client.messages.create(
                    model=MODEL_FAST,
                    max_tokens=2048,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=API_TIMEOUT,
            ),
            org_id=org_id,
            user_id=user_id,
        )
        return _parse_json_array(_extract_text(response))
    except asyncio.TimeoutError:
        logger.error("match_workers timed out")
        raise
    except Exception as exc:
        logger.error(f"match_workers error: {exc}")
        raise


async def suggest_job_pricing(
    description: str,
    category: str,
    county: str,
    is_urgent: bool = False,
    similar_jobs: list = [],
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Suggest a budget range for a job posting based on description, market context
    and historical similar-job data.
    Returns budgetMin, budgetMax, marketRate, rationale and confidence.
    """
    client = get_client()
    _empty = {"budgetMin": None, "budgetMax": None, "marketRate": None,
              "rationale": "AI pricing unavailable.", "confidence": 0.0}
    if not client:
        return _empty

    urgency_note = " The employer has flagged this as urgent." if is_urgent else ""
    history_note = ""
    if similar_jobs:
        avg = sum(j.get("budgetMax", 0) or 0 for j in similar_jobs) / len(similar_jobs)
        history_note = f" Historical average for similar jobs: KES {avg:,.0f}."

    prompt = (
        f"You are a pricing advisor for the Gigs4You freelance platform in Kenya.\n"
        f"Suggest a fair KES budget range for this job posting.\n\n"
        f"Category: {category}\nCounty: {county}{urgency_note}{history_note}\n"
        f"Description: \"{description}\"\n\n"
        f"Return ONLY a valid JSON object:\n"
        f"  budgetMin (integer KES),\n"
        f"  budgetMax (integer KES),\n"
        f"  marketRate (integer KES — typical midpoint for this work in Kenya),\n"
        f"  rationale (1–2 sentence explanation),\n"
        f"  confidence (float 0.0–1.0).\n\n"
        f"No markdown, no explanation outside the JSON."
    )

    try:
        response = await _get_engine().run(
            operation="suggest_job_pricing",
            coro=asyncio.wait_for(
                client.messages.create(
                    model=MODEL_FAST,
                    max_tokens=512,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=API_TIMEOUT,
            ),
            org_id=org_id,
            user_id=user_id,
        )
        text = _extract_text(response).strip()
        start, end = text.find("{"), text.rfind("}") + 1
        if 0 <= start < end:
            parsed = json.loads(text[start:end])
            parsed["confidence"] = max(0.0, min(1.0, float(parsed.get("confidence", 0.5))))
            return {**_empty, **parsed}
    except Exception as exc:
        logger.error(f"suggest_job_pricing error: {exc}")
    return _empty


async def parse_job_intent(
    description: str,
    context: Dict[str, Any] = {},
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Parse a free-text job description into structured job fields.
    Uses the fast model — must complete quickly to not block the UI.
    Returns a dict with confidence score and suggested field values.
    Falls back to an empty-but-valid structure on any failure.
    """
    client = get_client()
    _empty = {"suggestedTitle": None, "skills": [], "budgetMin": None, "budgetMax": None,
              "county": None, "isUrgent": False, "deadline": None, "confidence": 0.0}
    if not client or not description.strip():
        return _empty

    county_hint = context.get("county", "Kenya")
    prompt = (
        f"You are helping structure a job posting for the Gigs4You platform in Kenya.\n"
        f"Parse the following description and return ONLY a valid JSON object with these fields:\n"
        f"  suggestedTitle (string or null),\n"
        f"  skills (array of skill name strings — keep to 5 max),\n"
        f"  budgetMin (number in KES or null),\n"
        f"  budgetMax (number in KES or null),\n"
        f"  county (Kenyan county string or null),\n"
        f"  isUrgent (boolean),\n"
        f"  deadline (ISO date string or null),\n"
        f"  confidence (float 0.0–1.0 — how confident you are in your extraction).\n\n"
        f"Context: location hint = {county_hint}.\n"
        f"Description: \"{description}\"\n\n"
        f"Return ONLY the JSON object. No explanation, no markdown."
    )

    try:
        response = await _get_engine().run(
            operation="parse_job_intent",
            coro=asyncio.wait_for(
                client.messages.create(
                    model=MODEL_FAST,
                    max_tokens=512,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=API_TIMEOUT,
            ),
            org_id=org_id,
            user_id=user_id,
        )
        text = _extract_text(response).strip()
        # Try to parse the JSON object
        start = text.find("{")
        end = text.rfind("}") + 1
        if 0 <= start < end:
            parsed = json.loads(text[start:end])
            # Sanitize and clamp confidence
            parsed["confidence"] = max(0.0, min(1.0, float(parsed.get("confidence", 0.5))))
            return {**_empty, **parsed}
    except Exception as exc:
        logger.error(f"parse_job_intent error: {exc}")
    return _empty


async def parse_task_intent(
    description: str,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Parse a free-text task description into structured task fields.
    Returns checklist items, priority, estimated duration, and skills needed.
    """
    client = get_client()
    _empty = {"checklist": [], "priority": "medium", "estimatedMinutes": None,
              "requiredSkills": [], "confidence": 0.0}
    if not client or not description.strip():
        return _empty

    prompt = (
        f"You are helping structure a field task for the Gigs4You platform in Kenya.\n"
        f"Parse the following task description and return ONLY a valid JSON object:\n"
        f"  checklist (array of strings — actionable steps the agent must complete, max 8),\n"
        f"  priority (\"low\" | \"medium\" | \"high\" | \"urgent\"),\n"
        f"  estimatedMinutes (integer or null),\n"
        f"  requiredSkills (array of skill name strings — max 5),\n"
        f"  confidence (float 0.0–1.0).\n\n"
        f"Task description: \"{description}\"\n\n"
        f"Return ONLY the JSON object. No explanation, no markdown."
    )

    try:
        response = await _get_engine().run(
            operation="parse_task_intent",
            coro=asyncio.wait_for(
                client.messages.create(
                    model=MODEL_FAST,
                    max_tokens=512,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=API_TIMEOUT,
            ),
            org_id=org_id,
            user_id=user_id,
        )
        text = _extract_text(response).strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if 0 <= start < end:
            parsed = json.loads(text[start:end])
            parsed["confidence"] = max(0.0, min(1.0, float(parsed.get("confidence", 0.5))))
            return {**_empty, **parsed}
    except Exception as exc:
        logger.error(f"parse_task_intent error: {exc}")
    return _empty


async def verify_completion_photo(
    photo_url: str,
    task_description: str,
    task_title: str = "",
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Use Claude Vision to verify that a completion photo plausibly matches
    the task description. Returns { verified, confidence, note }.
    Non-blocking safe — returns { verified: None } on any failure.
    """
    client = get_client()
    _empty = {"verified": None, "confidence": 0.0, "note": "Vision verification unavailable."}
    if not client:
        return _empty

    prompt_text = (
        f"You are a quality-control reviewer for Gigs4You, a field-task platform in Kenya.\n"
        f"Task: \"{task_title}\" — {task_description}\n\n"
        f"Look at the photo and decide if it provides plausible evidence that this task was completed.\n"
        f"Return ONLY a valid JSON object:\n"
        f"  verified (boolean — true if photo shows task completion evidence),\n"
        f"  confidence (float 0.0–1.0),\n"
        f"  note (1 sentence explaining your decision).\n"
        f"No markdown, no explanation outside the JSON."
    )

    try:
        response = await _get_engine().run(
            operation="verify_completion_photo",
            coro=asyncio.wait_for(
                client.messages.create(
                    model=MODEL_FAST,
                    max_tokens=256,
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "url", "url": photo_url}},
                            {"type": "text", "text": prompt_text},
                        ],
                    }],
                ),
                timeout=API_TIMEOUT,
            ),
            org_id=org_id,
            user_id=user_id,
        )
        text = _extract_text(response).strip()
        start, end = text.find("{"), text.rfind("}") + 1
        if 0 <= start < end:
            parsed = json.loads(text[start:end])
            parsed["confidence"] = max(0.0, min(1.0, float(parsed.get("confidence", 0.5))))
            return {**_empty, **parsed}
    except Exception as exc:
        logger.error(f"verify_completion_photo error: {exc}")
    return _empty


async def generate_agent_narrative(
    agent_stats: Dict[str, Any],
    period_days: int = 30,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> str:
    """
    Generate a short (2–3 sentence) human-readable performance narrative for an agent.
    Used on the leaderboard and agent profile pages. Cached in Redis by the caller.
    Returns an empty string on failure.
    """
    client = get_client()
    if not client:
        return ""

    prompt = (
        f"You are writing a short performance summary for a field agent on the Gigs4You platform "
        f"in Kenya. Based on the stats below (last {period_days} days), write 2–3 encouraging but "
        f"honest sentences in plain English. Focus on strengths and, if relevant, one actionable tip.\n\n"
        f"Stats:\n{json.dumps(agent_stats, indent=2, default=str)}\n\n"
        f"Return ONLY the narrative text — no JSON, no bullet points, no heading."
    )

    try:
        response = await _get_engine().run(
            operation="generate_agent_narrative",
            coro=asyncio.wait_for(
                client.messages.create(
                    model=MODEL_FAST,
                    max_tokens=200,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=API_TIMEOUT,
            ),
            org_id=org_id,
            user_id=user_id,
        )
        return _extract_text(response).strip()
    except Exception as exc:
        logger.error(f"generate_agent_narrative error: {exc}")
        return ""


async def recommend_subscription_plan(
    org_stats: Dict[str, Any],
    current_plan: str,
    available_plans: List[Dict[str, Any]],
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Recommend the best subscription plan for an organisation based on usage.
    Returns { recommendedPlan, reason, confidence } or empty structure on failure.
    """
    client = get_client()
    _empty = {"recommendedPlan": None, "reason": "AI recommendation unavailable.", "confidence": 0.0}
    if not client:
        return _empty

    prompt = (
        f"You are a billing advisor for Gigs4You, a field-workforce management SaaS in Kenya.\n"
        f"Based on this organisation's usage stats and available plans, recommend the most "
        f"cost-effective plan that meets their needs.\n\n"
        f"Current plan: {current_plan}\n"
        f"Usage stats (last 30 days):\n{json.dumps(org_stats, indent=2, default=str)}\n\n"
        f"Available plans:\n{json.dumps(available_plans, indent=2, default=str)}\n\n"
        f"Return ONLY a valid JSON object:\n"
        f"  recommendedPlan (plan name string),\n"
        f"  reason (1–2 sentence explanation),\n"
        f"  confidence (float 0.0–1.0).\n"
        f"No markdown, no explanation outside the JSON."
    )

    try:
        response = await _get_engine().run(
            operation="recommend_subscription_plan",
            coro=asyncio.wait_for(
                client.messages.create(
                    model=MODEL_FAST,
                    max_tokens=256,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=API_TIMEOUT,
            ),
            org_id=org_id,
            user_id=user_id,
        )
        text = _extract_text(response).strip()
        start, end = text.find("{"), text.rfind("}") + 1
        if 0 <= start < end:
            parsed = json.loads(text[start:end])
            parsed["confidence"] = max(0.0, min(1.0, float(parsed.get("confidence", 0.5))))
            return {**_empty, **parsed}
    except Exception as exc:
        logger.error(f"recommend_subscription_plan error: {exc}")
    return _empty


async def generate_insights(
    context_data: Dict[str, Any],
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> List[str]:
    """
    Ask Claude (Haiku) to produce 3–5 short actionable insights.
    Returns an empty list on any failure (insights are non-critical).
    """
    client = get_client()
    if not client:
        return []

    data_str = json.dumps(context_data, indent=2, default=str)
    prompt = (
        "Analyse this Gigs4You platform data and produce 3–5 concise, actionable insights "
        "for the platform team.\n\n"
        f"{data_str}\n\n"
        "Return ONLY a valid JSON array of insight strings (each under 120 chars). "
        "No text before or after the array:\n"
        '["insight 1", "insight 2", "insight 3"]'
    )

    try:
        response = await _get_engine().run(
            operation="generate_insights",
            coro=asyncio.wait_for(
                client.messages.create(
                    model=MODEL_FAST,
                    max_tokens=512,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=API_TIMEOUT,
            ),
            org_id=org_id,
            user_id=user_id,
        )
        result = _parse_json_array(_extract_text(response))
        return [str(item) for item in result if isinstance(item, str)]
    except Exception as exc:
        logger.error(f"generate_insights error: {exc}")
        return []


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_auth_error(err_str: str) -> bool:
    return (
        "authentication_error" in err_str
        or "invalid api key" in err_str
        or "invalid x-api-key" in err_str
    )


def _is_credits_error(err_str: str) -> bool:
    return (
        "credit balance is too low" in err_str
        or "purchase credits" in err_str
        or "insufficient credits" in err_str
        or "billing_error" in err_str  # exact Anthropic error type name, not broad "billing"
    )


def _is_model_error(err_str: str) -> bool:
    return (
        "model" in err_str
        and ("not found" in err_str or "does not exist" in err_str or "no access" in err_str)
    )


def _log_api_error(exc: Exception, context: str) -> None:
    """Log the raw exception with as much detail as possible for operator debugging."""
    details = str(exc)
    if hasattr(exc, "status_code"):
        details = f"HTTP {exc.status_code}: {details}"
    if hasattr(exc, "body"):
        details += f" | body={exc.body}"
    logger.error("Anthropic API error in %s: %s", context, details)


def _pick_model(message: str) -> str:
    """
    Use Haiku for short/simple messages; Sonnet for long or complex ones.
    Keeps costs low without sacrificing quality where it matters.
    """
    msg_lower = message.lower()
    is_complex = (
        len(message) > 200
        or any(kw in msg_lower for kw in _COMPLEX_KEYWORDS)
    )
    return MODEL_CHAT if is_complex else MODEL_FAST


def _extract_text(response: Any) -> str:
    """Pull the first text content block from a Claude response."""
    for block in response.content:
        if hasattr(block, "text"):
            return block.text
    return ""


def _parse_json_array(text: str) -> List[Any]:
    """
    Robustly extract a JSON array from Claude's response text.
    Tries three strategies in order:
      1. Direct parse of stripped text (Claude followed instructions perfectly)
      2. Bracket-slicing (there's some extra text around the JSON)
      3. Regex extraction (worst case — Claude added explanation prose)
    """
    text = text.strip()

    # Strategy 1: entire response is the array
    if text.startswith("["):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # Strategy 2: slice from first [ to last ]
    start = text.find("[")
    end = text.rfind("]") + 1
    if 0 <= start < end:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass

    # Strategy 3: regex — find any JSON array (handles multiline)
    match = re.search(r"\[.*?\]", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    logger.warning(f"_parse_json_array: no JSON array found in: {text[:300]}")
    return []


def _fallback_response(message: str) -> str:
    """Keyword-based fallback when the Anthropic SDK is unavailable."""
    msg = message.lower()
    if any(w in msg for w in ["job", "work", "gig", "task", "opportunity"]):
        return (
            "I can help you find jobs and manage tasks. "
            "Set ANTHROPIC_API_KEY in the AI service environment to enable full AI assistance."
        )
    if any(w in msg for w in ["pay", "wallet", "mpesa", "withdraw", "earn"]):
        return (
            "For payment queries, visit your Wallet section in the app. "
            "Set ANTHROPIC_API_KEY to enable AI-powered payment guidance."
        )
    return (
        "I'm here to help with Gigs4You. "
        "Please set ANTHROPIC_API_KEY in the AI service environment to enable full AI capabilities."
    )
