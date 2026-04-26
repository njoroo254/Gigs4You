import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `monthlyCuuLimit` to the subscriptions table.
 *
 * This column stores the monthly Cathy Usage Unit (CUU) allowance for an
 * organisation's active subscription.  When NULL the AI service falls back to
 * the plan-level defaults defined in cathy_usage.py:
 *
 *   FREE       →  200 CUU
 *   STARTER    →  800 CUU
 *   GROWTH     → 4 000 CUU
 *   SCALE      → 15 000 CUU
 *   ENTERPRISE →  -1 (unlimited, set via ENTERPRISE_CUU_LIMIT env var to cap)
 *
 * NULL means "use the plan default" — which allows the limit to be changed in
 * code without requiring a DB migration for every org.  Setting a positive
 * integer overrides the plan default for that specific subscription row
 * (useful for custom Enterprise deals).
 */
export class AddSubscriptionCuuLimit1700000010021 implements MigrationInterface {
  name = 'AddSubscriptionCuuLimit1700000010021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add the column (nullable — NULL = use plan default from cathy_usage.py)
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "monthlyCuuLimit" integer DEFAULT NULL
    `);

    // Backfill Enterprise subscriptions with -1 (unlimited) so existing
    // Enterprise orgs don't accidentally hit the plan-default cap of 15 000.
    await queryRunner.query(`
      UPDATE "subscriptions"
      SET "monthlyCuuLimit" = -1
      WHERE plan::text = 'enterprise'
        AND "monthlyCuuLimit" IS NULL
    `);

    // Add a check constraint: value must be -1 (unlimited) or a positive integer.
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD CONSTRAINT "chk_monthly_cuu_limit"
      CHECK ("monthlyCuuLimit" IS NULL OR "monthlyCuuLimit" = -1 OR "monthlyCuuLimit" > 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP CONSTRAINT IF EXISTS "chk_monthly_cuu_limit"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP COLUMN IF EXISTS "monthlyCuuLimit"
    `);
  }
}
