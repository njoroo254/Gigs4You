import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds fcmTokens column to users table for Firebase push notifications.
 * Run: npm run migration:run
 */
export class AddFcmTokensToUsers1700000000003 implements MigrationInterface {
  name = 'AddFcmTokensToUsers1700000000003';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "fcmTokens" text
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "fcmTokens"
    `);
  }
}
