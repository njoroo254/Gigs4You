import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationReminder1700000000007 implements MigrationInterface {
  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE notifications
        ADD COLUMN IF NOT EXISTS "isImportant" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "remindAt"    timestamptz
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_notif_reminder
        ON notifications ("remindAt")
        WHERE "isImportant" = true AND "isRead" = false AND "remindAt" IS NOT NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_notif_reminder`);
    await qr.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS "remindAt"`);
    await qr.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS "isImportant"`);
  }
}
