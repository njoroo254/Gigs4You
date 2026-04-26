import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds SHA-256 hash chain columns to wallet_transactions for ledger immutability.
 *
 * previousHash: hash of the prior transaction in the same wallet (null for genesis)
 * hash:         SHA-256(previousHash:id:amount:walletId:status)
 *
 * Also adds a Postgres trigger that prevents updates to locked columns once
 * a transaction has reached a terminal state (completed/failed).
 * The trigger allows: status, mpesaConversationId (B2C correlation), hash (backfill).
 */
export class AddLedgerHashChain1700000010022 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Add hash chain columns ─────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE wallet_transactions
        ADD COLUMN IF NOT EXISTS "previousHash" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS hash           VARCHAR(64)
    `);

    // ── 2. Immutability trigger function ──────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION wallet_tx_immutability_guard()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        -- Allow free updates while the transaction is still PENDING
        IF OLD.status = 'pending' THEN
          RETURN NEW;
        END IF;

        -- Once terminal (completed/failed/cancelled), only allow:
        --   status, "mpesaConversationId" (B2C correlation ID written after B2C call)
        -- Everything else is frozen.
        IF (
          NEW.amount            <> OLD.amount            OR
          NEW."walletId"        <> OLD."walletId"        OR
          NEW.type              <> OLD.type              OR
          NEW.description       <> OLD.description       OR
          NEW.reference         <> OLD.reference         OR
          NEW."previousHash"    IS DISTINCT FROM OLD."previousHash"  OR
          (NEW.hash IS DISTINCT FROM OLD.hash AND OLD.hash IS NOT NULL)
        ) THEN
          RAISE EXCEPTION
            'wallet_transactions: attempt to modify immutable ledger fields on tx %', OLD.id
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;

        RETURN NEW;
      END;
      $$
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS wallet_tx_immutability ON wallet_transactions
    `);

    await queryRunner.query(`
      CREATE TRIGGER wallet_tx_immutability
        BEFORE UPDATE ON wallet_transactions
        FOR EACH ROW EXECUTE FUNCTION wallet_tx_immutability_guard()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS wallet_tx_immutability ON wallet_transactions
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS wallet_tx_immutability_guard()
    `);
    await queryRunner.query(`
      ALTER TABLE wallet_transactions
        DROP COLUMN IF EXISTS "previousHash",
        DROP COLUMN IF EXISTS hash
    `);
  }
}
