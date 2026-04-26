import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the tool_allowlist table — stores which Cathy tools each role
 * may call.  The Python AI service reads these rows to enforce role-based
 * tool access at the API level.
 *
 * Defaults match the hard-coded baseline in role_guard.py so that the table
 * can override individual entries without requiring a full redeploy.
 *
 * Cache note: the AI service caches this table for 60 seconds (env:
 * TOOL_ALLOWLIST_CACHE_TTL).  Changes take effect within one minute.
 */
export class ToolAllowlist1700000010028 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Create table ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tool_allowlist (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        role        VARCHAR(50) NOT NULL,
        tool_name   VARCHAR(100) NOT NULL,
        enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
        updated_by  UUID,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_tool_allowlist_role_tool UNIQUE (role, tool_name)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_tool_allowlist_role ON tool_allowlist (role)
    `);

    // updated_at trigger
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION tool_allowlist_set_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER tool_allowlist_updated_at
        BEFORE UPDATE ON tool_allowlist
        FOR EACH ROW EXECUTE FUNCTION tool_allowlist_set_updated_at()
    `);

    // ── 2. Seed default allowlist (mirrors role_guard.py baseline) ────────────
    const workerTools = [
      'search_jobs','get_job_details','get_jobs_by_status','get_jobs_by_employer',
      'get_jobs_by_location','get_jobs_by_skills','get_recent_jobs',
      'get_high_paying_jobs','get_urgent_jobs','get_recommended_jobs',
      'get_job_statistics','get_jobs_nearby','get_worker_profile','get_worker_skills',
      'get_worker_performance','get_worker_history','get_worker_availability',
      'get_top_workers','suggest_skills_to_learn','get_user_tasks','get_task_details',
      'get_wallet_balance','get_wallet_transactions','get_wallet_summary',
      'get_earnings_summary','get_mpesa_transactions','get_pending_payments',
      'apply_to_job','get_user_applications','get_user_profile','get_user_role',
      'get_user_activity','get_user_statistics','get_user_activity_summary',
      'get_user_history','get_notifications','get_my_notifications',
      'get_disputes','file_dispute','get_dispute_resolution_policy',
      'get_refund_policy','get_dispute_stats','get_subscription_info',
      'get_subscription_plans','check_plan_limits','recommend_plan_upgrade',
      'get_verification_status','get_verification_requirements',
      'explain_verification_process','get_location_demand','get_location_supply',
      'get_platform_stats','get_job_distribution','get_top_performers',
      'get_trend_comparison','get_platform_trends','get_category_trends',
      'get_county_trends','get_cathy_usage','get_cathy_usage_breakdown',
      'get_cathy_remaining_capacity','get_cathy_plan_limits','log_issue',
    ];

    const agentExtras = [
      'stage_withdrawal','execute_staged_withdrawal','get_agent_profile',
      'get_agent_tasks','get_agent_performance','get_agent_history',
      'get_agent_activity_summary','search_agents','get_available_agents',
      'track_agent_location','get_agents_nearby','get_workers_nearby',
      'recommend_jobs','predict_worker_performance',
    ];

    const employerExtras = [
      'create_job','update_job','close_job','extend_job_deadline',
      'get_job_applications','accept_application','reject_application',
      'shortlist_candidates','auto_match_workers','find_workers',
      'get_employer_dashboard','rank_workers_for_job','recommend_workers',
      'predict_job_success','detect_churn_risk','get_org_wallet_balance',
      'get_org_wallet_transactions','get_billing_history','get_growth_metrics',
      'get_user_distribution','get_location_stats','get_high_demand_areas',
      'get_engagement_metrics','get_conversion_rates','get_organisation_profile',
      'get_organisation_jobs','get_organisation_stats','get_workers_nearby',
    ];

    const managerExtras = [
      'create_task','update_task_status','get_pending_tasks','get_completed_tasks',
      'get_overdue_tasks','assign_agent_to_job','reassign_agent','send_notification',
      'send_job_alerts','broadcast_message','get_chat_groups','get_group_messages',
      'get_pending_alerts','summarize_ai_actions','get_organisation_users',
      'detect_fraud_risk','detect_fake_jobs','detect_inactive_users',
      'optimize_pricing','verify_face_match','detect_anomalies',
    ];

    const adminExtras = [
      'get_audit_logs','flag_user','flag_job','get_security_alerts',
      'get_pending_verifications','get_system_status','get_api_usage',
      'get_error_reports','get_open_issues',
    ];

    const roleToolMap: Record<string, string[]> = {
      worker:     workerTools,
      agent:      [...workerTools, ...agentExtras],
      employer:   [...workerTools, ...agentExtras, ...employerExtras],
      supervisor: [...workerTools, ...agentExtras, ...employerExtras, ...managerExtras],
      manager:    [...workerTools, ...agentExtras, ...employerExtras, ...managerExtras],
      admin:      [...workerTools, ...agentExtras, ...employerExtras, ...managerExtras, ...adminExtras],
      super_admin: [],  // Empty = unrestricted (all tools permitted)
    };

    for (const [role, tools] of Object.entries(roleToolMap)) {
      const uniqueTools = [...new Set(tools)];
      if (uniqueTools.length === 0) continue;  // super_admin — no rows needed
      for (const tool of uniqueTools) {
        await queryRunner.query(
          `INSERT INTO tool_allowlist (role, tool_name, enabled)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (role, tool_name) DO NOTHING`,
          [role, tool],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tool_allowlist`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS tool_allowlist_set_updated_at() CASCADE`);
  }
}
