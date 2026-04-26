import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixWorkerProfileAgentIdType1700000010011 implements MigrationInterface {
  name = 'FixWorkerProfileAgentIdType1700000010011';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "worker_profiles"
      ALTER COLUMN "agentId" TYPE uuid USING "agentId"::uuid;
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "worker_profiles"
      ALTER COLUMN "agentId" TYPE varchar USING "agentId"::varchar;
    `);
  }
}
