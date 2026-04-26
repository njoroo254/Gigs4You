import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactVerification1700000010020 implements MigrationInterface {
  name = 'AddContactVerification1700000010020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add verification columns (camelCase — this DB has no naming-strategy override)
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "isPhoneVerified" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "isEmailVerified" boolean NOT NULL DEFAULT false
    `);

    // Backfill: all existing ACTIVE accounts were created before verification
    // was required, so treat them as already verified.
    await queryRunner.query(`
      UPDATE "users"
      SET "isPhoneVerified" = true
      WHERE "isActive" = true
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET "isEmailVerified" = true
      WHERE "isActive" = true AND "email" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "isPhoneVerified",
      DROP COLUMN IF EXISTS "isEmailVerified"
    `);
  }
}
