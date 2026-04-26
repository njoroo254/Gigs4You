import { MigrationInterface, QueryRunner } from 'typeorm';

export class WalletStatsIndexes1700000010025 implements MigrationInterface {
  name = 'WalletStatsIndexes1700000010025';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_tx_status_created
        ON wallet_transactions (status, "createdAt" DESC)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_created
        ON wallet_transactions ("walletId", "createdAt" DESC)
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_wallets_org
        ON wallets ("agentId")
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_wallet_tx_status_created`);
    await qr.query(`DROP INDEX IF EXISTS idx_wallet_tx_wallet_created`);
    await qr.query(`DROP INDEX IF EXISTS idx_wallets_org`);
  }
}
