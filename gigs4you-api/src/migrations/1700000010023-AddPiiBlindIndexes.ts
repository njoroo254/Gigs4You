import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddPiiBlindIndexes
 *
 * Adds phoneHash and emailHash columns to the users table.
 * These columns store HMAC-SHA-256 blind indexes that allow equality lookups
 * on encrypted phone and email fields without decrypting them.
 *
 * After running this migration, execute the backfill script to populate the
 * hash columns for existing users (requires PII_HMAC_KEY to be set):
 *
 *   npm run script:backfill-pii-hashes
 *
 * The phone column is changed to TEXT (unlimited length) to accommodate the
 * AES-256-GCM ciphertext format (iv:ciphertext:tag in base64, ~150 chars).
 * The email column was already NULLABLE TEXT — no change needed.
 */
export class AddPiiBlindIndexes1700000010023 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Change phone to TEXT (ciphertext can be longer than a standard VARCHAR)
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "phone" TYPE TEXT
    `);

    // Add blind-index columns (nullable so existing rows aren't rejected)
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "phoneHash" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "emailHash" VARCHAR(64)
    `);

    // Unique indexes on the hash columns (used for lookups)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_phoneHash"
        ON "users" ("phoneHash")
        WHERE "phoneHash" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_emailHash"
        ON "users" ("emailHash")
        WHERE "emailHash" IS NOT NULL
    `);

    // Remove the old unique constraint on plain phone (it will conflict once
    // phone is stored as ciphertext — different plaintext phones would produce
    // different-length ciphertexts and could collide due to IV randomness, but
    // two users with the same phone SHOULD be blocked at the hash level now).
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "UQ_users_phone"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_phoneHash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_emailHash"`);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "phoneHash",
        DROP COLUMN IF EXISTS "emailHash"
    `);
    // Restore original unique constraint on phone (plaintext)
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "UQ_users_phone" UNIQUE ("phone")
    `);
  }
}
