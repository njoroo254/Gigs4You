import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskAiCompletionScore1700000010015 implements MigrationInterface {
  name = 'AddTaskAiCompletionScore1700000010015';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "tasks"
      ADD COLUMN IF NOT EXISTS "aiCompletionScore" NUMERIC(4,3) NULL;
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "tasks"
      DROP COLUMN IF EXISTS "aiCompletionScore";
    `);
  }
}
