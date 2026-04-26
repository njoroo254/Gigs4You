import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds tax compliance and billing contact fields to organisations.
 * Supports KRA PIN, VAT registration, business certificate number,
 * and physical address for invoice/receipt generation.
 */
export class AddOrgTaxFields1700000000006 implements MigrationInterface {
  name = 'AddOrgTaxFields1700000000006';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "organisations"
        ADD COLUMN IF NOT EXISTS "address"       varchar,
        ADD COLUMN IF NOT EXISTS "kraPin"        varchar,
        ADD COLUMN IF NOT EXISTS "vatNumber"     varchar,
        ADD COLUMN IF NOT EXISTS "businessRegNo" varchar,
        ADD COLUMN IF NOT EXISTS "billingEmail"  varchar,
        ADD COLUMN IF NOT EXISTS "billingPhone"  varchar
    `);
    console.log('✅ AddOrgTaxFields migration complete');
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE "organisations"
        DROP COLUMN IF EXISTS "address",
        DROP COLUMN IF EXISTS "kraPin",
        DROP COLUMN IF EXISTS "vatNumber",
        DROP COLUMN IF EXISTS "businessRegNo",
        DROP COLUMN IF EXISTS "billingEmail",
        DROP COLUMN IF EXISTS "billingPhone"
    `);
  }
}
