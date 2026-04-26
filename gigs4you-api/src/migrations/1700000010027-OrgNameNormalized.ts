import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrgNameNormalized1700000010027 implements MigrationInterface {
  name = 'OrgNameNormalized1700000010027';

  async up(qr: QueryRunner): Promise<void> {
    // Add column nullable first so the backfill can run before enforcing NOT NULL
    await qr.query(`
      ALTER TABLE organisations
        ADD COLUMN IF NOT EXISTS "nameNormalized" TEXT
    `);

    // Backfill existing rows: lowercase + trim + collapse whitespace
    await qr.query(`
      UPDATE organisations
         SET "nameNormalized" = LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g')))
       WHERE "nameNormalized" IS NULL
    `);

    // Deduplicate any existing collisions by appending the org id suffix
    // (edge case: two rows that had slightly different casing already)
    await qr.query(`
      UPDATE organisations o
         SET "nameNormalized" = LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) || ' (' || SUBSTRING(id::text, 1, 8) || ')'
       WHERE id NOT IN (
           SELECT DISTINCT ON ("nameNormalized") id
           FROM organisations
           ORDER BY "nameNormalized", "createdAt" ASC
       )
    `);

    // Now enforce NOT NULL and unique
    await qr.query(`ALTER TABLE organisations ALTER COLUMN "nameNormalized" SET NOT NULL`);
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_organisations_name_normalized
        ON organisations ("nameNormalized")
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS uq_organisations_name_normalized`);
    await qr.query(`ALTER TABLE organisations DROP COLUMN IF EXISTS "nameNormalized"`);
  }
}
