import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixJobApplicationAgentIdType1700000010012 implements MigrationInterface {
  name = 'FixJobApplicationAgentIdType1700000010012';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "job_applications"
      ALTER COLUMN "agentId" TYPE uuid USING "agentId"::uuid;
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "job_applications"
      ALTER COLUMN "agentId" TYPE varchar USING "agentId"::varchar;
    `);
  }
}
