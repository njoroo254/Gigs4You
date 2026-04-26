import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveJobAssignedAgentId1700000000003 implements MigrationInterface {
  name = 'RemoveJobAssignedAgentId1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN IF EXISTS "assignedAgentId"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jobs" ADD COLUMN "assignedAgentId" varchar`);
  }
}
