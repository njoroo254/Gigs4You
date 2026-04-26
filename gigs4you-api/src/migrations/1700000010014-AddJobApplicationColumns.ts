import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobApplicationColumns1700000010014 implements MigrationInterface {
  name = 'AddJobApplicationColumns1700000010014';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "job_applications"
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "job_applications"
      DROP COLUMN IF EXISTS "updatedAt";
    `);
  }
}
