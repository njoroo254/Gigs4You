import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSystemOptions1700000000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "system_options" (
        "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type"      varchar NOT NULL,
        "value"     varchar NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_system_options_type_value" UNIQUE ("type", "value")
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_system_options_type ON system_options(type)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS "system_options"`);
  }
}
