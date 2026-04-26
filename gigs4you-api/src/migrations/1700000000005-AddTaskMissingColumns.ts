import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds task columns that exist in the entity but were missing from the DB schema.
 * Also fixes column name mismatches via aliases in the entity (signatureUrl, completionLatitude/Longitude).
 */
export class AddTaskMissingColumns1700000000005 implements MigrationInterface {
  name = 'AddTaskMissingColumns1700000000005';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "tasks"
        ADD COLUMN IF NOT EXISTS "requiresPhoto"           boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "requiresSignature"       boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "acceptedAt"              timestamptz,
        ADD COLUMN IF NOT EXISTS "acceptanceWindowMinutes" integer  NOT NULL DEFAULT 120,
        ADD COLUMN IF NOT EXISTS "declineReason"           text
    `);
    console.log('✅ AddTaskMissingColumns migration complete');
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "tasks"
        DROP COLUMN IF EXISTS "requiresPhoto",
        DROP COLUMN IF EXISTS "requiresSignature",
        DROP COLUMN IF EXISTS "acceptedAt",
        DROP COLUMN IF EXISTS "acceptanceWindowMinutes",
        DROP COLUMN IF EXISTS "declineReason"
    `);
  }
}
