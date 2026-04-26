import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentIdToJobApplications1700000010010 implements MigrationInterface {
  name = 'AddAgentIdToJobApplications1700000010010';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "job_applications"
      ADD COLUMN IF NOT EXISTS "agentId" varchar;
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "job_applications"
      DROP COLUMN IF EXISTS "agentId";
    `);
  }
}
