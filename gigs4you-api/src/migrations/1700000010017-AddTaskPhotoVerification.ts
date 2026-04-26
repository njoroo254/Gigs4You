import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskPhotoVerification1700000010017 implements MigrationInterface {
  name = 'AddTaskPhotoVerification1700000010017';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "tasks"
      ADD COLUMN IF NOT EXISTS "photoVerified"          BOOLEAN    NULL,
      ADD COLUMN IF NOT EXISTS "photoVerificationNote"  TEXT       NULL;
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "tasks"
      DROP COLUMN IF EXISTS "photoVerificationNote",
      DROP COLUMN IF EXISTS "photoVerified";
    `);
  }
}
