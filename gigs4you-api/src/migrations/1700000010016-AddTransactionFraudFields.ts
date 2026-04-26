import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionFraudFields1700000010016 implements MigrationInterface {
  name = 'AddTransactionFraudFields1700000010016';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "wallet_transactions"
      ADD COLUMN IF NOT EXISTS "fraudScore"      NUMERIC(4,3) NULL,
      ADD COLUMN IF NOT EXISTS "isFraudFlagged"  BOOLEAN      NOT NULL DEFAULT false;
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "wallet_transactions"
      DROP COLUMN IF EXISTS "fraudScore",
      DROP COLUMN IF EXISTS "isFraudFlagged";
    `);
  }
}
