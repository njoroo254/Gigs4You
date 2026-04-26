"""
Tool dispatcher and handlers for all 166+ Gigs4You tools.
Routes Claude tool calls to appropriate implementations.
"""

import os
import re
import json
import logging
import secrets
from typing import Any, Dict, Optional
from datetime import datetime

import jwt

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

def _is_uuid(value: Any) -> bool:
    return isinstance(value, str) and bool(_UUID_RE.match(value))

logger = logging.getLogger("gigs4you.tools")

JWT_SECRET = os.getenv("JWT_SECRET")

def _decode_jwt(token: str) -> Dict[str, Any]:
    """Decode JWT and return payload."""
    if not JWT_SECRET:
        raise ValueError("JWT_SECRET not configured")
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise ValueError("Invalid JWT")

def _get_user_role(token: str) -> str:
    """Extract user role from JWT."""
    payload = _decode_jwt(token)
    return payload.get("role", "")

def _get_user_org_id(token: str) -> Optional[str]:
    """Extract user org_id from JWT."""
    payload = _decode_jwt(token)
    return payload.get("org_id") or payload.get("orgId")

def _get_user_id_from_jwt(token: str) -> Optional[str]:
    """Extract user id from JWT sub/user_id/id claim."""
    payload = _decode_jwt(token)
    return payload.get("sub") or payload.get("user_id") or payload.get("id")

# ── Lazy Redis client (used for payment staging) ──────────────────────────────
_redis_client: Optional[Any] = None

def _get_redis() -> Optional[Any]:
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

# Import read-only database functions and tool logic modules

# Import read-only database functions and tool logic modules
from ..reads import (
    get_pool,
    get_platform_stats,
    get_user_context,
    search_open_jobs,
    search_available_workers,
    get_job_details,
    get_available_workers_for_job,
    get_real_analytics,
    get_jobs,
    get_job_statistics,
    get_worker_full_profile,
    get_top_workers,
    get_worker_history,
    get_agents,
    get_agent_tasks,
    get_agent_last_location,
    get_tasks,
    get_task_details,
    get_applications,
    get_wallet_info,
    get_wallet_transactions_db,
    get_org_wallet_info,
    get_org_wallet_transactions_db,
    get_chat_groups_db,
    get_group_messages_db,
    get_growth_metrics,
    get_location_analytics,
    get_conversion_analytics,
    get_organisation,
    get_org_stats,
    get_user_notifications_db,
    get_org_alerts_db,
    get_system_notifications_db,
    get_audit_logs_db,
    get_subscription_info,
    get_verification_status,
    get_disputes_db,
    get_dispute_stats_db,
    get_trend_comparison,
    get_billing_history,
)
from ..reasoning import (
    rank_workers_for_job,
    recommend_workers,
    recommend_jobs,
    predict_job_success,
    predict_worker_performance,
    detect_fraud_risk,
    detect_fake_jobs,
    detect_inactive_users,
    detect_churn_risk,
    optimize_pricing,
    suggest_skills_to_learn,
    suggest_job_improvements,
    analyze_user_behavior,
)
from ..writes import (
    create_job,
    update_job,
    close_job,
    extend_job_deadline,
    assign_agent_to_job,
    reassign_agent,
    create_task,
    update_task_status,
    initiate_withdrawal,
    send_payment_otp,
    verify_payment_otp,
    send_notification,
    broadcast_message,
    send_job_alerts,
    apply_to_job,
    accept_application,
    reject_application,
    flag_user,
    flag_job,
    detect_anomalies,
    log_issue,
)

# Withdrawals >= this amount require a one-time OTP before execution.
_HIGH_VALUE_KES = int(os.getenv("PAYMENT_HIGH_VALUE_KES", "50000"))

# Get NestJS API URL — apply WSL host remapping so localhost resolves correctly
def _wsl_resolve(url: str) -> str:
    """Remap localhost to the Windows host IP when running inside WSL2."""
    if "localhost" not in url and "127.0.0.1" not in url:
        return url
    try:
        with open("/proc/version") as _f:
            if "microsoft" not in _f.read().lower():
                return url
        with open("/etc/resolv.conf") as _f:
            for _line in _f:
                if _line.startswith("nameserver"):
                    _ip = _line.split()[1].strip()
                    return url.replace("localhost", _ip).replace("127.0.0.1", _ip)
    except OSError:
        pass
    return url

NEST_API_URL = _wsl_resolve(os.getenv("NEST_API_URL", "http://localhost:3000/api/v1"))
NEST_API_TIMEOUT = int(os.getenv("NEST_API_TIMEOUT", "30"))


# ── Dict-based dispatch tables (populated after all handlers are defined) ──────
# Initialized as empty; _build_dispatch_tables() fills them at module bottom.
_READ_DISPATCH: Dict[str, Any] = {}
_AUTH_DISPATCH: Dict[str, Any] = {}
_GROUP_WRITE:   Dict[str, Any] = {}


def _build_dispatch_tables() -> None:
    """Populate all dispatch tables. Called once at the bottom of this module,
    after every handle_* function is defined (avoids forward-reference NameError)."""
    global _READ_DISPATCH, _AUTH_DISPATCH, _GROUP_WRITE

    _GROUP_WRITE = {
        # jobs
        "create_job":         (handle_job_write, {"create_job", "update_job", "close_job", "extend_job_deadline"}),
        "update_job":         (handle_job_write, {"create_job", "update_job", "close_job", "extend_job_deadline"}),
        "close_job":          (handle_job_write, {"create_job", "update_job", "close_job", "extend_job_deadline"}),
        "extend_job_deadline":(handle_job_write, {"create_job", "update_job", "close_job", "extend_job_deadline"}),
        # agents
        "assign_agent_to_job":(handle_agent_write, {"assign_agent_to_job", "reassign_agent"}),
        "reassign_agent":     (handle_agent_write, {"assign_agent_to_job", "reassign_agent"}),
        # tasks
        "create_task":        (handle_task_write, {"create_task", "update_task_status"}),
        "update_task_status": (handle_task_write, {"create_task", "update_task_status"}),
        # notifications
        "send_notification":  (handle_notification_write, {"send_notification", "broadcast_message", "send_job_alerts"}),
        "broadcast_message":  (handle_notification_write, {"send_notification", "broadcast_message", "send_job_alerts"}),
        "send_job_alerts":    (handle_notification_write, {"send_notification", "broadcast_message", "send_job_alerts"}),
        # applications
        "apply_to_job":       (handle_application_write, {"apply_to_job", "accept_application", "reject_application"}),
        "accept_application": (handle_application_write, {"apply_to_job", "accept_application", "reject_application"}),
        "reject_application": (handle_application_write, {"apply_to_job", "accept_application", "reject_application"}),
        # admin
        "flag_user":          (handle_admin_write, {"flag_user", "flag_job", "detect_anomalies"}),
        "flag_job":           (handle_admin_write, {"flag_user", "flag_job", "detect_anomalies"}),
        "detect_anomalies":   (handle_admin_write, {"flag_user", "flag_job", "detect_anomalies"}),
    }
    _READ_DISPATCH = {
        # Jobs
        "search_jobs":              handle_search_jobs,
        "get_job_details":          handle_get_job_details,
        "get_jobs_by_status":       handle_get_jobs_by_status,
        "get_jobs_by_employer":     handle_get_jobs_by_employer,
        "get_jobs_by_location":     handle_get_jobs_by_location,
        "get_jobs_by_skills":       handle_get_jobs_by_skills,
        "get_recent_jobs":          handle_get_recent_jobs,
        "get_high_paying_jobs":     handle_get_high_paying_jobs,
        "get_urgent_jobs":          handle_get_urgent_jobs,
        "get_recommended_jobs":     handle_get_recommended_jobs,
        "get_job_statistics":       handle_get_job_statistics,
        # Workers
        "find_workers":             handle_find_workers,
        "get_worker_profile":       handle_get_worker_profile,
        "get_worker_skills":        handle_get_worker_skills,
        "get_worker_performance":   handle_get_worker_performance,
        "get_worker_history":       handle_get_worker_history,
        "get_worker_availability":  handle_get_worker_availability,
        "get_top_workers":          handle_get_top_workers,
        # Agents
        "search_agents":            handle_search_agents,
        "get_available_agents":     handle_get_available_agents,
        "get_agent_profile":        handle_get_agent_profile,
        "get_agent_tasks":          handle_get_agent_tasks,
        "get_agent_performance":    handle_get_agent_performance,
        "track_agent_location":     handle_track_agent_location,
        "get_agent_history":        handle_get_agent_history,
        "get_agent_activity_summary": handle_get_agent_activity_summary,
        # Tasks
        "get_user_tasks":           handle_get_user_tasks,
        "get_task_details":         handle_get_task_details,
        "get_pending_tasks":        handle_get_pending_tasks,
        "get_completed_tasks":      handle_get_completed_tasks,
        "get_overdue_tasks":        handle_get_overdue_tasks,
        # Wallet / Payments (non-auth reads)
        "get_earnings_summary":     handle_get_earnings_summary,
        "get_mpesa_transactions":   handle_get_mpesa_transactions,
        "get_pending_payments":     handle_get_pending_payments,
        # Analytics
        "get_platform_stats":       handle_get_platform_stats,
        "get_growth_metrics":       handle_get_growth_metrics,
        "get_user_distribution":    handle_get_user_distribution,
        "get_job_distribution":     handle_get_job_distribution,
        "get_conversion_rates":     handle_get_conversion_rates,
        "get_engagement_metrics":   handle_get_engagement_metrics,
        "get_top_performers":       handle_get_top_performers,
        "get_location_stats":       handle_get_location_stats,
        "get_high_demand_areas":    handle_get_high_demand_areas,
        # AI / Intelligence
        "rank_workers_for_job":     handle_rank_workers_for_job,
        "recommend_workers":        handle_recommend_workers,
        "recommend_jobs":           handle_recommend_jobs,
        "predict_job_success":      handle_predict_job_success,
        "predict_worker_performance": handle_predict_worker_performance,
        "detect_fraud_risk":        handle_detect_fraud_risk,
        "detect_fake_jobs":         handle_detect_fake_jobs,
        "detect_inactive_users":    handle_detect_inactive_users,
        "detect_churn_risk":        handle_detect_churn_risk,
        "optimize_pricing":         handle_optimize_pricing,
        "suggest_skills_to_learn":  handle_suggest_skills_to_learn,
        "verify_face_match":        handle_verify_face_match,
        "suggest_job_improvements": handle_suggest_job_improvements,
        "analyze_user_behavior":    handle_analyze_user_behavior,
        "get_match_score":          handle_get_match_score,
        # User profile
        "get_user_profile":         handle_get_user_profile,
        "get_user_role":            handle_get_user_role,
        "get_user_activity":        handle_get_user_activity,
        "get_user_statistics":      handle_get_user_statistics,
        "get_user_activity_summary":handle_get_user_activity_summary,
        "get_user_history":         handle_get_user_history,
        # Location
        "get_jobs_nearby":          handle_get_jobs_nearby,
        "get_workers_nearby":       handle_get_workers_nearby,
        "get_agents_nearby":        handle_get_agents_nearby,
        "get_location_demand":      handle_get_location_demand,
        "get_location_supply":      handle_get_location_supply,
        # Notifications (read)
        "get_notifications":        handle_get_notifications,
        "get_user_notifications":   handle_get_user_notifications,
        # Applications (read)
        "get_job_applications":     handle_get_job_applications,
        "get_user_applications":    handle_get_user_applications,
        "shortlist_candidates":     handle_shortlist_candidates,
        "auto_match_workers":       handle_auto_match_workers,
        # Organisation (read)
        "get_organisation_jobs":    handle_get_organisation_jobs,
        "get_organisation_stats":   handle_get_organisation_stats,
        "get_employer_dashboard":   handle_get_employer_dashboard,
        # Disputes (read/policy)
        "get_disputes":             handle_get_disputes,
        "get_dispute_stats":        handle_get_dispute_stats,
        "get_dispute_resolution_policy": handle_get_dispute_resolution_policy,
        "get_refund_policy":        handle_get_refund_policy,
        "file_dispute":             handle_file_dispute,
        "escalate_dispute":         handle_escalate_dispute,
        # Subscriptions
        "get_subscription_info":    handle_get_subscription_info,
        "get_subscription_plans":   handle_get_subscription_plans,
        "get_billing_history":      handle_get_billing_history,
        "check_plan_limits":        handle_check_plan_limits,
        "recommend_plan_upgrade":   handle_recommend_plan_upgrade,
        # Verification / KYC
        "get_verification_status":         handle_get_verification_status,
        "get_verification_requirements":   handle_get_verification_requirements,
        "get_pending_verifications":       handle_get_pending_verifications,
        "explain_verification_process":    handle_explain_verification_process,
        # Trends
        "get_trend_comparison":     handle_get_trend_comparison,
        "get_platform_trends":      handle_get_platform_trends,
        "get_category_trends":      handle_get_category_trends,
        "get_county_trends":        handle_get_county_trends,
    }
    _AUTH_DISPATCH = {
        # Agent wallet (JWT user fallback)
        "get_wallet_balance":           handle_get_wallet_balance,
        "get_wallet_transactions":      handle_get_wallet_transactions,
        "get_wallet_summary":           handle_get_wallet_summary,
        # Wallet write — two-step confirmation flow
        "stage_withdrawal":             handle_stage_withdrawal,
        "execute_staged_withdrawal":    handle_execute_staged_withdrawal,
        # Org wallet (JWT org_id auto-resolved)
        "get_org_wallet_balance":       handle_get_org_wallet_balance,
        "get_org_wallet_transactions":  handle_get_org_wallet_transactions,
        # Chat groups (JWT org_id auto-resolved)
        "get_chat_groups":              handle_get_chat_groups,
        "get_group_messages":           handle_get_group_messages,
        # Organisation (auth-scoped reads)
        "get_organisation_profile":     handle_get_organisation_profile,
        "get_organisation_users":       handle_get_organisation_users,
        # Admin / Security
        "get_audit_logs":               handle_get_audit_logs,
        "get_security_alerts":          handle_get_security_alerts,
        # System
        "get_system_status":            handle_get_system_status,
        "get_api_usage":                handle_get_api_usage,
        "get_error_reports":            handle_get_error_reports,
        "log_issue":                    handle_log_issue,
        "get_open_issues":              handle_get_open_issues,
        # AI Awareness & Notification Intelligence
        "get_my_notifications":         handle_get_my_notifications,
        "get_pending_alerts":           handle_get_pending_alerts,
        "summarize_ai_actions":         handle_summarize_ai_actions,
        # Cathy AI self-awareness
        "get_cathy_usage":              handle_get_cathy_usage,
        "get_cathy_usage_breakdown":    handle_get_cathy_usage_breakdown,
        "get_cathy_remaining_capacity": handle_get_cathy_remaining_capacity,
        "get_cathy_plan_limits":        handle_get_cathy_plan_limits,
    }


async def dispatch(tool_name: str, tool_input: Dict[str, Any], user_jwt: Optional[str] = None) -> Dict[str, Any]:
    """Dict-based tool dispatcher — O(1) lookup instead of 338-branch if/elif."""
    try:
        # 1. Group write tools (auth required, group handler)
        if tool_name in _GROUP_WRITE:
            handler_fn, _ = _GROUP_WRITE[tool_name]
            return await handler_fn(tool_name, tool_input, user_jwt)

        # 2. Auth-aware single-handler tools
        if tool_name in _AUTH_DISPATCH:
            return await _AUTH_DISPATCH[tool_name](tool_input, user_jwt)

        # 3. Simple read tools
        if tool_name in _READ_DISPATCH:
            return await _READ_DISPATCH[tool_name](tool_input)

        return {"error": f"Unknown tool: {tool_name}"}

    except Exception as e:
        logger.error(f"Tool handler error for {tool_name}: {str(e)}", exc_info=True)
        return {"error": f"Tool execution failed: {str(e)}"}


# ─────────────────────────────────────────────────────────────────────────────
# READ-ONLY HANDLERS (Database queries)
# ─────────────────────────────────────────────────────────────────────────────

async def handle_search_jobs(params: Dict[str, Any]) -> Dict[str, Any]:
    """Search jobs by keyword, location, or skills"""
    try:
        query = params.get("query", "")
        location = params.get("location")
        limit = min(params.get("limit", 10), 20)
        
        jobs = await search_open_jobs(query=query, location=location, limit=limit)
        return {"success": True, "jobs": jobs, "count": len(jobs)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_job_details(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get full details of a specific job"""
    try:
        job_id = params.get("job_id")
        if not job_id:
            return {"error": "job_id required"}
        
        job = await get_job_details(job_id)
        return {"success": True, "job": job}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_jobs_by_status(params: Dict[str, Any]) -> Dict[str, Any]:
    """List jobs filtered by status"""
    try:
        status = params.get("status", "open")
        limit = min(params.get("limit", 10), 20)
        
        jobs = await get_jobs(status=status, limit=limit)
        return {"success": True, "jobs": jobs, "count": len(jobs)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_jobs_by_employer(params: Dict[str, Any]) -> Dict[str, Any]:
    """List jobs by a specific employer"""
    try:
        employer_id = params.get("employer_id")
        limit = min(params.get("limit", 10), 20)
        
        if not employer_id:
            return {"error": "employer_id required"}
        
        jobs = await get_jobs(employer_id=employer_id, limit=limit)
        return {"success": True, "jobs": jobs, "count": len(jobs)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_jobs_by_location(params: Dict[str, Any]) -> Dict[str, Any]:
    """Find jobs in a specific location"""
    try:
        location = params.get("location") or params.get("county")
        limit = min(params.get("limit", 10), 20)
        
        if not location:
            return {"error": "location or county required"}
        
        jobs = await get_jobs(location=location, limit=limit)
        return {"success": True, "jobs": jobs, "count": len(jobs)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_jobs_by_skills(params: Dict[str, Any]) -> Dict[str, Any]:
    """Find jobs requiring specific skills"""
    try:
        skills_str = params.get("skills", "")
        location = params.get("location")
        limit = min(params.get("limit", 10), 20)
        
        # Note: Current get_jobs doesn't filter by skills due to join complexity.
        # This returns all open jobs, optionally filtered by location.
        jobs = await get_jobs(location=location, status="open", limit=limit)
        return {"success": True, "jobs": jobs, "count": len(jobs)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_recent_jobs(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get recently posted jobs"""
    try:
        limit = min(params.get("limit", 10), 20)
        
        jobs = await get_jobs(status="open", order_by="created_at", limit=limit)
        return {"success": True, "jobs": jobs, "count": len(jobs)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_high_paying_jobs(params: Dict[str, Any]) -> Dict[str, Any]:
    """Find highest-budget jobs"""
    try:
        min_budget = params.get("min_budget", 1000)
        limit = min(params.get("limit", 10), 20)
        
        jobs = await get_jobs(status="open", min_budget=min_budget, order_by="budget_max", limit=limit)
        return {"success": True, "jobs": jobs, "count": len(jobs)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_urgent_jobs(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get urgent jobs"""
    try:
        location = params.get("location")
        limit = min(params.get("limit", 10), 20)
        
        jobs = await get_jobs(status="open", urgent=True, location=location, order_by="deadline", limit=limit)
        return {"success": True, "jobs": jobs, "count": len(jobs)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_recommended_jobs(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get personalized job recommendations"""
    try:
        user_id = params.get("user_id")
        limit = min(params.get("limit", 10), 20)
        
        if not user_id:
            jobs = await get_jobs(status="open", limit=limit)
        else:
            # Get user context (includes county)
            user = await get_user_context(user_id)
            
            if not user:
                jobs = await get_jobs(status="open", limit=limit)
            else:
                user_county = user.get("county")
                # Find matching jobs by location if available
                jobs = await get_jobs(status="open", location=user_county, limit=limit)
        
        return {"success": True, "jobs": jobs, "count": len(jobs)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_job_statistics(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get job statistics"""
    try:
        stats = await get_job_statistics()
        return {"success": True, "statistics": stats}
    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# WORKER & AGENT HANDLERS
# ─────────────────────────────────────────────────────────────────────────────

async def handle_find_workers(params: Dict[str, Any]) -> Dict[str, Any]:
    """Search for available workers"""
    try:
        skills_str = params.get("skills", "")
        location = params.get("location")
        limit = min(params.get("limit", 10), 20)
        
        workers = await search_available_workers(skills=skills_str, location=location, limit=limit)
        return {"success": True, "workers": workers, "count": len(workers)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_worker_profile(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get worker profile"""
    try:
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required"}
        
        profile = await get_worker_full_profile(user_id)
        return {"success": True, "profile": profile}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_worker_skills(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get worker's registered skills"""
    try:
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required"}
        
        profile = await get_worker_full_profile(user_id)
        skills = profile.get("skills", []) if profile else []
        return {"success": True, "skills": skills}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_worker_performance(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get worker performance metrics"""
    try:
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required"}
        
        profile = await get_worker_full_profile(user_id)
        if not profile:
            return {"success": True, "performance": None}
        
        perf = {
            "average_rating": profile.get("average_rating"),
            "completed_jobs": profile.get("completed_jobs"),
            "cancelled_jobs": profile.get("cancelled_jobs"),
        }
        return {"success": True, "performance": perf}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_worker_history(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get worker's job history"""
    try:
        user_id = params.get("user_id")
        limit = min(params.get("limit", 10), 20)
        
        if not user_id:
            return {"error": "user_id required"}
        
        history = await get_worker_history(user_id, limit=limit)
        return {"success": True, "history": history, "count": len(history)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_worker_availability(params: Dict[str, Any]) -> Dict[str, Any]:
    """Check worker availability"""
    try:
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required"}
        
        profile = await get_worker_full_profile(user_id)
        is_available = profile.get("is_available", False) if profile else False
        return {"success": True, "available": is_available}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_top_workers(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get top-rated workers"""
    try:
        limit = min(params.get("limit", 10), 20)
        
        workers = await get_top_workers(limit=limit)
        return {"success": True, "workers": workers, "count": len(workers)}
    except Exception as e:
        return {"error": str(e)}


async def handle_search_agents(params: Dict[str, Any]) -> Dict[str, Any]:
    """Search agents by name"""
    try:
        name = params.get("name", "").strip()
        if not name:
            return {"error": "name is required for agent search"}
        org_id = params.get("org_id")
        limit = min(params.get("limit", 10), 20)
        agents = await get_agents(name=name, org_id=org_id, limit=limit)
        return {"success": True, "agents": agents, "count": len(agents)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_available_agents(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get available field agents"""
    try:
        org_id = params.get("org_id")
        limit = min(params.get("limit", 10), 20)

        agents = await get_agents(org_id=org_id, status="available", limit=limit)
        return {"success": True, "agents": agents, "count": len(agents)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_agent_profile(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get agent profile"""
    try:
        agent_id = params.get("agent_id")
        if not agent_id:
            return {"error": "agent_id required"}
        
        # Get all agents and filter for this one
        all_agents = await get_agents(limit=1000)
        agent = next((a for a in all_agents if a.get("id") == agent_id), None)
        
        return {"success": True, "profile": agent}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_agent_tasks(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get tasks assigned to an agent"""
    try:
        agent_id = params.get("agent_id")
        status = params.get("status")
        limit = min(params.get("limit", 10), 20)
        
        if not agent_id:
            return {"error": "agent_id required"}
        
        tasks = await get_agent_tasks(agent_id, status=status, limit=limit)
        return {"success": True, "tasks": tasks, "count": len(tasks)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_agent_performance(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get agent performance"""
    try:
        agent_id = params.get("agent_id")
        if not agent_id:
            return {"error": "agent_id required"}
        
        # Get agent info
        agents = await get_agents(limit=1000)
        agent = next((a for a in agents if a.get("id") == agent_id), None)
        
        if not agent:
            return {"success": True, "performance": None}
        
        perf = {
            "level": agent.get("level"),
            "total_xp": agent.get("total_xp"),
            "average_rating": agent.get("average_rating"),
            "current_streak": agent.get("current_streak"),
            "completed_jobs": agent.get("completed_jobs"),
        }
        return {"success": True, "performance": perf}
    except Exception as e:
        return {"error": str(e)}


async def handle_track_agent_location(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get agent's latest GPS location"""
    try:
        agent_id = params.get("agent_id")
        if not agent_id:
            return {"error": "agent_id required"}
        
        location = await get_agent_last_location(agent_id)
        return {"success": True, "location": location}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_agent_history(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get agent's task history"""
    try:
        agent_id = params.get("agent_id")
        limit = min(params.get("limit", 10), 20)
        
        if not agent_id:
            return {"error": "agent_id required"}
        
        history = await get_tasks(agent_id=agent_id, status="completed", limit=limit)
        return {"success": True, "history": history, "count": len(history)}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_agent_activity_summary(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get agent activity summary"""
    try:
        agent_id = params.get("agent_id")
        
        if not agent_id:
            return {"error": "agent_id required"}
        
        # Get in-progress and completed tasks
        in_progress = await get_tasks(agent_id=agent_id, status="in_progress")
        completed = await get_tasks(agent_id=agent_id, status="completed")
        
        # Calculate total XP (simplified - would need task details with xp_reward field)
        total_xp_earned = sum(t.get("xp_reward", 0) for t in completed if "xp_reward" in t)
        
        summary = {
            "in_progress_count": len(in_progress),
            "completed_count": len(completed),
            "total_xp_earned": total_xp_earned,
        }
        return {"success": True, "summary": summary}
    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# STUB HANDLERS FOR REMAINING TOOLS (will be implemented incrementally)
# ─────────────────────────────────────────────────────────────────────────────

async def handle_get_user_tasks(params: Dict[str, Any]) -> Dict[str, Any]:
    user_id = params.get("user_id")
    if not user_id:
        return {"error": "user_id required"}
    tasks = await get_tasks(agent_id=user_id, limit=20)
    return {"success": True, "tasks": tasks, "count": len(tasks)}

async def handle_get_task_details(params: Dict[str, Any]) -> Dict[str, Any]:
    task_id = params.get("task_id")
    if not task_id:
        return {"error": "task_id required"}
    task = await get_task_details(task_id)
    return {"success": True, "task": task}

async def handle_get_pending_tasks(params: Dict[str, Any]) -> Dict[str, Any]:
    org_id = params.get("org_id")
    limit = min(params.get("limit", 20), 100)
    tasks = await get_tasks(org_id=org_id, status="pending", limit=limit)
    return {"success": True, "tasks": tasks, "count": len(tasks)}

async def handle_get_completed_tasks(params: Dict[str, Any]) -> Dict[str, Any]:
    org_id = params.get("org_id")
    limit = min(params.get("limit", 20), 100)
    tasks = await get_tasks(org_id=org_id, status="completed", limit=limit)
    return {"success": True, "tasks": tasks, "count": len(tasks)}

async def handle_get_overdue_tasks(params: Dict[str, Any]) -> Dict[str, Any]:
    org_id = params.get("org_id")
    tasks = await get_tasks(org_id=org_id, overdue=True, limit=50)
    return {"success": True, "tasks": tasks, "count": len(tasks)}

async def handle_get_wallet_balance(params: Dict[str, Any], user_jwt: Optional[str] = None) -> Dict[str, Any]:
    user_id = params.get("user_id")
    # Fall back to the authenticated user's UUID if param is missing or not a UUID
    if (not user_id or not _is_uuid(user_id)) and user_jwt:
        try:
            user_id = _get_user_id_from_jwt(user_jwt)
        except Exception:
            pass
    if not user_id or not _is_uuid(user_id):
        return {"error": "Could not resolve a valid user UUID. Please try again."}
    wallet = await get_wallet_info(user_id)
    balance = wallet.get("balance", 0) if wallet else 0
    return {"success": True, "balance": balance, "currency": "KES"}

async def handle_get_wallet_transactions(params: Dict[str, Any], user_jwt: Optional[str] = None) -> Dict[str, Any]:
    user_id = params.get("user_id")
    if (not user_id or not _is_uuid(user_id)) and user_jwt:
        try:
            user_id = _get_user_id_from_jwt(user_jwt)
        except Exception:
            pass
    if not user_id or not _is_uuid(user_id):
        return {"error": "Could not resolve a valid user UUID. Please try again."}
    limit = min(params.get("limit", 20), 100)
    transactions = await get_wallet_transactions_db(user_id, limit=limit)
    return {"success": True, "transactions": transactions, "count": len(transactions)}

async def handle_get_wallet_summary(params: Dict[str, Any], user_jwt: Optional[str] = None) -> Dict[str, Any]:
    user_id = params.get("user_id")
    if (not user_id or not _is_uuid(user_id)) and user_jwt:
        try:
            user_id = _get_user_id_from_jwt(user_jwt)
        except Exception:
            pass
    if not user_id or not _is_uuid(user_id):
        return {"error": "Could not resolve a valid user UUID. Please try again."}
    wallet = await get_wallet_info(user_id)
    return {"success": True, "summary": wallet}

async def handle_get_earnings_summary(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get earnings summary for a user"""
    try:
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required"}
        
        # Get wallet transactions
        transactions = await get_wallet_transactions_db(user_id, limit=100)
        
        # Calculate earnings summary
        total_earned = sum(t.get("amount", 0) for t in transactions if t.get("type") == "credit")
        total_spent = sum(t.get("amount", 0) for t in transactions if t.get("type") == "debit")
        recent_earnings = [t for t in transactions if t.get("type") == "credit"][:10]
        
        earnings = {
            "total_earned": total_earned,
            "total_spent": total_spent,
            "net_balance": total_earned - total_spent,
            "recent_earnings": recent_earnings,
            "transaction_count": len(transactions),
        }
        return {"success": True, "earnings": earnings}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_mpesa_transactions(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get M-Pesa transactions for a user"""
    try:
        user_id = params.get("user_id")
        limit = min(params.get("limit", 20), 50)
        
        if not user_id:
            return {"error": "user_id required"}
        
        # Get all transactions and filter for M-Pesa
        transactions = await get_wallet_transactions_db(user_id, limit=limit)
        mpesa_transactions = [t for t in transactions if t.get("payment_method") == "mpesa"]
        
        return {"success": True, "transactions": mpesa_transactions}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_pending_payments(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get pending payments for a user"""
    try:
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required"}
        
        # Get transactions with pending status
        transactions = await get_wallet_transactions_db(user_id, limit=50)
        pending_payments = [t for t in transactions if t.get("status") == "pending"]
        
        return {"success": True, "payments": pending_payments}
    except Exception as e:
        return {"error": str(e)}

# ── Org Wallet handlers ───────────────────────────────────────────────────────

async def handle_get_org_wallet_balance(params: Dict[str, Any], user_jwt: Optional[str] = None) -> Dict[str, Any]:
    """Get organisation wallet balance — uses JWT org_id automatically."""
    org_id = None
    if user_jwt:
        try:
            org_id = _get_user_org_id(user_jwt)
        except Exception:
            pass
    if not org_id:
        return {"error": "No organisation ID found in your session. Are you logged in as an admin or manager?"}
    wallet = await get_org_wallet_info(org_id)
    if not wallet:
        return {"success": True, "balance": 0, "pending_balance": 0,
                "total_deposited": 0, "total_disbursed": 0, "currency": "KES",
                "note": "No wallet record yet — it will be created on first topup."}
    return {"success": True, **wallet}

async def handle_get_org_wallet_transactions(params: Dict[str, Any], user_jwt: Optional[str] = None) -> Dict[str, Any]:
    """Get organisation wallet transaction history — uses JWT org_id automatically."""
    org_id = None
    if user_jwt:
        try:
            org_id = _get_user_org_id(user_jwt)
        except Exception:
            pass
    if not org_id:
        return {"error": "No organisation ID found in your session."}
    limit = min(params.get("limit", 20), 100)
    txs = await get_org_wallet_transactions_db(org_id, limit=limit)
    return {"success": True, "transactions": txs, "count": len(txs)}

# ── Chat Group handlers ───────────────────────────────────────────────────────

async def handle_get_chat_groups(params: Dict[str, Any], user_jwt: Optional[str] = None) -> Dict[str, Any]:
    """List chat groups for the authenticated user's organisation."""
    org_id = None
    if user_jwt:
        try:
            org_id = _get_user_org_id(user_jwt)
        except Exception:
            pass
    if not org_id:
        return {"error": "No organisation ID found in your session."}
    limit = min(params.get("limit", 20), 50)
    groups = await get_chat_groups_db(org_id, limit=limit)
    return {"success": True, "groups": groups, "count": len(groups)}

async def handle_get_group_messages(params: Dict[str, Any], user_jwt: Optional[str] = None) -> Dict[str, Any]:
    """Get recent messages from a specific chat group."""
    group_id = params.get("group_id")
    if not group_id:
        return {"error": "group_id required. Use get_chat_groups to list available groups."}
    limit = min(params.get("limit", 30), 100)
    messages = await get_group_messages_db(group_id, limit=limit)
    return {"success": True, "messages": messages, "count": len(messages)}

async def handle_get_platform_stats(params: Dict[str, Any]) -> Dict[str, Any]:
    stats = await get_platform_stats()
    return {"success": True, "stats": stats}

async def handle_get_growth_metrics(params: Dict[str, Any]) -> Dict[str, Any]:
    days = min(params.get("days", 30), 365)
    metrics = await get_growth_metrics(days=days)
    return {"success": True, "metrics": metrics}

async def handle_get_user_distribution(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get user distribution by role and location"""
    try:
        # Get platform stats which includes user counts
        stats = await get_platform_stats()
        
        distribution = {
            "by_role": {
                "workers": stats.get("total_workers", 0),
                "employers": stats.get("total_employers", 0),
                "agents": stats.get("total_agents", 0),
            },
            "total_users": stats.get("total_users", 0),
        }
        return {"success": True, "distribution": distribution}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_job_distribution(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get job distribution by status and category"""
    try:
        # Get job statistics
        job_stats = await get_job_statistics()
        
        distribution = {
            "by_status": {
                "open": job_stats.get("open_jobs", 0),
                "in_progress": job_stats.get("in_progress_jobs", 0),
                "completed": job_stats.get("completed_jobs", 0),
                "cancelled": job_stats.get("cancelled_jobs", 0),
            },
            "total_jobs": job_stats.get("total_jobs", 0),
        }
        return {"success": True, "distribution": distribution}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_conversion_rates(params: Dict[str, Any]) -> Dict[str, Any]:
    analytics = await get_conversion_analytics()
    return {"success": True, "rates": analytics}

async def handle_get_engagement_metrics(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get user engagement metrics"""
    try:
        days = min(params.get("days", 30), 90)
        
        # Get real analytics
        analytics = await get_real_analytics(days=days)
        
        metrics = {
            "active_users": analytics.get("active_users", 0),
            "job_postings": analytics.get("job_postings", 0),
            "applications": analytics.get("applications", 0),
            "completions": analytics.get("completions", 0),
            "period_days": days,
        }
        return {"success": True, "metrics": metrics}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_top_performers(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get top performing workers"""
    try:
        limit = min(params.get("limit", 10), 20)
        
        # Get top workers by rating
        performers = await get_top_workers(limit=limit)
        return {"success": True, "performers": performers}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_location_stats(params: Dict[str, Any]) -> Dict[str, Any]:
    analytics = await get_location_analytics()
    return {"success": True, "stats": analytics}

async def handle_get_high_demand_areas(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get areas with high job demand"""
    try:
        limit = min(params.get("limit", 5), 10)
        
        # Get location analytics and sort by demand
        analytics = await get_location_analytics()
        
        # Sort locations by demand score
        high_demand_areas = sorted(
            [{"location": loc, "demand_score": data.get("demand_score", 0)} 
             for loc, data in analytics.items()],
            key=lambda x: x["demand_score"],
            reverse=True
        )[:limit]
        
        return {"success": True, "areas": high_demand_areas}
    except Exception as e:
        return {"error": str(e)}

async def handle_rank_workers_for_job(params: Dict[str, Any]) -> Dict[str, Any]:
    job_id = params.get("job_id")
    limit = min(params.get("limit", 10), 30)
    if not job_id:
        return {"error": "job_id required"}
    return await rank_workers_for_job(job_id=job_id, limit=limit)

async def handle_recommend_workers(params: Dict[str, Any]) -> Dict[str, Any]:
    job_id = params.get("job_id")
    limit = min(params.get("limit", 5), 10)
    if not job_id:
        return {"error": "job_id required"}
    return await recommend_workers(
        job_id=job_id,
        required_skills=params.get("required_skills"),
        county=params.get("county"),
        limit=limit,
    )

async def handle_recommend_jobs(params: Dict[str, Any]) -> Dict[str, Any]:
    user_id = params.get("user_id")
    limit = min(params.get("limit", 5), 10)
    if not user_id:
        return {"error": "user_id required"}
    return await recommend_jobs(user_id=user_id, limit=limit)

async def handle_predict_job_success(params: Dict[str, Any]) -> Dict[str, Any]:
    job_id = params.get("job_id")
    if not job_id:
        return {"error": "job_id required"}
    return await predict_job_success(job_id=job_id)

async def handle_predict_worker_performance(params: Dict[str, Any]) -> Dict[str, Any]:
    user_id = params.get("user_id")
    if not user_id:
        return {"error": "user_id required"}
    return await predict_worker_performance(
        user_id=user_id,
        job_category=params.get("job_category"),
    )

async def handle_detect_fraud_risk(params: Dict[str, Any]) -> Dict[str, Any]:
    user_id = params.get("user_id")
    if not user_id:
        return {"error": "user_id required"}
    return await detect_fraud_risk(
        user_id=user_id,
        job_id=params.get("job_id"),
    )

async def handle_detect_fake_jobs(params: Dict[str, Any]) -> Dict[str, Any]:
    job_id = params.get("job_id")
    if not job_id:
        return {"error": "job_id required"}
    return await detect_fake_jobs(job_id=job_id)

async def handle_detect_inactive_users(params: Dict[str, Any]) -> Dict[str, Any]:
    days_threshold = params.get("days", 30)
    return await detect_inactive_users(days=days_threshold)

async def handle_detect_churn_risk(params: Dict[str, Any]) -> Dict[str, Any]:
    limit = min(params.get("limit", 10), 20)
    return await detect_churn_risk(limit=limit)

async def handle_optimize_pricing(params: Dict[str, Any]) -> Dict[str, Any]:
    return await optimize_pricing(
        category=params.get("job_type", ""),
        county=params.get("location", ""),
        budget_type=params.get("budget_type", ""),
    )

async def handle_suggest_skills_to_learn(params: Dict[str, Any]) -> Dict[str, Any]:
    user_id = params.get("user_id")
    if not user_id:
        return {"error": "user_id required"}
    return await suggest_skills_to_learn(user_id=user_id)

async def handle_suggest_job_improvements(params: Dict[str, Any]) -> Dict[str, Any]:
    job_id = params.get("job_id")
    if not job_id:
        return {"error": "job_id required"}
    return await suggest_job_improvements(job_id=job_id)

async def handle_analyze_user_behavior(params: Dict[str, Any]) -> Dict[str, Any]:
    user_id = params.get("user_id")
    if not user_id:
        return {"error": "user_id required"}
    return await analyze_user_behavior(user_id=user_id)

async def handle_get_user_profile(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get user profile information"""
    try:
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required"}
        
        profile = await get_user_context(user_id)
        return {"success": True, "profile": profile}
    except Exception as e:
        return {"error": str(e)}

        if not user_id:
            return {"error": "user_id required"}
        
        # Simple fraud detection heuristics
        profile = await get_user_context(user_id)
        transactions = await get_wallet_transactions_db(user_id, limit=20)
        
        risk_score = 0.0
        
        # High number of failed transactions
        failed_count = len([t for t in transactions if t.get("status") == "failed"])
        if failed_count > 5:
            risk_score += 0.3
        
        # Unusual transaction amounts
        amounts = [t.get("amount", 0) for t in transactions]
        if amounts and max(amounts) > 100000:  # Large transactions
            risk_score += 0.2
        
        # New user with immediate large transactions
        if profile and profile.get("created_at"):
            # Simple check - would need proper date parsing
            risk_score += 0.1
        
        return {"success": True, "risk_score": min(risk_score, 1.0), "user_id": user_id}
    except Exception as e:
        return {"error": str(e)}

async def handle_detect_fake_jobs(params: Dict[str, Any]) -> Dict[str, Any]:
    """Detect potentially fake or spam jobs"""
    try:
        job_id = params.get("job_id")
        if not job_id:
            return {"error": "job_id required"}
        
        job = await get_job_details(job_id)
        if not job:
            return {"error": "Job not found"}
        
        is_fake = False
        reasons = []
        
        # Simple heuristics for fake job detection
        if job.get("budget_max", 0) > 500000:  # Unrealistically high budget
            is_fake = True
            reasons.append("unrealistic_budget")
        
        if not job.get("description") or len(job.get("description", "")) < 10:
            is_fake = True
            reasons.append("insufficient_description")
        
        if not job.get("required_skills"):
            is_fake = True
            reasons.append("no_skills_specified")
        
        return {"success": True, "is_fake": is_fake, "reasons": reasons, "job_id": job_id}
    except Exception as e:
        return {"error": str(e)}

async def handle_detect_inactive_users(params: Dict[str, Any]) -> Dict[str, Any]:
    """Detect users who have been inactive"""
    try:
        days_threshold = params.get("days", 30)
        
        # Get platform stats and check for inactive patterns
        stats = await get_platform_stats()
        
        # Simple heuristic: users with no recent activity
        # In a real system, this would check last login dates
        inactive_users = []
        
        # For now, return empty list as we don't have activity tracking
        return {"success": True, "inactive_users": inactive_users, "days_threshold": days_threshold}
    except Exception as e:
        return {"error": str(e)}

async def handle_detect_churn_risk(params: Dict[str, Any]) -> Dict[str, Any]:
    """Detect users at risk of churning"""
    try:
        # Get users with low activity or poor engagement
        # Simple heuristic based on available data
        
        at_risk = []
        
        # In a real system, this would analyze:
        # - Time since last login
        # - Transaction frequency
        # - Job completion rates
        # - Support ticket frequency
        
        return {"success": True, "at_risk": at_risk, "analysis_period": "30_days"}
    except Exception as e:
        return {"error": str(e)}

async def handle_optimize_pricing(params: Dict[str, Any]) -> Dict[str, Any]:
    """Suggest optimal pricing for jobs"""
    try:
        job_type = params.get("job_type", "")
        location = params.get("location", "")
        
        # Simple pricing optimization based on location and job type
        base_price = 5000  # KES
        
        if location in ["Nairobi", "Mombasa"]:
            base_price *= 1.2  # Higher in major cities
        
        if "urgent" in job_type.lower():
            base_price *= 1.3  # Premium for urgent jobs
        
        suggested_price = int(base_price)
        
        return {"success": True, "suggested_price": suggested_price, "job_type": job_type, "location": location}
    except Exception as e:
        return {"error": str(e)}

async def handle_suggest_skills_to_learn(params: Dict[str, Any]) -> Dict[str, Any]:
    """Suggest skills for a worker to learn based on market demand"""
    try:
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required"}
        
        profile = await get_worker_full_profile(user_id)
        if not profile:
            return {"error": "Worker profile not found"}
        
        current_skills = profile.get("skills", [])
        
        # Get high-demand skills from job market
        # Simple suggestion based on common in-demand skills
        in_demand_skills = [
            "Digital Marketing", "Data Analysis", "Mobile Development", 
            "Cloud Computing", "Project Management", "UI/UX Design"
        ]
        
        # Suggest skills not already possessed
        suggestions = [skill for skill in in_demand_skills if skill not in current_skills][:5]
        
        return {"success": True, "skills": suggestions, "current_skills_count": len(current_skills)}
    except Exception as e:
        return {"error": str(e)}


async def handle_verify_face_match(params: Dict[str, Any]) -> Dict[str, Any]:
    """Verify if a selfie matches the face on an ID document using AI face recognition."""
    try:
        id_image_url = params.get("id_image_url")
        selfie_url = params.get("selfie_url")
        threshold = params.get("threshold", 70)
        
        if not id_image_url or not selfie_url:
            return {"error": "Both id_image_url and selfie_url are required"}
        
        # Import required libraries
        import face_recognition
        import requests
        import numpy as np
        from PIL import Image
        import io
        
        # Download images
        try:
            id_response = requests.get(id_image_url, timeout=10)
            selfie_response = requests.get(selfie_url, timeout=10)
            
            id_response.raise_for_status()
            selfie_response.raise_for_status()
        except Exception as e:
            return {"error": f"Failed to download images: {str(e)}"}
        
        # Load images
        try:
            id_image = face_recognition.load_image_file(io.BytesIO(id_response.content))
            selfie_image = face_recognition.load_image_file(io.BytesIO(selfie_response.content))
        except Exception as e:
            return {"error": f"Failed to load images: {str(e)}"}
        
        # Get face encodings
        try:
            id_face_encodings = face_recognition.face_encodings(id_image)
            selfie_face_encodings = face_recognition.face_encodings(selfie_image)
            
            if not id_face_encodings:
                return {"error": "No face found in ID image", "success": False}
                
            if not selfie_face_encodings:
                return {"error": "No face found in selfie image", "success": False}
        except Exception as e:
            return {"error": f"Failed to encode faces: {str(e)}"}
        
        # Compare faces
        try:
            # Use the first face found in each image
            face_distance = face_recognition.face_distance([id_face_encodings[0]], selfie_face_encodings[0])[0]
            
            # Convert distance to similarity score (0-100)
            # face_recognition returns distance where lower is better match
            # Typical threshold is ~0.6 for good match
            similarity_score = max(0, (1 - face_distance) * 100)
            
            # Determine if faces match based on threshold
            is_match = similarity_score >= threshold
            
            return {
                "success": True,
                "is_match": is_match,
                "similarity_score": round(similarity_score, 2),
                "threshold": threshold,
                "face_distance": round(face_distance, 4),
                "message": "Faces match" if is_match else "Faces do not match"
            }
        except Exception as e:
            return {"error": f"Failed to compare faces: {str(e)}"}
            
    except ImportError as e:
        return {"error": f"Required libraries not installed: {str(e)}"}
    except Exception as e:
        return {"error": f"Face verification failed: {str(e)}"}

async def handle_suggest_job_improvements(params: Dict[str, Any]) -> Dict[str, Any]:
    """Suggest improvements for a job posting"""
    try:
        job_id = params.get("job_id")
        if not job_id:
            return {"error": "job_id required"}
        
        job = await get_job_details(job_id)
        if not job:
            return {"error": "Job not found"}
        
        improvements = []
        
        # Analyze job posting and suggest improvements
        if not job.get("description") or len(job.get("description", "")) < 20:
            improvements.append("Add a detailed job description explaining responsibilities and requirements")
        
        if not job.get("required_skills"):
            improvements.append("Specify required skills to attract qualified candidates")
        
        budget_max = job.get("budget_max", 0)
        if budget_max <= 0:
            improvements.append("Set a competitive budget to attract quality workers")
        elif budget_max < 3000:
            improvements.append("Consider increasing budget for better candidate quality")
        
        if not job.get("location"):
            improvements.append("Specify job location or indicate if remote work is allowed")
        
        return {"success": True, "improvements": improvements, "job_id": job_id}
    except Exception as e:
        return {"error": str(e)}

async def handle_analyze_user_behavior(params: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze user behavior patterns"""
    try:
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required"}
        
        # Get user activity data
        profile = await get_user_context(user_id)
        history = await get_worker_history(user_id, limit=20)
        transactions = await get_wallet_transactions_db(user_id, limit=10)
        
        insights = {
            "total_jobs_completed": len([h for h in history if h.get("status") == "completed"]),
            "average_rating": profile.get("average_rating", 0) if profile else 0,
            "transaction_frequency": len(transactions),
            "preferred_job_types": [],  # Would need more complex analysis
            "activity_level": "active" if len(history) > 5 else "moderate" if len(history) > 0 else "low",
        }
        
        return {"success": True, "insights": insights, "user_id": user_id}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_match_score(params: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate match score between worker and job"""
    try:
        worker_id = params.get("worker_id")
        job_id = params.get("job_id")
        
        if not worker_id or not job_id:
            return {"error": "worker_id and job_id required"}
        
        # Get worker and job details
        worker = await get_worker_full_profile(worker_id)
        job = await get_job_details(job_id)
        
        if not worker or not job:
            return {"error": "Worker or job not found"}
        
        # Simple matching algorithm
        score = 0.5  # Base score
        
        # Location match
        if worker.get("county") == job.get("location"):
            score += 0.2
        
        # Skills match (simplified)
        worker_skills = worker.get("skills", [])
        job_skills = job.get("required_skills", [])
        if any(skill in worker_skills for skill in job_skills):
            score += 0.2
        
        # Rating bonus
        rating = worker.get("average_rating", 0)
        if rating >= 4.5:
            score += 0.1
        
        # Cap at 1.0
        score = min(score, 1.0)
        
        return {"success": True, "score": score, "worker_id": worker_id, "job_id": job_id}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_user_profile(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get user profile information"""
    try:
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required"}
        
        profile = await get_user_context(user_id)
        return {"success": True, "profile": profile}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_user_role(params: Dict[str, Any]) -> Dict[str, Any]:
    user_id = params.get("user_id")
    if not user_id:
        return {"error": "user_id required"}
    profile = await get_user_context(user_id)
    return {"success": True, "profile": profile}

async def handle_get_user_activity(params: Dict[str, Any]) -> Dict[str, Any]:
    user_id = params.get("user_id")
    if not user_id:
        return {"error": "user_id required"}
    # Get worker history as activities
    activities = await get_worker_history(user_id, limit=20)
    return {"success": True, "activity": activities}

async def handle_get_user_statistics(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get user statistics"""
    try:
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required"}
        
        # Get platform stats and filter for user-specific data
        stats = await get_platform_stats()
        user_stats = {
            "total_jobs": stats.get("total_jobs", 0),
            "total_workers": stats.get("total_workers", 0),
            "total_employers": stats.get("total_employers", 0),
            "active_jobs": stats.get("active_jobs", 0),
        }
        return {"success": True, "statistics": user_stats}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_user_activity_summary(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get user activity summary"""
    try:
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required"}
        
        # Get recent activity from worker history
        history = await get_worker_history(user_id, limit=50)
        
        summary = {
            "total_activities": len(history),
            "recent_jobs": len([h for h in history if h.get("status") == "completed"]),
            "active_jobs": len([h for h in history if h.get("status") == "in_progress"]),
            "last_activity": history[0] if history else None,
        }
        return {"success": True, "summary": summary}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_user_history(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get user history"""
    try:
        user_id = params.get("user_id")
        limit = min(params.get("limit", 20), 50)
        
        if not user_id:
            return {"error": "user_id required"}
        
        history = await get_worker_history(user_id, limit=limit)
        return {"success": True, "history": history}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_jobs_nearby(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get jobs near a location"""
    try:
        location = params.get("location") or params.get("county")
        radius = params.get("radius", 50)  # km
        limit = min(params.get("limit", 10), 20)
        
        if not location:
            return {"error": "location or county required"}
        
        # For now, use location-based filtering (county matching)
        jobs = await get_jobs(location=location, status="open", limit=limit)
        return {"success": True, "jobs": jobs, "location": location, "radius_km": radius}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_workers_nearby(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get workers near a location"""
    try:
        location = params.get("location") or params.get("county")
        radius = params.get("radius", 50)  # km
        limit = min(params.get("limit", 10), 20)
        
        if not location:
            return {"error": "location or county required"}
        
        # Search for available workers in the location
        workers = await search_available_workers(location=location, limit=limit)
        return {"success": True, "workers": workers, "location": location, "radius_km": radius}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_agents_nearby(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get agents near a location"""
    try:
        location = params.get("location") or params.get("county")
        radius = params.get("radius", 50)  # km
        limit = min(params.get("limit", 10), 20)
        
        if not location:
            return {"error": "location or county required"}
        
        # Get agents and filter by location if available
        agents = await get_agents(status="available", limit=limit)
        # Note: Location filtering would need location data in agents table
        nearby_agents = [a for a in agents if a.get("location") == location]
        
        return {"success": True, "agents": nearby_agents, "location": location, "radius_km": radius}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_location_demand(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get job demand in a location"""
    try:
        location = params.get("location") or params.get("county")
        if not location:
            return {"error": "location required"}
        
        # Get location analytics
        analytics = await get_location_analytics()
        demand = analytics.get(location, {}).get("demand_score", 0)
        
        return {"success": True, "demand": demand, "location": location}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_location_supply(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get worker supply in a location"""
    try:
        location = params.get("location") or params.get("county")
        if not location:
            return {"error": "location required"}
        
        # Get location analytics
        analytics = await get_location_analytics()
        supply = analytics.get(location, {}).get("supply_score", 0)
        
        return {"success": True, "supply": supply, "location": location}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_notifications(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get user notifications"""
    try:
        user_id = params.get("user_id")
        limit = min(params.get("limit", 20), 50)
        
        if not user_id:
            return {"error": "user_id required"}
        
        notifications = await get_user_notifications_db(user_id, limit=limit)
        return {"success": True, "notifications": notifications}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_user_notifications(params: Dict[str, Any]) -> Dict[str, Any]:
    user_id = params.get("user_id")
    limit = min(params.get("limit", 20), 100)
    if not user_id:
        return {"error": "user_id required"}
    notifications = await get_user_notifications_db(user_id, limit=limit)
    return {"success": True, "notifications": notifications, "count": len(notifications)}

async def handle_get_job_applications(params: Dict[str, Any]) -> Dict[str, Any]:
    job_id = params.get("job_id")
    limit = min(params.get("limit", 20), 100)
    if not job_id:
        return {"error": "job_id required"}
    applications = await get_applications(job_id=job_id, limit=limit)
    return {"success": True, "applications": applications, "count": len(applications)}

async def handle_get_user_applications(params: Dict[str, Any]) -> Dict[str, Any]:
    user_id = params.get("user_id")
    limit = min(params.get("limit", 20), 100)
    if not user_id:
        return {"error": "user_id required"}
    applications = await get_applications(applicant_id=user_id, limit=limit)
    return {"success": True, "applications": applications, "count": len(applications)}

async def handle_shortlist_candidates(params: Dict[str, Any]) -> Dict[str, Any]:
    """Shortlist candidates for a job"""
    try:
        job_id = params.get("job_id")
        limit = min(params.get("limit", 5), 10)
        
        if not job_id:
            return {"error": "job_id required"}
        
        # Get available workers for the job
        candidates = await get_available_workers_for_job(job_id, limit=limit)
        
        # Rank them (simple ranking by rating for now)
        ranked_candidates = sorted(
            candidates, 
            key=lambda x: x.get("average_rating", 0), 
            reverse=True
        )[:limit]
        
        return {"success": True, "shortlist": ranked_candidates}
    except Exception as e:
        return {"error": str(e)}

async def handle_auto_match_workers(params: Dict[str, Any]) -> Dict[str, Any]:
    """Auto-match workers to a job"""
    try:
        job_id = params.get("job_id")
        limit = min(params.get("limit", 3), 5)
        
        if not job_id:
            return {"error": "job_id required"}
        
        # Use the ranking function to get best matches
        matches = await get_available_workers_for_job(job_id, limit=limit)
        
        # Sort by match score (using rating as proxy)
        sorted_matches = sorted(
            matches,
            key=lambda x: x.get("average_rating", 0),
            reverse=True
        )[:limit]
        
        return {"success": True, "matches": sorted_matches}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_organisation_profile(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    if not user_jwt:
        return {"error": "Authentication required"}
    
    try:
        org_id = _get_user_org_id(user_jwt)
        if not org_id:
            return {"error": "No organisation associated with user"}
        
        org = await get_organisation(org_id)
        return {"success": True, "profile": org}
    except Exception as e:
        return {"error": str(e)}


async def handle_get_organisation_users(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    if not user_jwt:
        return {"error": "Authentication required"}
    
    try:
        org_id = _get_user_org_id(user_jwt)
        if not org_id:
            return {"error": "No organisation associated with user"}
        
        # Get agents for the organisation
        agents = await get_agents(org_id=org_id, limit=100)
        return {"success": True, "users": agents, "count": len(agents)}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_organisation_stats(params: Dict[str, Any]) -> Dict[str, Any]:
    org_id = params.get("org_id")
    if not org_id:
        return {"error": "org_id required"}
    stats = await get_org_stats(org_id)
    return {"success": True, "stats": stats}

async def handle_get_organisation_jobs(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get jobs posted by an organisation"""
    try:
        org_id = params.get("org_id")
        limit = min(params.get("limit", 20), 50)
        
        if not org_id:
            return {"error": "org_id required"}
        
        # Get organisation jobs
        jobs = await get_jobs(employer_id=org_id, limit=limit)
        return {"success": True, "jobs": jobs}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_employer_dashboard(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get employer dashboard data"""
    try:
        employer_id = params.get("employer_id")
        if not employer_id:
            return {"error": "employer_id required"}
        
        # Get employer's jobs and stats
        jobs = await get_jobs(employer_id=employer_id, limit=50)
        stats = await get_platform_stats()
        
        dashboard = {
            "total_jobs": len(jobs),
            "active_jobs": len([j for j in jobs if j.get("status") == "open"]),
            "completed_jobs": len([j for j in jobs if j.get("status") == "completed"]),
            "total_spent": sum(j.get("budget_max", 0) for j in jobs if j.get("status") == "completed"),
            "recent_jobs": jobs[:5],
        }
        return {"success": True, "dashboard": dashboard}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_audit_logs(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Get audit logs (admin only)"""
    if not user_jwt:
        return {"error": "Authentication required", "action": "Please log in as an admin"}
    
    try:
        role = _get_user_role(user_jwt)
        if role not in ["super_admin", "admin"]:
            return {"error": "Insufficient permissions", "action": "Admin access required"}
        
        limit = min(params.get("limit", 50), 100)
        
        # Get audit logs
        logs = await get_audit_logs_db(limit=limit)
        return {"success": True, "logs": logs}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_security_alerts(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Get security alerts (admin only)"""
    if not user_jwt:
        return {"error": "Authentication required", "action": "Please log in as an admin"}
    
    try:
        limit = min(params.get("limit", 20), 50)
        
        # For now, return empty alerts (would need security monitoring system)
        alerts = []
        return {"success": True, "alerts": alerts}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_system_status(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    if not user_jwt:
        return {"error": "Authentication required"}
    
    try:
        role = _get_user_role(user_jwt)
        if role not in ["super_admin", "admin"]:
            return {"error": "Insufficient permissions"}
        
        # TODO: Implement real health checks
        return {"success": True, "status": {"api": "healthy", "ai": "healthy", "db": "healthy"}}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_api_usage(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Get API usage statistics (admin only)"""
    if not user_jwt:
        return {"error": "Authentication required"}
    
    try:
        days = min(params.get("days", 30), 90)
        
        # Get platform stats as usage proxy
        stats = await get_platform_stats()
        
        usage = {
            "total_requests": stats.get("total_api_calls", 0),
            "active_users": stats.get("active_users", 0),
            "period_days": days,
        }
        return {"success": True, "usage": usage}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_error_reports(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Get error reports (admin only)"""
    if not user_jwt:
        return {"error": "Authentication required"}
    
    try:
        limit = min(params.get("limit", 50), 100)
        
        # For now, return empty errors (would need error logging system)
        errors = []
        return {"success": True, "errors": errors}
    except Exception as e:
        return {"error": str(e)}

async def handle_log_issue(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Log an issue or bug report"""
    if not user_jwt:
        return {"error": "Authentication required"}
    
    try:
        issue_description = params.get("description", "")
        severity = params.get("severity", "medium")
        
        if not issue_description:
            return {"error": "description required"}
        
        # Generate a simple issue ID
        issue_id = f"ISSUE-{int(datetime.now().timestamp())}"
        
        # In a real system, this would save to database
        logger.info(f"Issue logged: {issue_id} - {issue_description} (severity: {severity})")
        
        return {"success": True, "issue_id": issue_id, "status": "logged"}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_open_issues(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Get open issues (admin only)"""
    if not user_jwt:
        return {"error": "Authentication required"}
    
    try:
        limit = min(params.get("limit", 20), 50)
        
        # For now, return empty issues (would need issue tracking system)
        issues = []
        return {"success": True, "issues": issues}
    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# WRITE OPERATION HANDLERS (require authentication)
# ─────────────────────────────────────────────────────────────────────────────

async def handle_job_write(tool_name: str, params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Handle job write operations through NestJS API"""
    if not user_jwt:
        return {"error": "Authentication required", "action": f"Please log in to {tool_name.replace('_', ' ')}"}
    if tool_name == "create_job":
        return await create_job(params, user_jwt)
    if tool_name == "update_job":
        return await update_job(params, user_jwt)
    if tool_name == "close_job":
        return await close_job(params, user_jwt)
    if tool_name == "extend_job_deadline":
        return await extend_job_deadline(params, user_jwt)
    return {"success": False, "error": f"Unknown job write tool: {tool_name}"}

async def handle_agent_write(tool_name: str, params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Handle agent write operations"""
    if not user_jwt:
        return {"error": "Authentication required"}
    if tool_name == "assign_agent_to_job":
        return await assign_agent_to_job(params, user_jwt)
    if tool_name == "reassign_agent":
        return await reassign_agent(params, user_jwt)
    return {"success": False, "error": f"Unknown agent write tool: {tool_name}"}

async def handle_task_write(tool_name: str, params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Handle task write operations"""
    if not user_jwt:
        return {"error": "Authentication required"}
    if tool_name == "create_task":
        # If agent_name is given instead of agent_id, resolve it now
        if params.get("agent_name") and not params.get("agent_id"):
            agents = await get_agents(name=params["agent_name"].strip(), limit=5)
            if not agents:
                return {"success": False, "error": f"No agent found with name '{params['agent_name']}'. Check the name and try again."}
            resolved = {**params, "agent_id": str(agents[0]["id"])}
            resolved.pop("agent_name", None)
            return await create_task(resolved, user_jwt)
        clean = {k: v for k, v in params.items() if k != "agent_name"}
        return await create_task(clean, user_jwt)
    if tool_name == "update_task_status":
        return await update_task_status(params, user_jwt)
    return {"success": False, "error": f"Unknown task write tool: {tool_name}"}

_STAGE_TTL = 300  # seconds — staged withdrawal expires in 5 minutes

async def _payment_verification_gate(user_id: str) -> Optional[str]:
    """
    Pre-payment verification gate for withdrawals.

    Returns None when the payment may proceed, or a human-readable error string
    when the payment must be blocked.

    Checks:
    1. No open/in-progress disputes involving this agent.
    2. (Extensible: task completion photo, fraud score threshold, etc.)
    """
    try:
        disputes = await get_disputes_db(user_id=user_id, status="open")
        open_disputes = [d for d in disputes if d.get("status") in ("open", "in_progress", "escalated")]
        if open_disputes:
            return (
                f"Withdrawal blocked: you have {len(open_disputes)} open dispute(s) on your account. "
                "All disputes must be resolved before funds can be withdrawn. "
                "Visit **Disputes** in the app to view details."
            )
    except Exception as exc:
        logger.warning(f"Payment gate dispute check failed (fail-open): {exc}")
        # Fail open — a DB error should not permanently block legitimate payments
    return None


async def handle_stage_withdrawal(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """
    Step 1 of the two-step withdrawal flow.
    Validates the request, generates a short-lived confirmation token, and
    returns a human-readable preview for Claude to present to the user.
    """
    if not user_jwt:
        return {"error": "Authentication required"}

    amount = params.get("amount")
    phone  = params.get("mpesa_phone", "")

    if not amount or float(amount) < 10:
        return {"error": "Minimum withdrawal amount is KES 10."}
    if not phone:
        return {"error": "M-Pesa phone number is required."}

    # Run verification gate before staging — catches disputes early
    user_id = _get_user_id_from_jwt(user_jwt)
    if user_id:
        gate_error = await _payment_verification_gate(user_id)
        if gate_error:
            return {"error": gate_error, "blocked_by": "payment_verification_gate"}

    phone_display = phone.strip()
    token = f"wdl_{secrets.token_urlsafe(12)}"
    requires_otp = float(amount) >= _HIGH_VALUE_KES

    # For high-value withdrawals, dispatch OTP before staging so the user
    # receives it while reviewing the preview.
    if requires_otp and user_jwt:
        otp_sent = await send_payment_otp(user_jwt)
        if not otp_sent:
            logger.warning("Payment OTP dispatch failed for high-value withdrawal")
            # Fail safe: block the staging — we cannot allow the withdrawal
            # to proceed without OTP verification.
            return {"error": "Could not send payment verification code. Please try again."}

    r = _get_redis()
    if r:
        try:
            r.setex(
                f"pay:staged:{token}",
                _STAGE_TTL,
                json.dumps({
                    "amount":       float(amount),
                    "phone":        phone,
                    "user_jwt":     user_jwt,
                    "user_id":      user_id,
                    "requires_otp": requires_otp,
                }),
            )
        except Exception as exc:
            logger.error(f"Failed to stage withdrawal in Redis: {exc}")
            return {"error": "Could not stage withdrawal — please try again."}
    else:
        # Redis unavailable — block the operation; we cannot guarantee idempotency without it
        return {"error": "Payment service temporarily unavailable. Please try again in a moment."}

    otp_notice = (
        " **A verification code has been sent to your registered phone and email."
        " You will need to include it when you confirm.**"
        if requires_otp else ""
    )
    return {
        "staged": True,
        "confirmation_token": token,
        "expires_in_seconds": _STAGE_TTL,
        "requires_otp": requires_otp,
        "preview": (
            f"You are about to withdraw **KES {float(amount):,.0f}** "
            f"to M-Pesa number **{phone_display}**. "
            f"This action cannot be undone once submitted.{otp_notice}"
        ),
        "instruction": (
            "Present this preview to the user. "
            + (
                "Because this is a high-value withdrawal, ask the user to type 'CONFIRM <OTP code>' "
                "before calling execute_staged_withdrawal. The otp_code parameter is required."
                if requires_otp else
                "Ask the user to type 'CONFIRM' before calling execute_staged_withdrawal."
            )
        ),
    }


async def handle_execute_staged_withdrawal(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """
    Step 2 of the two-step withdrawal flow.
    Reads and deletes the staged intent from Redis, then executes the withdrawal.
    """
    if not user_jwt:
        return {"error": "Authentication required"}

    token = params.get("confirmation_token", "").strip()
    if not token or not token.startswith("wdl_"):
        return {"error": "Invalid confirmation token."}

    r = _get_redis()
    if not r:
        return {"error": "Payment service temporarily unavailable. Please try again."}

    redis_key = f"pay:staged:{token}"
    try:
        raw = r.get(redis_key)
    except Exception as exc:
        logger.error(f"Redis read error during execute_staged_withdrawal: {exc}")
        return {"error": "Payment service temporarily unavailable. Please try again."}

    if not raw:
        return {
            "error": (
                "Confirmation token not found or expired. "
                "Please call stage_withdrawal again to generate a new confirmation."
            )
        }

    try:
        staged = json.loads(raw)
    except Exception:
        r.delete(redis_key)
        return {"error": "Staged withdrawal data is corrupted. Please start over with stage_withdrawal."}

    staged_jwt = staged.get("user_jwt", user_jwt)

    # High-value withdrawals require OTP verification BEFORE the key is consumed.
    # If OTP is wrong, leave the staged key intact so the user can retry.
    if staged.get("requires_otp"):
        otp_code = params.get("otp_code", "").strip()
        if not otp_code:
            return {
                "error": (
                    "This withdrawal requires a verification code. "
                    "Please provide the OTP sent to your phone/email as 'otp_code'."
                ),
                "requires_otp": True,
            }
        otp_valid = await verify_payment_otp(staged_jwt, otp_code)
        if not otp_valid:
            return {
                "error": (
                    "Invalid or expired verification code. "
                    "Please check the code sent to your phone/email and try again."
                ),
                "requires_otp": True,
            }

    # One-use: delete the key before executing so it cannot be replayed
    r.delete(redis_key)

    # Re-run the verification gate at execution time — conditions may have changed
    # between staging (step 1) and execution (step 2).
    exec_user_id = staged.get("user_id") or _get_user_id_from_jwt(staged.get("user_jwt", user_jwt))
    if exec_user_id:
        gate_error = await _payment_verification_gate(exec_user_id)
        if gate_error:
            return {"error": gate_error, "blocked_by": "payment_verification_gate"}

    # Execute using the JWT from the staging step
    withdrawal_params = {
        "amount": staged["amount"],
        "mpesa_phone": staged["phone"],
    }
    return await initiate_withdrawal(withdrawal_params, staged_jwt)

async def handle_notification_write(tool_name: str, params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Handle notification write operations"""
    if not user_jwt:
        return {"error": "Authentication required"}
    if tool_name == "send_notification":
        return await send_notification(params, user_jwt)
    if tool_name == "broadcast_message":
        return await broadcast_message(params, user_jwt)
    if tool_name == "send_job_alerts":
        return await send_job_alerts(params, user_jwt)
    return {"success": False, "error": f"Unknown notification write tool: {tool_name}"}

async def handle_application_write(tool_name: str, params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Handle application write operations"""
    if not user_jwt:
        return {"error": "Authentication required"}
    if tool_name == "apply_to_job":
        return await apply_to_job(params, user_jwt)
    if tool_name == "accept_application":
        return await accept_application(params, user_jwt)
    if tool_name == "reject_application":
        return await reject_application(params, user_jwt)
    return {"success": False, "error": f"Unknown application write tool: {tool_name}"}

async def handle_admin_write(tool_name: str, params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Handle admin write operations"""
    if not user_jwt:
        return {"error": "Authentication required for admin operations"}
    if tool_name == "flag_user":
        return await flag_user(params, user_jwt)
    if tool_name == "flag_job":
        return await flag_job(params, user_jwt)
    if tool_name == "detect_anomalies":
        return await detect_anomalies(params, user_jwt)
    return {"success": False, "error": f"Unknown admin write tool: {tool_name}"}


# ─────────────────────────────────────────────────────────────────────────────
# DISPUTE HANDLERS
# ─────────────────────────────────────────────────────────────────────────────

async def handle_get_disputes(params: Dict[str, Any]) -> Dict[str, Any]:
    user_id = params.get("user_id")
    org_id = params.get("org_id")
    status = params.get("status")
    limit = min(params.get("limit", 20), 50)
    disputes = await get_disputes_db(user_id=user_id, org_id=org_id, status=status, limit=limit)
    return {"success": True, "disputes": disputes, "count": len(disputes)}

async def handle_get_dispute_stats(params: Dict[str, Any]) -> Dict[str, Any]:
    stats = await get_dispute_stats_db()
    return {"success": True, "stats": stats}

async def handle_get_dispute_resolution_policy(params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "success": True,
        "policy": {
            "process": [
                "1. Claimant files dispute via the app or website, providing evidence.",
                "2. Defendant is notified and has 72 hours to respond.",
                "3. Our team reviews evidence from both parties.",
                "4. Admin makes a resolution decision within 7 business days.",
                "5. Both parties are notified of the outcome.",
            ],
            "sla_hours": 72,
            "possible_outcomes": {
                "PAYMENT_RELEASED": "Disputed payment is released to the claimant.",
                "REFUND_ISSUED": "Full refund credited to the affected party's wallet.",
                "PARTIAL_REFUND": "A portion of the disputed amount is refunded.",
                "NO_ACTION": "Dispute found to be unfounded; no changes made.",
                "WARNING_ISSUED": "A formal warning is issued to the offending party.",
                "ACCOUNT_SUSPENDED": "Severe or repeated violations result in account suspension.",
            },
            "dispute_types": ["payment", "quality", "non_delivery", "fraud", "harassment", "other"],
            "evidence_tips": [
                "Screenshots of conversations",
                "Photos of work completed or not completed",
                "Payment receipts or M-Pesa confirmations",
                "Job agreement or contract details",
            ],
        },
    }

async def handle_get_refund_policy(params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "success": True,
        "policy": {
            "eligible_scenarios": [
                "Job cancelled after payment but before work started",
                "Work not delivered as described",
                "Payment made in error (duplicate charge)",
                "Dispute resolved in claimant's favour",
                "Fraudulent job posting confirmed by admin",
            ],
            "processing_time": "3–5 business days after approval",
            "refund_method": "Credited directly to the Gigs4You wallet (KES). Can then be withdrawn via M-Pesa.",
            "non_refundable": [
                "Platform fees on completed jobs",
                "Voluntary withdrawals from agreed contracts",
                "Work already completed and accepted",
            ],
            "how_to_request": "File a dispute from your profile → Dispute Centre, or contact support.",
            "contact": "support@gigs4you.co.ke",
        },
    }

async def handle_file_dispute(params: Dict[str, Any]) -> Dict[str, Any]:
    """Guide user on how to file a dispute (read-only Cathy — links to in-app flow)."""
    dispute_type = params.get("type", "other")
    return {
        "success": True,
        "message": (
            f"To file a '{dispute_type}' dispute, go to **Profile → Dispute Centre → New Dispute** "
            "in the app. You'll need: the other party's details, a description of the issue, "
            "and any evidence (screenshots, photos, M-Pesa refs). "
            "Our team will respond within 72 hours."
        ),
        "note": "Cathy cannot file disputes on your behalf — this must be done through the app for security.",
    }

async def handle_escalate_dispute(params: Dict[str, Any]) -> Dict[str, Any]:
    dispute_id = params.get("dispute_id")
    return {
        "success": True,
        "message": (
            f"To escalate dispute {dispute_id or 'your dispute'}, email **support@gigs4you.co.ke** "
            "with subject 'ESCALATION – [your dispute ID]'. Include your account email and a brief "
            "explanation of why you believe the original decision was incorrect."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# SUBSCRIPTION & BILLING HANDLERS
# ─────────────────────────────────────────────────────────────────────────────

async def handle_get_subscription_info(params: Dict[str, Any]) -> Dict[str, Any]:
    org_id = params.get("org_id")
    if not org_id:
        return {"error": "org_id required"}
    info = await get_subscription_info(org_id)
    return {"success": True, "subscription": info}

async def handle_get_subscription_plans(params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "success": True,
        "plans": [
            {
                "name": "FREE",
                "price_kes_monthly": 0,
                "max_agents": 5,
                "max_jobs": 10,
                "features": ["Basic job posting", "Manual agent assignment", "Email support"],
            },
            {
                "name": "STARTER",
                "price_kes_monthly": 2_500,
                "max_agents": 15,
                "max_jobs": 30,
                "features": ["Everything in FREE", "GPS tracking", "Task management", "Push notifications"],
            },
            {
                "name": "GROWTH",
                "price_kes_monthly": 6_500,
                "max_agents": 50,
                "max_jobs": 100,
                "features": ["Everything in STARTER", "AI matching", "Analytics dashboard", "Org wallet", "Priority support"],
            },
            {
                "name": "SCALE",
                "price_kes_monthly": 15_000,
                "max_agents": 200,
                "max_jobs": 500,
                "features": ["Everything in GROWTH", "Cathy AI assistant", "Advanced fraud detection", "Audit logs", "API access"],
            },
            {
                "name": "ENTERPRISE",
                "price_kes_monthly": "Custom",
                "max_agents": "Unlimited",
                "max_jobs": "Unlimited",
                "features": ["Everything in SCALE", "Dedicated account manager", "Custom integrations", "SLA guarantee", "On-site training"],
            },
        ],
        "note": "All plans billed monthly in KES. Annual billing available at 20% discount. Contact sales@gigs4you.co.ke for ENTERPRISE pricing.",
    }

async def handle_get_billing_history(params: Dict[str, Any]) -> Dict[str, Any]:
    org_id = params.get("org_id")
    if not org_id:
        return {"error": "org_id required"}
    limit = min(params.get("limit", 10), 50)
    invoices = await get_billing_history(org_id, limit=limit)
    return {"success": True, "invoices": invoices, "count": len(invoices)}

async def handle_check_plan_limits(params: Dict[str, Any]) -> Dict[str, Any]:
    org_id = params.get("org_id")
    if not org_id:
        return {"error": "org_id required"}
    sub = await get_subscription_info(org_id)
    stats = await get_org_stats(org_id)
    if not sub:
        return {"success": True, "plan": "FREE", "note": "No active subscription found."}
    agent_usage = stats.get("confirmed_agents", 0)
    max_agents = sub.get("max_agents") or 5
    at_limit = isinstance(max_agents, int) and agent_usage >= max_agents
    return {
        "success": True,
        "plan": sub.get("plan"),
        "agents": {"used": agent_usage, "limit": max_agents, "at_limit": at_limit},
        "recommendation": "Consider upgrading your plan." if at_limit else "You have room to grow.",
    }

async def handle_recommend_plan_upgrade(params: Dict[str, Any]) -> Dict[str, Any]:
    org_id = params.get("org_id")
    if not org_id:
        return {"error": "org_id required"}
    sub = await get_subscription_info(org_id)
    stats = await get_org_stats(org_id)
    current_plan = sub.get("plan", "FREE") if sub else "FREE"
    agents = stats.get("confirmed_agents", 0)
    upgrade_map = {"FREE": "STARTER", "STARTER": "GROWTH", "GROWTH": "SCALE", "SCALE": "ENTERPRISE"}
    next_plan = upgrade_map.get(current_plan)
    return {
        "success": True,
        "current_plan": current_plan,
        "current_agents": agents,
        "recommended_upgrade": next_plan,
        "reason": f"Your team has {agents} agents on the {current_plan} plan. Upgrading to {next_plan} unlocks more capacity and features.",
    }


# ─────────────────────────────────────────────────────────────────────────────
# VERIFICATION & KYC HANDLERS
# ─────────────────────────────────────────────────────────────────────────────

async def handle_get_verification_status(params: Dict[str, Any]) -> Dict[str, Any]:
    user_id = params.get("user_id")
    if not user_id:
        return {"error": "user_id required"}
    status = await get_verification_status(user_id)
    return {"success": True, "verification": status}

async def handle_get_verification_requirements(params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "success": True,
        "requirements": {
            "accepted_documents": ["National ID", "Passport", "Driving Licence"],
            "steps": [
                "1. Go to Profile → Verify Identity in the app.",
                "2. Select your document type.",
                "3. Upload a clear photo of the front of your ID (and back for National ID).",
                "4. Take a selfie following the on-screen guidance.",
                "5. Submit — our AI checks the match automatically.",
                "6. If auto-approval score is below 85%, an admin reviews within 1–2 business days.",
            ],
            "auto_approval": "Submissions with AI face-match confidence ≥ 85% are approved instantly.",
            "tips": [
                "Use good lighting — avoid shadows on your face or document.",
                "Ensure your ID is not expired.",
                "Make sure all text on the ID is clearly readable.",
                "Your selfie should match the ID photo closely.",
            ],
        },
    }

async def handle_get_pending_verifications(params: Dict[str, Any]) -> Dict[str, Any]:
    """Admin-only: list pending KYC submissions."""
    limit = min(params.get("limit", 20), 100)
    pool = await get_pool()
    if not pool:
        return {"error": "Database unavailable"}
    try:
        from ..database import get_pool as _pool_fn
        import asyncpg
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT v.id, v."userId" AS user_id, v.status,
                       v."documentType" AS document_type,
                       v."faceMatchScore" AS face_match_score,
                       v."submittedAt" AS submitted_at,
                       u.name, u.phone
                FROM verifications v
                LEFT JOIN users u ON v."userId" = u.id::text
                WHERE v.status = 'submitted'
                ORDER BY v."submittedAt" ASC
                LIMIT $1
                """,
                limit,
            )
        from ..database import _row_to_dict
        return {"success": True, "pending": [_row_to_dict(r) for r in rows], "count": len(rows)}
    except Exception as e:
        return {"error": str(e)}

async def handle_explain_verification_process(params: Dict[str, Any]) -> Dict[str, Any]:
    return await handle_get_verification_requirements(params)


# ─────────────────────────────────────────────────────────────────────────────
# TREND ANALYSIS HANDLERS
# ─────────────────────────────────────────────────────────────────────────────

async def handle_get_trend_comparison(params: Dict[str, Any]) -> Dict[str, Any]:
    metric = params.get("metric", "jobs")
    days = min(params.get("days", 7), 90)
    result = await get_trend_comparison(metric=metric, days=days)
    return {"success": True, "trend": result}

async def handle_get_platform_trends(params: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch all key metrics week-over-week and month-over-month."""
    metrics = ["users", "jobs", "applications", "tasks", "disputes"]
    results_7d = {}
    results_30d = {}
    for m in metrics:
        results_7d[m] = await get_trend_comparison(metric=m, days=7)
        results_30d[m] = await get_trend_comparison(metric=m, days=30)
    return {
        "success": True,
        "week_over_week": results_7d,
        "month_over_month": results_30d,
    }

async def handle_get_category_trends(params: Dict[str, Any]) -> Dict[str, Any]:
    """Trend in job categories over recent days."""
    days = min(params.get("days", 30), 90)
    pool = await get_pool()
    if not pool:
        return {"error": "Database unavailable"}
    try:
        async with pool.acquire() as conn:
            current = await conn.fetch(
                f"""
                SELECT category, COUNT(*) cnt FROM jobs
                WHERE "createdAt" >= NOW() - ('{days} days')::interval
                GROUP BY category ORDER BY cnt DESC LIMIT 8
                """
            )
            previous = await conn.fetch(
                f"""
                SELECT category, COUNT(*) cnt FROM jobs
                WHERE "createdAt" >= NOW() - ('{days * 2} days')::interval
                  AND "createdAt" < NOW() - ('{days} days')::interval
                GROUP BY category ORDER BY cnt DESC LIMIT 8
                """
            )
        cur_map  = {r["category"]: int(r["cnt"]) for r in current}
        prev_map = {r["category"]: int(r["cnt"]) for r in previous}
        all_cats = set(cur_map) | set(prev_map)
        trends = []
        for cat in all_cats:
            c, p = cur_map.get(cat, 0), prev_map.get(cat, 0)
            chg = round((c - p) / max(p, 1) * 100, 1)
            trends.append({"category": cat, "current": c, "previous": p, "change_pct": chg,
                           "direction": "up" if c > p else ("down" if c < p else "flat")})
        trends.sort(key=lambda x: x["current"], reverse=True)
        return {"success": True, "days": days, "category_trends": trends}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_county_trends(params: Dict[str, Any]) -> Dict[str, Any]:
    """Trend in job postings and worker registrations by county."""
    days = min(params.get("days", 30), 90)
    pool = await get_pool()
    if not pool:
        return {"error": "Database unavailable"}
    try:
        async with pool.acquire() as conn:
            job_rows = await conn.fetch(
                f"""
                SELECT county, COUNT(*) cnt FROM jobs
                WHERE county IS NOT NULL AND "createdAt" >= NOW() - ('{days} days')::interval
                GROUP BY county ORDER BY cnt DESC LIMIT 10
                """
            )
            worker_rows = await conn.fetch(
                f"""
                SELECT county, COUNT(*) cnt FROM worker_profiles
                WHERE county IS NOT NULL AND "createdAt" >= NOW() - ('{days} days')::interval
                GROUP BY county ORDER BY cnt DESC LIMIT 10
                """
            )
        return {
            "success": True,
            "days": days,
            "job_growth_by_county":    [{"county": r["county"], "new_jobs": int(r["cnt"])} for r in job_rows],
            "worker_growth_by_county": [{"county": r["county"], "new_workers": int(r["cnt"])} for r in worker_rows],
        }
    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# AI AWARENESS & NOTIFICATION INTELLIGENCE HANDLERS
# ─────────────────────────────────────────────────────────────────────────────

async def handle_get_my_notifications(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Get the authenticated user's own notifications (JWT-resolved, no user_id needed)."""
    if not user_jwt:
        return {"error": "Authentication required"}
    try:
        user_id = _get_user_id_from_jwt(user_jwt)
        if not user_id:
            return {"error": "Could not resolve user from token"}
        limit = min(params.get("limit", 20), 50)
        unread_only = params.get("unread_only", False)

        notifications = await get_user_notifications_db(user_id, limit=limit)
        if unread_only:
            notifications = [n for n in notifications if not n.get("is_read")]

        unread_count = sum(1 for n in notifications if not n.get("is_read"))
        return {
            "success": True,
            "notifications": notifications,
            "count": len(notifications),
            "unread_count": unread_count,
        }
    except Exception as e:
        logger.error(f"handle_get_my_notifications error: {e}")
        return {"error": str(e)}


async def handle_get_pending_alerts(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Get important unread alerts across the user's organisation (JWT-resolved)."""
    if not user_jwt:
        return {"error": "Authentication required"}
    try:
        org_id = _get_user_org_id(user_jwt)
        limit = min(params.get("limit", 20), 50)

        if not org_id:
            # Fallback: return the user's own important notifications
            user_id = _get_user_id_from_jwt(user_jwt)
            if not user_id:
                return {"error": "Could not resolve organisation from token"}
            notifs = await get_user_notifications_db(user_id, limit=50)
            alerts = [n for n in notifs if n.get("is_important") and not n.get("is_read")][:limit]
            return {"success": True, "alerts": alerts, "count": len(alerts)}

        alerts = await get_org_alerts_db(org_id, limit=limit)
        return {
            "success": True,
            "alerts": alerts,
            "count": len(alerts),
            "note": (
                f"Showing {len(alerts)} important unread alerts across your organisation. "
                "These are items flagged as high-priority that have not yet been read."
            ),
        }
    except Exception as e:
        logger.error(f"handle_get_pending_alerts error: {e}")
        return {"error": str(e)}


async def handle_summarize_ai_actions(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Summarise recent AI-driven events: KYC auto-approvals, churn alerts, billing recommendations, etc."""
    if not user_jwt:
        return {"error": "Authentication required"}
    try:
        role    = _get_user_role(user_jwt)
        org_id  = _get_user_org_id(user_jwt)
        user_id = _get_user_id_from_jwt(user_jwt)
        limit   = min(params.get("limit", 20), 50)

        # Admins / managers see the full org picture; workers/agents see their own
        if role in ("admin", "manager", "super_admin") and org_id:
            events = await get_system_notifications_db(org_id=org_id, limit=limit)
        else:
            events = await get_system_notifications_db(user_id=user_id, limit=limit)

        # Categorise events by keyword patterns
        categories: Dict[str, list] = {
            "verification": [],
            "churn_risk":   [],
            "billing":      [],
            "disputes":     [],
            "tasks":        [],
            "other":        [],
        }
        for n in events:
            title = (n.get("title") or "").lower()
            body  = (n.get("body")  or "").lower()
            if "verif" in title or "kyc" in title or "identity" in title:
                categories["verification"].append(n)
            elif "churn" in title or "inactive" in title or "engagement" in title:
                categories["churn_risk"].append(n)
            elif "subscr" in title or "plan" in title or "trial" in title or "billing" in title or "expir" in title:
                categories["billing"].append(n)
            elif "dispute" in title or "dispute" in body:
                categories["disputes"].append(n)
            elif "task" in title or "task" in body:
                categories["tasks"].append(n)
            else:
                categories["other"].append(n)

        return {
            "success": True,
            "total_system_events": len(events),
            "by_category": {k: len(v) for k, v in categories.items()},
            "recent_events": events,
            "summary": (
                f"Found {len(events)} recent AI/system events: "
                f"{len(categories['verification'])} KYC/verification, "
                f"{len(categories['churn_risk'])} churn risk alerts, "
                f"{len(categories['billing'])} billing/subscription, "
                f"{len(categories['disputes'])} dispute updates, "
                f"{len(categories['tasks'])} task notifications."
            ),
        }
    except Exception as e:
        logger.error(f"handle_summarize_ai_actions error: {e}")
        return {"error": str(e)}


# ── Cathy AI Self-Awareness Handlers ─────────────────────────────────────────
#
# These tools let Cathy query her own AI usage state so she can give accurate,
# user-facing answers about AI capacity — with no leakage of model names,
# tokens, or dollar costs.
#

_CUU_OP_LABELS = {
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


async def handle_get_cathy_usage(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Return the org's current-month AI usage summary."""
    if not user_jwt:
        return {"error": "Authentication required"}
    try:
        org_id = _get_user_org_id(user_jwt)
        if not org_id:
            return {"error": "AI usage tracking requires an organisation account"}

        from ..services.cathy_engine import get_engine
        engine = get_engine()
        usage = await engine.get_usage_summary(org_id)
        limit = usage["monthly_limit"]
        pct   = usage["pct_used"]

        from ..services.cathy_usage import WARN_THRESHOLDS
        status = "healthy"
        for thr in sorted(WARN_THRESHOLDS, reverse=True):
            if pct >= thr:
                status = "warning" if pct < 90 else "critical"
                break

        return {
            "success": True,
            "used_this_month":   usage["used_this_month"],
            "monthly_limit":     limit if limit != -1 else "Unlimited",
            "percent_used":      pct,
            "plan":              usage["plan"],
            "status":            status,
            "remaining":         (limit - usage["used_this_month"]) if limit != -1 else "Unlimited",
        }
    except Exception as e:
        logger.error(f"handle_get_cathy_usage error: {e}")
        return {"error": str(e)}


async def handle_get_cathy_usage_breakdown(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Return per-feature AI usage breakdown for the org this month."""
    if not user_jwt:
        return {"error": "Authentication required"}
    try:
        org_id = _get_user_org_id(user_jwt)
        if not org_id:
            return {"error": "AI usage breakdown requires an organisation account"}

        limit = min(int(params.get("limit", 10)), 20)

        from ..services.cathy_engine import get_engine
        breakdown = await get_engine().get_usage_breakdown(org_id, limit=limit)

        clean = [
            {
                "feature":          _CUU_OP_LABELS.get(row.get("operation", ""), row.get("operation", "")),
                "ai_units_used":    row.get("total_cuu", 0),
                "request_count":    row.get("call_count", 0),
                "avg_units_per_request": row.get("avg_cuu", 0),
            }
            for row in breakdown
        ]
        return {"success": True, "breakdown": clean, "count": len(clean)}
    except Exception as e:
        logger.error(f"handle_get_cathy_usage_breakdown error: {e}")
        return {"error": str(e)}


async def handle_get_cathy_remaining_capacity(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Return remaining AI capacity and whether a warning threshold has been crossed."""
    if not user_jwt:
        return {"error": "Authentication required"}
    try:
        org_id = _get_user_org_id(user_jwt)
        if not org_id:
            return {"error": "AI capacity check requires an organisation account"}

        from ..services.cathy_engine import get_engine
        from ..services.cathy_usage import WARN_THRESHOLDS, OVERAGE_ALLOWED
        usage = await get_engine().get_usage_summary(org_id)
        limit = usage["monthly_limit"]
        used  = usage["used_this_month"]
        pct   = usage["pct_used"]

        remaining = (limit - used) if limit != -1 else None

        warn_triggered = [t for t in WARN_THRESHOLDS if pct >= t]
        at_warning = len(warn_triggered) > 0

        return {
            "success":         True,
            "remaining":       remaining if remaining is not None else "Unlimited",
            "used":            used,
            "monthly_limit":   limit if limit != -1 else "Unlimited",
            "percent_used":    pct,
            "plan":            usage["plan"],
            "warning_active":  at_warning,
            "overage_allowed": OVERAGE_ALLOWED,
            "at_limit":        (limit != -1 and used >= limit),
        }
    except Exception as e:
        logger.error(f"handle_get_cathy_remaining_capacity error: {e}")
        return {"error": str(e)}


async def handle_get_cathy_plan_limits(params: Dict[str, Any], user_jwt: Optional[str]) -> Dict[str, Any]:
    """Return AI usage allowances for all subscription plans."""
    try:
        from ..services.cathy_usage import PLAN_CUU_LIMITS

        current_plan = "UNKNOWN"
        if user_jwt:
            try:
                org_id = _get_user_org_id(user_jwt)
                if org_id:
                    from ..reads import get_subscription_info
                    sub = await get_subscription_info(org_id)
                    if sub:
                        current_plan = (sub.get("plan") or "FREE").upper()
            except Exception:
                pass

        tiers = [
            {
                "plan":              plan,
                "monthly_ai_capacity": limit if limit != -1 else "Unlimited",
                "is_current_plan":   plan == current_plan,
                "description": {
                    "FREE":       "Basic access — suitable for light, occasional use",
                    "STARTER":    "Growing teams — moderate AI-assisted workflows",
                    "GROWTH":     "Active organisations — full AI matching and analytics",
                    "SCALE":      "Large teams — high-volume AI operations daily",
                    "ENTERPRISE": "Unlimited AI capacity with dedicated support",
                }.get(plan, ""),
            }
            for plan, limit in PLAN_CUU_LIMITS.items()
        ]
        return {
            "success":      True,
            "current_plan": current_plan,
            "plans":        tiers,
            "upgrade_path": "Billing → Change Plan in the admin dashboard",
        }
    except Exception as e:
        logger.error(f"handle_get_cathy_plan_limits error: {e}")
        return {"error": str(e)}


# ── Initialise dispatch tables now that all handlers are defined ──────────────
_build_dispatch_tables()
