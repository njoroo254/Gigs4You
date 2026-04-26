import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds time-tracking columns to tasks that were in the entity but missing from the DB.
 * Run:  npm run migration:run
 */
export class AddTaskTimeTracking1700000000002 implements MigrationInterface {
  name = 'AddTaskTimeTracking1700000000002';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "tasks"
        ADD COLUMN IF NOT EXISTS "minutesToStart"    integer,
        ADD COLUMN IF NOT EXISTS "minutesToComplete" integer
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "tasks"
        DROP COLUMN IF EXISTS "minutesToStart",
        DROP COLUMN IF EXISTS "minutesToComplete"
    `);
  }
}
