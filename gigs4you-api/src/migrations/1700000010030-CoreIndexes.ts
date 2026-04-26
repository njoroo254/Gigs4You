import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoreIndexes1700000010030 implements MigrationInterface {
  name = 'CoreIndexes1700000010030';

  async up(qr: QueryRunner): Promise<void> {
    // ── Users ────────────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_users_phone         ON users(phone)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_users_org_id        ON users("organisationId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_users_role          ON users(role)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_users_active        ON users("isActive")`);

    // ── Agents ───────────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_agents_org_id       ON agents("organisationId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_agents_status       ON agents(status)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_agents_user_id      ON agents("userId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_agents_checked_in   ON agents("isCheckedIn")`);

    // ── Tasks ────────────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tasks_org_id        ON tasks("organisationId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tasks_agent_id      ON tasks("agentId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status        ON tasks(status)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tasks_due_at        ON tasks("dueAt")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tasks_org_status    ON tasks("organisationId", status)`);

    // ── Jobs ─────────────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_jobs_org_id         ON jobs("organisationId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_jobs_status         ON jobs(status)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_jobs_county         ON jobs(county)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_jobs_expires_at     ON jobs("expiresAt")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_jobs_created_at     ON jobs("createdAt" DESC)`);

    // ── GPS logs ─────────────────────────────────────────────────────────────
    // Partial index — only live pings (no tombstone/stale rows) for fast map queries
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_gps_agent_ts
        ON gps_logs ("agentId", "timestamp" DESC)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_gps_recent
        ON gps_logs ("timestamp" DESC)
        WHERE "timestamp" > NOW() - INTERVAL '24 hours'
    `);

    // ── Notifications ────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_notif_user_id       ON notifications("userId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_notif_read          ON notifications("isRead")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_notif_user_unread   ON notifications("userId", "isRead") WHERE "isRead" = false`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_notif_created       ON notifications("createdAt" DESC)`);

    // ── Verification ─────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ver_user_id         ON verifications("userId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ver_status          ON verifications(status)`);

    // ── Chat messages ────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_chat_msg_room       ON chat_messages("roomId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_chat_msg_created    ON chat_messages("createdAt" DESC)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_chat_msg_sender     ON chat_messages("senderId")`);

    // ── Audit logs ───────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_audit_user_id       ON audit_logs("userId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_audit_entity        ON audit_logs(entity, "entityId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_audit_created       ON audit_logs("createdAt" DESC)`);

    // ── Applications ─────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_apps_job_id         ON job_applications("jobId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_apps_worker_id      ON job_applications("workerId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_apps_status         ON job_applications(status)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    const indexes = [
      'idx_users_phone', 'idx_users_email', 'idx_users_org_id', 'idx_users_role', 'idx_users_active',
      'idx_agents_org_id', 'idx_agents_status', 'idx_agents_user_id', 'idx_agents_checked_in',
      'idx_tasks_org_id', 'idx_tasks_agent_id', 'idx_tasks_status', 'idx_tasks_due_at', 'idx_tasks_org_status',
      'idx_jobs_org_id', 'idx_jobs_status', 'idx_jobs_county', 'idx_jobs_expires_at', 'idx_jobs_created_at',
      'idx_gps_agent_ts', 'idx_gps_recent',
      'idx_notif_user_id', 'idx_notif_read', 'idx_notif_user_unread', 'idx_notif_created',
      'idx_ver_user_id', 'idx_ver_status',
      'idx_chat_msg_room', 'idx_chat_msg_created', 'idx_chat_msg_sender',
      'idx_audit_user_id', 'idx_audit_entity', 'idx_audit_created',
      'idx_apps_job_id', 'idx_apps_worker_id', 'idx_apps_status',
    ];
    for (const idx of indexes) {
      await qr.query(`DROP INDEX IF EXISTS ${idx}`);
    }
  }
}
