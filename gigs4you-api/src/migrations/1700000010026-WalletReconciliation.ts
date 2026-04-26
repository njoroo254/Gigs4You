import { MigrationInterface, QueryRunner } from 'typeorm';

export class WalletReconciliation1700000010026 implements MigrationInterface {
  name = 'WalletReconciliation1700000010026';

  async up(qr: QueryRunner): Promise<void> {
    // Add RECONCILIATION_FAILED to the wallet_transactions status enum
    await qr.query(`ALTER TYPE wallet_transactions_status_enum ADD VALUE IF NOT EXISTS 'reconciliation_failed'`);

    // Add reconciliation attempt counter
    await qr.query(`
      ALTER TABLE wallet_transactions
        ADD COLUMN IF NOT EXISTS "reconciliationAttempts" INTEGER NOT NULL DEFAULT 0
    `);

    // Index to make the reconciler query fast
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_tx_pending_age
        ON wallet_transactions (status, "createdAt")
        WHERE status = 'pending'
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_wallet_tx_pending_age`);
    await qr.query(`ALTER TABLE wallet_transactions DROP COLUMN IF EXISTS "reconciliationAttempts"`);
    // Note: Postgres does not support removing an enum value — down migration
    // leaves 'reconciliation_failed' in the enum (harmless).
  }
}
