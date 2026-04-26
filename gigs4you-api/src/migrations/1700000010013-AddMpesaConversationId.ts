import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMpesaConversationId1700000010013 implements MigrationInterface {
  name = 'AddMpesaConversationId1700000010013';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "wallet_transactions"
      ADD COLUMN IF NOT EXISTS "mpesaConversationId" varchar;
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "wallet_transactions"
      DROP COLUMN IF EXISTS "mpesaConversationId";
    `);
  }
}
