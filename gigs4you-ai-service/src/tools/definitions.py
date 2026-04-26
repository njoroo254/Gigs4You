"""
All ~160 tool definitions exposed to Claude during chat.
Organized by category — exact names must match handler.py dispatch map.
"""

# Helper to build schemas quickly
def _props(**fields):
    return {"type": "object", "properties": fields}

def _str(desc): 
    return {"type": "string", "description": desc}
def _int(desc): 
    return {"type": "integer", "description": desc}
def _num(desc): 
    return {"type": "number", "description": desc}
def _bool(desc): 
    return {"type": "boolean", "description": desc}

_LIMIT = _int("Results to return (1–20, default 10)")
_LOC   = _str("Kenyan county or city name")
_UID   = _str("User UUID")
_JID   = _str("Job UUID")
_AID   = _str("Agent UUID")
_TID   = _str("Task UUID")
_OID   = _str("Organisation UUID")

CHAT_TOOLS = [
    # ── 1. JOB DISCOVERY & MANAGEMENT (23 tools)
    {"name": "search_jobs", "description": "Search open jobs by keyword, category, or skills.", "input_schema": _props(query=_str("Keywords: title, category, skills"), location=_LOC, limit=_LIMIT)},
    {"name": "get_job_details", "description": "Get full details of a specific job including skills, budget, and deadline.", "input_schema": _props(job_id=_JID)},
    {"name": "get_jobs_by_status", "description": "List jobs filtered by status (open, assigned, in_progress, completed, cancelled).", "input_schema": _props(status=_str("Job status"), limit=_LIMIT)},
    {"name": "get_jobs_by_employer", "description": "List all jobs posted by a specific employer.", "input_schema": _props(employer_id=_UID, limit=_LIMIT)},
    {"name": "get_jobs_by_location", "description": "Find open jobs in a specific Kenyan county or city.", "input_schema": _props(location=_LOC, limit=_LIMIT)},
    {"name": "get_jobs_by_skills", "description": "Find jobs that require specific skills.", "input_schema": _props(skills=_str("Comma-separated skills"), location=_LOC, limit=_LIMIT)},
    {"name": "get_recent_jobs", "description": "Get the most recently posted open jobs.", "input_schema": _props(limit=_LIMIT)},
    {"name": "get_high_paying_jobs", "description": "Find the highest-budget open jobs on the platform.", "input_schema": _props(min_budget=_num("Minimum budget in KES"), limit=_LIMIT)},
    {"name": "get_urgent_jobs", "description": "Get jobs marked as urgent — these need immediate attention.", "input_schema": _props(location=_LOC, limit=_LIMIT)},
    {"name": "get_recommended_jobs", "description": "Get personalised job recommendations for the current user based on their skills and location.", "input_schema": _props(user_id=_UID, limit=_LIMIT)},
    {"name": "create_job", "description": "Post a new job listing on Gigs4You. The organisation is derived from the authenticated JWT — do NOT ask for org_id. Requires manager or employer authentication.", "input_schema": _props(title=_str("Job title"), description=_str("Full job description"), category=_str("sales | merchandising | technician | logistics | finance | research | general"), location=_str("Job location (city/area)"), county=_str("Kenyan county"), budget_min=_num("Minimum budget in KES"), budget_max=_num("Maximum budget in KES"), budget_type=_str("fixed | hourly | daily"), positions_available=_int("Number of positions"), deadline=_str("ISO deadline date"), is_urgent=_bool("Mark as urgent"))},
    {"name": "update_job", "description": "Update an existing job listing.", "input_schema": _props(job_id=_JID, title=_str("New title"), description=_str("New description"), budget_max=_num("New budget"), deadline=_str("New deadline"))},
    {"name": "close_job", "description": "Close/cancel an open job listing.", "input_schema": _props(job_id=_JID, reason=_str("Reason for closing"))},
    {"name": "extend_job_deadline", "description": "Extend the deadline of an existing job.", "input_schema": _props(job_id=_JID, new_deadline=_str("New deadline (YYYY-MM-DD)"))},
    {"name": "get_job_statistics", "description": "Get platform-wide job statistics: counts by status, top categories, average budget.", "input_schema": _props()},

    # ── 2. WORKERS & AGENTS (15 tools)
    {"name": "find_workers", "description": "Search for available workers by skill or location.", "input_schema": _props(skills=_str("Comma-separated skills"), location=_LOC, limit=_LIMIT)},
    {"name": "get_worker_profile", "description": "Get a worker's full profile: bio, skills, ratings, experience, and rates.", "input_schema": _props(user_id=_UID)},
    {"name": "get_worker_skills", "description": "List the skills registered for a worker.", "input_schema": _props(user_id=_UID)},
    {"name": "get_worker_performance", "description": "Get a worker's performance metrics: rating, completion rate, completed jobs.", "input_schema": _props(user_id=_UID)},
    {"name": "get_worker_history", "description": "Get a worker's past job applications and outcomes.", "input_schema": _props(user_id=_UID, limit=_LIMIT)},
    {"name": "get_worker_availability", "description": "Check whether a worker is currently available.", "input_schema": _props(user_id=_UID)},
    {"name": "get_top_workers", "description": "Get the highest-rated workers on the platform.", "input_schema": _props(limit=_LIMIT)},

    # ── 3. AGENT OPERATIONS (10 tools)
    {"name": "search_agents", "description": "Search for field agents by name. Use this first when the user refers to an agent by name — it returns the agent's UUID which is needed for create_task and other operations.", "input_schema": _props(name=_str("Agent's name or partial name to search"), org_id=_OID, limit=_LIMIT)},
    {"name": "get_available_agents", "description": "List field agents who are currently available, optionally filtered by organisation.", "input_schema": _props(org_id=_OID, limit=_LIMIT)},
    {"name": "get_agent_profile", "description": "Get a field agent's profile including level, XP, streak, and rating.", "input_schema": _props(agent_id=_AID)},
    {"name": "get_agent_tasks", "description": "Get tasks currently assigned to a specific field agent.", "input_schema": _props(agent_id=_AID, status=_str("Filter by task status"), limit=_LIMIT)},
    {"name": "get_agent_performance", "description": "Get a field agent's performance: rating, XP, level, streak, completed tasks.", "input_schema": _props(agent_id=_AID)},
    {"name": "track_agent_location", "description": "Get the most recent GPS location of a field agent.", "input_schema": _props(agent_id=_AID)},
    {"name": "get_agent_history", "description": "Get a field agent's task history.", "input_schema": _props(agent_id=_AID, limit=_LIMIT)},
    {"name": "get_agent_activity_summary", "description": "Get a summary of a field agent's recent activity.", "input_schema": _props(agent_id=_AID)},
    {"name": "assign_agent_to_job", "description": "Assign a field agent to a job. Requires manager/admin authentication.", "input_schema": _props(job_id=_JID, agent_id=_AID)},
    {"name": "reassign_agent", "description": "Reassign a task from one agent to another.", "input_schema": _props(task_id=_TID, new_agent_id=_AID, reason=_str("Reason for reassignment"))},

    # ── 4. TASK MANAGEMENT (9 tools)
    {"name": "get_user_tasks", "description": "Get tasks for the current user (agent).", "input_schema": _props(user_id=_UID, status=_str("Task status filter"), limit=_LIMIT)},
    {"name": "get_task_details", "description": "Get full details of a specific task including checklist and proof of work.", "input_schema": _props(task_id=_TID)},
    {"name": "create_task", "description": "Create a new task. If you know the agent's UUID use agent_id. If you only have the agent's name use agent_name instead — the system will look up the UUID automatically. Both agent_id and agent_name are optional; omit both to let the system auto-assign. Requires manager authentication.", "input_schema": _props(title=_str("Task title"), description=_str("Task description"), agent_id=_str("Agent UUID — use this if you already have the UUID"), agent_name=_str("Agent's name — use this instead of agent_id when you only know the name"), priority=_str("low | medium | high"), location_name=_str("Location"), due_at=_str("Due datetime (ISO 8601)"), xp_reward=_int("XP points reward"))},
    {"name": "update_task_status", "description": "Update the status of a task.", "input_schema": _props(task_id=_TID, status=_str("New status"), reason=_str("Optional reason"))},
    {"name": "get_pending_tasks", "description": "Get all pending or unassigned tasks for an organisation.", "input_schema": _props(org_id=_OID, limit=_LIMIT)},
    {"name": "get_completed_tasks", "description": "Get recently completed tasks.", "input_schema": _props(org_id=_OID, agent_id=_AID, limit=_LIMIT)},
    {"name": "get_overdue_tasks", "description": "Get tasks that have passed their due date and are not yet complete.", "input_schema": _props(org_id=_OID, limit=_LIMIT)},

    # ── 5. WALLET & PAYMENTS (11 tools)
    {"name": "get_wallet_balance", "description": "Get the current agent wallet balance in KES. Uses the authenticated user automatically — no user_id needed.", "input_schema": _props(user_id=_UID)},
    {"name": "get_wallet_transactions", "description": "Get recent agent wallet transactions (credits, debits, withdrawals). Uses the authenticated user automatically — no user_id needed.", "input_schema": _props(user_id=_UID, limit=_LIMIT)},
    {"name": "get_wallet_summary", "description": "Get agent wallet summary: balance, pending, total earned, total withdrawn. Uses the authenticated user automatically — no user_id needed.", "input_schema": _props(user_id=_UID)},
    {"name": "get_earnings_summary", "description": "Get total earnings and breakdown for a worker or agent.", "input_schema": _props(user_id=_UID)},
    {"name": "stage_withdrawal", "description": "STEP 1 of 2 for withdrawals. Stage an M-Pesa withdrawal and return a human-readable preview with a confirmation token. You MUST call this first, present the preview to the user, and wait for their explicit confirmation before proceeding to execute_staged_withdrawal. The token expires in 5 minutes.", "input_schema": _props(amount=_num("Amount in KES to withdraw"), mpesa_phone=_str("M-Pesa phone number (Kenyan format, e.g. 0712345678 or +254712345678)"))},
    {"name": "execute_staged_withdrawal", "description": "STEP 2 of 2 for withdrawals. Execute a withdrawal that was previously staged with stage_withdrawal. ONLY call this after presenting the preview to the user and receiving their explicit confirmation. Requires the confirmation_token from stage_withdrawal. For high-value withdrawals (≥ KES 50,000) the staged response includes requires_otp=true — in that case you MUST also pass the otp_code provided by the user.", "input_schema": _props(confirmation_token=_str("Token returned by stage_withdrawal"), otp_code=_str("6-digit OTP sent to the user's phone/email — required only for high-value withdrawals (≥ KES 50,000)"))},
    {"name": "get_mpesa_transactions", "description": "Get M-Pesa transaction history for a user.", "input_schema": _props(user_id=_UID, limit=_LIMIT)},
    {"name": "get_pending_payments", "description": "Get pending payments awaiting processing.", "input_schema": _props(user_id=_UID, limit=_LIMIT)},
    {"name": "get_org_wallet_balance", "description": "Get the organisation's payment pool balance: available funds, total deposited, total disbursed to agents. Uses the authenticated user's organisation automatically — no org_id needed.", "input_schema": _props()},
    {"name": "get_org_wallet_transactions", "description": "Get organisation wallet transaction history: M-Pesa topups (deposits) and agent payouts (disbursements). Uses the authenticated user's organisation automatically — no org_id needed.", "input_schema": _props(limit=_LIMIT)},

    # ── 6. PLATFORM ANALYTICS (9 tools)
    {"name": "get_platform_stats", "description": "Get live platform statistics: total users, open jobs, active agents, pending tasks.", "input_schema": _props()},
    {"name": "get_growth_metrics", "description": "Get platform growth: new users, new jobs, and completions over a time period.", "input_schema": _props(days=_int("Number of days to look back"))},
    {"name": "get_user_distribution", "description": "Get breakdown of users by role across the platform.", "input_schema": _props()},
    {"name": "get_job_distribution", "description": "Get job counts by status and top categories.", "input_schema": _props()},
    {"name": "get_conversion_rates", "description": "Get application-to-hire conversion rate and job fill rate.", "input_schema": _props()},
    {"name": "get_engagement_metrics", "description": "Get user engagement: daily active users, session length, feature usage.", "input_schema": _props()},
    {"name": "get_top_performers", "description": "Get the highest-rated and most productive workers/agents on the platform.", "input_schema": _props(limit=_LIMIT)},
    {"name": "get_location_stats", "description": "Get job demand and worker supply by Kenyan county.", "input_schema": _props()},
    {"name": "get_high_demand_areas", "description": "Identify counties with the most open jobs and least available workers.", "input_schema": _props()},

    # ── 7. AI & INTELLIGENCE (12 tools)
    {"name": "rank_workers_for_job", "description": "AI-rank available workers for a specific job. Returns scored list with reasoning.", "input_schema": _props(job_id=_JID, limit=_LIMIT)},
    {"name": "recommend_workers", "description": "AI-recommend workers for a job based on skills, location, and performance.", "input_schema": _props(job_id=_JID, required_skills=_str("Comma-separated skills"), county=_LOC, limit=_LIMIT)},
    {"name": "recommend_jobs", "description": "AI-recommend jobs for a worker based on their profile.", "input_schema": _props(user_id=_UID, limit=_LIMIT)},
    {"name": "predict_job_success", "description": "Predict the likelihood that a job will be filled successfully and quickly.", "input_schema": _props(job_id=_JID)},
    {"name": "predict_worker_performance", "description": "Predict how well a worker will perform on a specific job type.", "input_schema": _props(user_id=_UID, job_category=_str("Job category"))},
    {"name": "detect_fraud_risk", "description": "Assess fraud or abuse risk for a user or job listing.", "input_schema": _props(user_id=_UID, job_id=_JID)},
    {"name": "detect_fake_jobs", "description": "Detect potentially fraudulent or fake job postings.", "input_schema": _props(job_id=_JID)},
    {"name": "detect_inactive_users", "description": "Identify users who have not been active recently.", "input_schema": _props(days=_int("Days since last activity"), limit=_LIMIT)},
    {"name": "detect_churn_risk", "description": "Identify workers or agents at risk of becoming inactive.", "input_schema": _props(org_id=_OID, limit=_LIMIT)},
    {"name": "optimize_pricing", "description": "Suggest optimal budget/rate for a job based on market data.", "input_schema": _props(category=_str("Job category"), county=_LOC, budget_type=_str("fixed | hourly | daily"))},
    {"name": "suggest_skills_to_learn", "description": "Suggest high-demand skills a worker should acquire to improve job prospects.", "input_schema": _props(user_id=_UID)},
    {"name": "verify_face_match", "description": "Verify if a selfie matches the face on an ID document using AI face recognition.", "input_schema": _props(id_image_url=_str("URL of the ID document image"), selfie_url=_str("URL of the selfie image"), threshold=_num("Match threshold (0-100, default 70)"))},

    # ── 8. USER CONTEXT & PROFILE (6 tools)
    {"name": "get_user_profile", "description": "Get a user's full profile: role, contact, county, company, and stats.", "input_schema": _props(user_id=_UID)},
    {"name": "get_user_role", "description": "Get the role of a specific user (worker, agent, employer, admin, etc.).", "input_schema": _props(user_id=_UID)},
    {"name": "get_user_activity", "description": "Get recent platform activity for a user.", "input_schema": _props(user_id=_UID, limit=_LIMIT)},
    {"name": "get_user_statistics", "description": "Get aggregated statistics for a user: jobs, rating, earnings.", "input_schema": _props(user_id=_UID)},
    {"name": "get_user_activity_summary", "description": "Get a summary of a user's platform activity.", "input_schema": _props(user_id=_UID)},
    {"name": "get_user_history", "description": "Get a user's complete history: applications, jobs, payments.", "input_schema": _props(user_id=_UID, limit=_LIMIT)},

    # ── 9. LOCATION & FIELD DATA (5 tools)
    {"name": "get_jobs_nearby", "description": "Find open jobs near a specified county.", "input_schema": _props(county=_LOC, limit=_LIMIT)},
    {"name": "get_workers_nearby", "description": "Find available workers in or near a specific county.", "input_schema": _props(county=_LOC, limit=_LIMIT)},
    {"name": "get_agents_nearby", "description": "Find field agents active in a specific area.", "input_schema": _props(county=_LOC, org_id=_OID, limit=_LIMIT)},
    {"name": "get_location_demand", "description": "Get job demand (open job count) for a specific county.", "input_schema": _props(county=_LOC)},
    {"name": "get_location_supply", "description": "Get worker supply (available worker count) for a specific county.", "input_schema": _props(county=_LOC)},

    # ── 10. NOTIFICATIONS & COMMUNICATION (6 tools)
    {"name": "get_notifications", "description": "Get recent notifications for a user.", "input_schema": _props(user_id=_UID, limit=_LIMIT)},
    {"name": "send_notification", "description": "Send a push notification to a specific user. Requires admin/manager auth.", "input_schema": _props(user_id=_UID, title=_str("Notification title"), body=_str("Notification body"), action_type=_str("Optional action type"))},
    {"name": "broadcast_message", "description": "Broadcast a message to a group of users (by role or org). Requires admin auth.", "input_schema": _props(role=_str("Target role"), org_id=_OID, title=_str("Title"), body=_str("Message body"))},
    {"name": "send_job_alerts", "description": "Send job availability alerts to matching workers.", "input_schema": _props(job_id=_JID)},
    {"name": "get_chat_groups", "description": "List chat groups in the organisation. Uses the authenticated user's organisation automatically — no org_id needed.", "input_schema": _props(limit=_LIMIT)},
    {"name": "get_group_messages", "description": "Get recent messages from a specific chat group. Use get_chat_groups first to find the group_id.", "input_schema": _props(group_id=_str("Chat group UUID"), limit=_LIMIT)},

    # ── 19. AI AWARENESS & NOTIFICATION INTELLIGENCE (3 tools)
    {"name": "get_my_notifications", "description": "Get the current authenticated user's recent notifications (read and unread). JWT-resolved — no user_id needed. Use this to help the user check what alerts they have.", "input_schema": _props(limit=_LIMIT, unread_only=_bool("Return only unread notifications (default false)"))},
    {"name": "get_pending_alerts", "description": "Get important unread alerts for the current user's entire organisation — surfaces items that need human attention. JWT-resolved, no org_id needed. Ideal for managers/admins to get a quick pulse check. Requires manager or admin auth.", "input_schema": _props(limit=_LIMIT)},
    {"name": "summarize_ai_actions", "description": "Summarise recent AI-generated system events: auto-KYC approvals, churn risk detections, billing/plan recommendations, dispute updates, and other AI-driven insights. Returns counts by category plus the raw events. Use proactively to give admins/managers a picture of what the AI has been doing. Requires manager, admin, or super_admin auth.", "input_schema": _props(limit=_LIMIT)},

    # ── 11. APPLICATIONS & MATCHING (7 tools)
    {"name": "get_job_applications", "description": "Get all applications for a specific job.", "input_schema": _props(job_id=_JID, status=_str("Filter by status"), limit=_LIMIT)},
    {"name": "get_user_applications", "description": "Get all job applications submitted by a specific user.", "input_schema": _props(user_id=_UID, limit=_LIMIT)},
    {"name": "apply_to_job", "description": "Submit an application for a job. Requires worker authentication.", "input_schema": _props(job_id=_JID, cover_note=_str("Cover note"), proposed_rate=_num("Proposed rate in KES"))},
    {"name": "accept_application", "description": "Accept a job application. Requires employer authentication.", "input_schema": _props(application_id=_str("Application UUID"))},
    {"name": "reject_application", "description": "Reject a job application with an optional reason.", "input_schema": _props(application_id=_str("Application UUID"), reason=_str("Rejection reason"))},
    {"name": "shortlist_candidates", "description": "Get a shortlist of the best-matched applicants for a job.", "input_schema": _props(job_id=_JID, limit=_LIMIT)},
    {"name": "auto_match_workers", "description": "Automatically match and rank the best workers for a job using AI.", "input_schema": _props(job_id=_JID, limit=_LIMIT)},

    # ── 12. ORGANISATIONS & EMPLOYERS (5 tools)
    {"name": "get_organisation_profile", "description": "Get an organisation's profile: name, industry, county, contact.", "input_schema": _props(org_id=_OID)},
    {"name": "get_organisation_users", "description": "List all users (agents, managers) belonging to an organisation.", "input_schema": _props(org_id=_OID, limit=_LIMIT)},
    {"name": "get_organisation_jobs", "description": "Get jobs posted by an organisation.", "input_schema": _props(org_id=_OID, status=_str("Job status filter"), limit=_LIMIT)},
    {"name": "get_organisation_stats", "description": "Get performance statistics for an organisation: agents, tasks, completion rate.", "input_schema": _props(org_id=_OID)},
    {"name": "get_employer_dashboard", "description": "Get a summary dashboard for an employer: active jobs, applications, recent activity.", "input_schema": _props(user_id=_UID)},

    # ── 13. SECURITY & ADMIN (5 tools)
    {"name": "get_audit_logs", "description": "Retrieve audit log entries for a user or organisation. Requires admin auth.", "input_schema": _props(user_id=_UID, org_id=_OID, limit=_LIMIT)},
    {"name": "flag_user", "description": "Flag a user account for review. Requires admin auth.", "input_schema": _props(user_id=_UID, reason=_str("Reason for flagging"))},
    {"name": "flag_job", "description": "Flag a job listing as suspicious or policy-violating. Requires admin auth.", "input_schema": _props(job_id=_JID, reason=_str("Reason for flagging"))},
    {"name": "detect_anomalies", "description": "Run an AI anomaly scan on recent platform activity to detect unusual patterns.", "input_schema": _props(scope=_str("users | jobs | payments | all"))},
    {"name": "get_security_alerts", "description": "Get recent security alerts and flagged items.", "input_schema": _props(limit=_LIMIT)},

    # ── 14. SYSTEM & OPERATIONS (5 tools)
    {"name": "get_system_status", "description": "Get status of all Gigs4You services (API, AI, Redis, DB).", "input_schema": _props()},
    {"name": "get_api_usage", "description": "Get API call volume and error rates.", "input_schema": _props(days=_int("Days to look back"))},
    {"name": "get_error_reports", "description": "Get recent error reports from the platform.", "input_schema": _props(limit=_LIMIT)},
    {"name": "log_issue", "description": "Log a technical issue for the engineering team.", "input_schema": _props(title=_str("Issue title"), description=_str("Issue details"), severity=_str("low | medium | high | critical"))},
    {"name": "get_open_issues", "description": "Get open technical issues.", "input_schema": _props(limit=_LIMIT)},

    # ── 15. DISPUTES (6 tools)
    {"name": "get_disputes", "description": "Get disputes for a user or organisation. Filters by status if provided.", "input_schema": _props(user_id=_UID, org_id=_OID, status=_str("open | under_review | resolved | closed"), limit=_LIMIT)},
    {"name": "get_dispute_stats", "description": "Get platform-wide dispute statistics: counts by status, type, overdue disputes, average resolution time.", "input_schema": _props()},
    {"name": "file_dispute", "description": "File a new dispute against another user (payment, quality, non-delivery, harassment, fraud, or other).", "input_schema": _props(against_user_id=_UID, type=_str("payment | quality | non_delivery | fraud | harassment | other"), description=_str("Detailed description of the issue"), amount_kes=_num("Amount in KES involved (for payment disputes)"), reference_id=_str("Related job or task ID"), reference_type=_str("job | task | application"))},
    {"name": "escalate_dispute", "description": "Escalate an open dispute to senior admin. For disputes past SLA or not getting resolution.", "input_schema": _props(dispute_id=_str("Dispute UUID"), reason=_str("Escalation reason"))},
    {"name": "get_dispute_resolution_policy", "description": "Explain the Gigs4You dispute resolution process, SLA timelines, and possible outcomes.", "input_schema": _props()},
    {"name": "get_refund_policy", "description": "Explain the Gigs4You refund policy: eligible scenarios, timelines, and how refunds are processed.", "input_schema": _props()},

    # ── 16. SUBSCRIPTIONS & BILLING (5 tools)
    {"name": "get_subscription_info", "description": "Get the active subscription plan for an organisation: tier, limits, billing cycle, and renewal date.", "input_schema": _props(org_id=_OID)},
    {"name": "get_subscription_plans", "description": "List all available Gigs4You subscription plans with features and KES pricing.", "input_schema": _props()},
    {"name": "get_billing_history", "description": "Get recent billing invoices for an organisation.", "input_schema": _props(org_id=_OID, limit=_LIMIT)},
    {"name": "check_plan_limits", "description": "Check if an organisation has reached its plan limits (agents, jobs) and what the next tier offers.", "input_schema": _props(org_id=_OID)},
    {"name": "recommend_plan_upgrade", "description": "Recommend whether an organisation should upgrade their subscription based on usage.", "input_schema": _props(org_id=_OID)},

    # ── 17. VERIFICATION & KYC (4 tools)
    {"name": "get_verification_status", "description": "Get the KYC/identity verification status for a user. Shows document type, face match score, and review notes.", "input_schema": _props(user_id=_UID)},
    {"name": "get_verification_requirements", "description": "Explain what documents and steps are required to complete identity verification on Gigs4You.", "input_schema": _props()},
    {"name": "get_pending_verifications", "description": "Get a list of KYC submissions pending admin review. Requires admin auth.", "input_schema": _props(limit=_LIMIT)},
    {"name": "explain_verification_process", "description": "Walk a user through the identity verification process step by step.", "input_schema": _props()},

    # ── 18. TREND ANALYSIS (4 tools)
    {"name": "get_trend_comparison", "description": "Compare a metric week-over-week or over custom periods. Shows current vs previous period with change percentage.", "input_schema": _props(metric=_str("users | jobs | applications | tasks | disputes"), days=_int("Period length in days (default 7)"))},
    {"name": "get_platform_trends", "description": "Get a comprehensive trends report: growth in users, jobs, applications, and disputes over the past 7 and 30 days.", "input_schema": _props()},
    {"name": "get_category_trends", "description": "Analyse which job categories are growing or declining in demand.", "input_schema": _props(days=_int("Days to analyse"))},
    {"name": "get_county_trends", "description": "Analyse which Kenyan counties are seeing the most growth in job postings and worker registrations.", "input_schema": _props(days=_int("Days to analyse"))},

    # ── 19. CATHY AI SELF-AWARENESS (4 tools) ──────────────────────────────────
    # These tools let Cathy query her own AI usage in real time so she can
    # give accurate, user-facing answers about AI capacity.
    # IMPORTANT: Never expose 'Claude', 'tokens', or dollar costs in responses.
    # Use only 'AI usage', 'AI capacity', 'AI units', 'monthly AI limit'.
    {"name": "get_cathy_usage", "description": "Get the organisation's current AI usage for this calendar month — how many AI units have been used and how many remain. Call this when the user asks about AI usage, Cathy usage, or their AI capacity.", "input_schema": _props()},
    {"name": "get_cathy_usage_breakdown", "description": "Get a per-feature breakdown of AI usage this month — shows which Cathy features (job matching, smart forms, chat analysis, etc.) have consumed the most AI capacity.", "input_schema": _props(limit=_int("Number of top features to return (default 10)"))},
    {"name": "get_cathy_remaining_capacity", "description": "Check how much AI capacity the organisation has left this month. Returns remaining units, percentage used, and whether a warning threshold has been crossed. Use this proactively when Cathy knows usage is high.", "input_schema": _props()},
    {"name": "get_cathy_plan_limits", "description": "Return the AI usage limits for all subscription plans so the user can compare and decide whether to upgrade. Useful when usage is near the limit.", "input_schema": _props()},
]
