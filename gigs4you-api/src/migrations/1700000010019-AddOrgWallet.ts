import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrgWallet1700000010019 implements MigrationInterface {
  name = 'AddOrgWallet1700000010019';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "org_wallets" (
        "id"             UUID NOT NULL DEFAULT uuid_generate_v4(),
        "organisationId" VARCHAR NOT NULL,
        "balance"        DECIMAL(14,2) NOT NULL DEFAULT 0,
        "pendingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
        "totalDeposited" DECIMAL(14,2) NOT NULL DEFAULT 0,
        "totalDisbursed" DECIMAL(14,2) NOT NULL DEFAULT 0,
        "currency"       VARCHAR NOT NULL DEFAULT 'KES',
        "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_org_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_org_wallets_orgId" UNIQUE ("organisationId")
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_org_wallets_orgId" ON "org_wallets" ("organisationId")`);

    await qr.query(`
      CREATE TYPE "org_tx_type_enum" AS ENUM ('deposit', 'disbursement', 'refund')
    `).catch(() => {});

    await qr.query(`
      CREATE TYPE "org_tx_status_enum" AS ENUM ('completed', 'pending', 'failed')
    `).catch(() => {});

    await qr.query(`
      CREATE TABLE IF NOT EXISTS "org_wallet_transactions" (
        "id"          UUID NOT NULL DEFAULT uuid_generate_v4(),
        "orgWalletId" VARCHAR NOT NULL,
        "type"        "org_tx_type_enum" NOT NULL,
        "amount"      DECIMAL(14,2) NOT NULL,
        "description" VARCHAR NOT NULL,
        "reference"   VARCHAR,
        "mpesaRef"    VARCHAR,
        "agentId"     VARCHAR,
        "initiatedBy" VARCHAR,
        "status"      "org_tx_status_enum" NOT NULL DEFAULT 'completed',
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_org_wallet_transactions" PRIMARY KEY ("id")
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_org_wallet_tx_walletId_date" ON "org_wallet_transactions" ("orgWalletId", "createdAt")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS "org_wallet_transactions"`);
    await qr.query(`DROP TABLE IF EXISTS "org_wallets"`);
    await qr.query(`DROP TYPE IF EXISTS "org_tx_type_enum"`);
    await qr.query(`DROP TYPE IF EXISTS "org_tx_status_enum"`);
  }
}
