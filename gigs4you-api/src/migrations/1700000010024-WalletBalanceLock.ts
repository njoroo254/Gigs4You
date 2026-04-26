import { MigrationInterface, QueryRunner } from 'typeorm';

export class WalletBalanceLock1700000010024 implements MigrationInterface {
  name = 'WalletBalanceLock1700000010024';

  async up(qr: QueryRunner): Promise<void> {
    // Optimistic-lock version counter
    await qr.query(`
      ALTER TABLE wallets
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0
    `);

    // DB-level guard: balance can never go negative, even if application code fails
    await qr.query(`
      ALTER TABLE wallets
        ADD CONSTRAINT chk_wallet_balance_non_negative CHECK (balance >= 0)
    `);

    // Index on wallet_transactions to speed up pending-in-flight lookups
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_status
        ON wallet_transactions ("walletId", status)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_wallet_tx_wallet_status`);
    await qr.query(`ALTER TABLE wallets DROP CONSTRAINT IF EXISTS chk_wallet_balance_non_negative`);
    await qr.query(`ALTER TABLE wallets DROP COLUMN IF EXISTS version`);
  }
}
