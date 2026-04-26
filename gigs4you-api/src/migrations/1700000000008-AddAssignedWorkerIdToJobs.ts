import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssignedWorkerIdToJobs1700000000008 implements MigrationInterface {
  name = 'AddAssignedWorkerIdToJobs1700000000008';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "assignedWorkerId" varchar`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "jobs" DROP COLUMN IF EXISTS "assignedWorkerId"`);
  }
}
