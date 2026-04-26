import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskApprovalColumns1700000000001 implements MigrationInterface {
  name = 'AddTaskApprovalColumns1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "approvedAt" timestamp`);
    await queryRunner.query(`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "approvedBy" varchar`);
    await queryRunner.query(`ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "paymentAmount" numeric(10,2)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "approvedAt"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "approvedBy"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "paymentAmount"`);
  }
}
