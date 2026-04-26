"""
Role-based tool access control for Cathy.

Two enforcement layers:
  1. filter_tools_for_role()  — called before the Claude API call so Claude never
                                sees tools outside the caller's permission set.
  2. check_tool_permitted()   — called at dispatch time as a defence-in-depth check
                                (guards against prompt-injection forcing a tool call).

Role hierarchy (lowest → highest):
  worker < agent < employer < supervisor < manager < admin < super_admin
"""

from typing import List, Dict, Any, Optional

# ---------------------------------------------------------------------------
# Base tool sets — each higher role inherits the one below and adds extras
# ---------------------------------------------------------------------------

_WORKER_TOOLS: frozenset = frozenset({
    # Job discovery (read-only)
    "search_jobs", "get_job_details", "get_jobs_by_status",
    "get_jobs_by_employer", "get_jobs_by_location", "get_jobs_by_skills",
    "get_recent_jobs", "get_high_paying_jobs", "get_urgent_jobs",
    "get_recommended_jobs", "get_job_statistics",
    "get_jobs_nearby",
    # Worker profile & self-performance
    "get_worker_profile", "get_worker_skills", "get_worker_performance",
    "get_worker_history", "get_worker_availability", "get_top_workers",
    "suggest_skills_to_learn",
    # Own tasks (read)
    "get_user_tasks", "get_task_details",
    # Own wallet (read only)
    "get_wallet_balance", "get_wallet_transactions", "get_wallet_summary",
    "get_earnings_summary", "get_mpesa_transactions", "get_pending_payments",
    # Job applications (own)
    "apply_to_job", "get_user_applications",
    # Own profile & activity
    "get_user_profile", "get_user_role", "get_user_activity",
    "get_user_statistics", "get_user_activity_summary", "get_user_history",
    # Own notifications
    "get_notifications", "get_my_notifications",
    # Disputes (own)
    "get_disputes", "file_dispute", "get_dispute_resolution_policy",
    "get_refund_policy", "get_dispute_stats",
    # Subscription info (read)
    "get_subscription_info", "get_subscription_plans", "check_plan_limits",
    "recommend_plan_upgrade",
    # Verification (read)
    "get_verification_status", "get_verification_requirements",
    "explain_verification_process",
    # Location (read)
    "get_location_demand", "get_location_supply",
    # Basic analytics (read)
    "get_platform_stats", "get_job_distribution", "get_top_performers",
    "get_trend_comparison", "get_platform_trends",
    "get_category_trends", "get_county_trends",
    # Cathy self-awareness
    "get_cathy_usage", "get_cathy_usage_breakdown",
    "get_cathy_remaining_capacity", "get_cathy_plan_limits",
    # Misc
    "log_issue",
})

_AGENT_EXTRAS: frozenset = frozenset({
    # Wallet write (withdrawal)
    "stage_withdrawal", "execute_staged_withdrawal",
    # Agent self-ops
    "get_agent_profile", "get_agent_tasks", "get_agent_performance",
    "get_agent_history", "get_agent_activity_summary",
    # Agent search/discovery
    "search_agents", "get_available_agents",
    # Location & field data
    "track_agent_location", "get_agents_nearby", "get_workers_nearby",
    # AI recommendations (for self)
    "recommend_jobs", "predict_worker_performance",
})

_EMPLOYER_EXTRAS: frozenset = frozenset({
    # Job write
    "create_job", "update_job", "close_job", "extend_job_deadline",
    # Applications management
    "get_job_applications", "accept_application", "reject_application",
    "shortlist_candidates", "auto_match_workers",
    # Worker search
    "find_workers", "get_workers_nearby",
    # Employer dashboard
    "get_employer_dashboard",
    # AI tools
    "rank_workers_for_job", "recommend_workers", "predict_job_success",
    "detect_churn_risk",
    # Org wallet (read)
    "get_org_wallet_balance", "get_org_wallet_transactions",
    # Billing (read)
    "get_billing_history",
    # Extended analytics
    "get_growth_metrics", "get_user_distribution", "get_location_stats",
    "get_high_demand_areas", "get_engagement_metrics", "get_conversion_rates",
    # Org profile
    "get_organisation_profile", "get_organisation_jobs", "get_organisation_stats",
})

_MANAGER_EXTRAS: frozenset = frozenset({
    # Task management (all agents in org)
    "create_task", "update_task_status", "get_pending_tasks",
    "get_completed_tasks", "get_overdue_tasks",
    # Agent assignment
    "assign_agent_to_job", "reassign_agent",
    # Notifications/broadcast
    "send_notification", "send_job_alerts", "broadcast_message",
    "get_chat_groups", "get_group_messages", "get_pending_alerts",
    "summarize_ai_actions",
    # Org users
    "get_organisation_users",
    # Advanced AI
    "detect_fraud_risk", "detect_fake_jobs", "detect_inactive_users",
    "optimize_pricing", "verify_face_match",
    # Fraud/risk
    "detect_anomalies",
})

_ADMIN_EXTRAS: frozenset = frozenset({
    # Security & admin tools
    "get_audit_logs", "flag_user", "flag_job",
    "get_security_alerts",
    # KYC review
    "get_pending_verifications",
    # System (read)
    "get_system_status", "get_api_usage", "get_error_reports", "get_open_issues",
})

# ---------------------------------------------------------------------------
# Computed allowed sets per role (cumulative inheritance)
# ---------------------------------------------------------------------------

_AGENT_TOOLS:      frozenset = _WORKER_TOOLS | _AGENT_EXTRAS
_EMPLOYER_TOOLS:   frozenset = _WORKER_TOOLS | _EMPLOYER_EXTRAS | _AGENT_EXTRAS
_SUPERVISOR_TOOLS: frozenset = _AGENT_TOOLS  | _EMPLOYER_EXTRAS | _MANAGER_EXTRAS
_MANAGER_TOOLS:    frozenset = _SUPERVISOR_TOOLS | _EMPLOYER_EXTRAS | _MANAGER_EXTRAS
_ADMIN_TOOLS:      frozenset = _MANAGER_TOOLS | _ADMIN_EXTRAS

# Mapping role string → allowed tool frozenset
# super_admin: None signals "all tools permitted" (no filtering)
_ROLE_SETS: Dict[str, Optional[frozenset]] = {
    "worker":      _WORKER_TOOLS,
    "agent":       _AGENT_TOOLS,
    "employer":    _EMPLOYER_TOOLS,
    "supervisor":  _SUPERVISOR_TOOLS,
    "manager":     _MANAGER_TOOLS,
    "admin":       _ADMIN_TOOLS,
    "super_admin": None,   # None = unrestricted
}

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def filter_tools_for_role(
    tools: List[Dict[str, Any]],
    role: Optional[str],
) -> List[Dict[str, Any]]:
    """
    Return only the subset of tool definitions that the given role may use.
    Called before passing tools to the Claude API so Claude never sees
    tools outside the caller's permission set.
    """
    allowed = _ROLE_SETS.get(role or "worker")
    if allowed is None:
        return tools          # super_admin — no restriction
    return [t for t in tools if t["name"] in allowed]


def check_tool_permitted(tool_name: str, role: Optional[str]) -> bool:
    """
    Returns True if the role may execute the named tool.
    Called at dispatch time as a defence-in-depth guard.
    """
    allowed = _ROLE_SETS.get(role or "worker")
    if allowed is None:
        return True           # super_admin — all tools permitted
    return tool_name in allowed


def tool_not_permitted_response(tool_name: str, role: Optional[str]) -> Dict[str, Any]:
    """Standard rejection payload returned to Claude when a tool is blocked."""
    return {
        "error": "tool_not_permitted",
        "tool": tool_name,
        "role": role or "worker",
        "message": (
            f"Your role ({role or 'worker'}) does not have permission to use "
            f"'{tool_name}'. If you believe this is incorrect, contact your administrator."
        ),
    }
