import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobsMissingColumns1700000000004 implements MigrationInterface {
  name = 'AddJobsMissingColumns1700000000004';

  async up(qr: QueryRunner): Promise<void> {
    // Missing columns on jobs table
    await qr.query(`ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "startDate"          timestamptz`);
    await qr.query(`ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "companyLogoUrl"     varchar`);
    await qr.query(`ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "positionsAvailable" int NOT NULL DEFAULT 1`);
    await qr.query(`ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "viewCount"          int NOT NULL DEFAULT 0`);

    // TypeORM's ManyToMany join table for requiredSkills.
    // The entity defines @JoinTable({ name: 'job_required_skills' }) which generates
    // columns jobsId / skillsId. Create the table if the old job_skills table doesn't cover it.
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "job_required_skills" (
        "jobsId"   uuid REFERENCES "jobs"("id")   ON DELETE CASCADE,
        "skillsId" uuid REFERENCES "skills"("id") ON DELETE CASCADE,
        PRIMARY KEY ("jobsId", "skillsId")
      )
    `);

    // Audit logs table (used by the audit module introduced alongside this migration)
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"     varchar,
        "userRole"   varchar,
        "orgId"      varchar,
        "action"     varchar NOT NULL,
        "entity"     varchar NOT NULL,
        "entityId"   varchar,
        "details"    jsonb,
        "ip"         varchar,
        "createdAt"  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_audit_logs_org"  ON "audit_logs" ("orgId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_audit_logs_user" ON "audit_logs" ("userId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_audit_logs_time" ON "audit_logs" ("createdAt" DESC)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "jobs" DROP COLUMN IF EXISTS "startDate"`);
    await qr.query(`ALTER TABLE "jobs" DROP COLUMN IF EXISTS "companyLogoUrl"`);
    await qr.query(`ALTER TABLE "jobs" DROP COLUMN IF EXISTS "positionsAvailable"`);
    await qr.query(`ALTER TABLE "jobs" DROP COLUMN IF EXISTS "viewCount"`);
    await qr.query(`DROP TABLE IF EXISTS "job_required_skills"`);
    await qr.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
