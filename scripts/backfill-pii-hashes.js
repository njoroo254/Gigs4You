#!/usr/bin/env node
/* Backfill PII hashes for users: compute blind index and populate phoneHash/emailHash
 * Requires:
 *  - Node.js
 *  - npm package 'pg' installed
 *  - Environment variables for DB connection:
 *      - PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (or use DATABASE_URL)
 *  - Encryption keys (for blindIndex): PII_ENCRYPTION_KEY, PII_HMAC_KEY (64-hex chars)
 */
const { Client } = require('pg');
const crypto = require('crypto');

function blindIndex(value, hmacHex) {
  if (value == null) return null;
  if (!hmacHex) return null;
  const key = Buffer.from(hmacHex, 'hex');
  const h = crypto.createHmac('sha256', key);
  h.update(value.toLowerCase().trim());
  return h.digest('hex');
}

async function main() {
  const ENC = process.env.PII_ENCRYPTION_KEY;
  const HMAC = process.env.PII_HMAC_KEY;
  const dbUrl = process.env.DATABASE_URL ||
    `postgres://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;

  if (!dbUrl) {
    console.error('DATABASE_URL or PG* connection env vars must be set');
    process.exit(1);
  }

  if (!HMAC) {
    console.warn('PII_HMAC_KEY not set; blind index will not be computed. Aborting backfill.');
    process.exit(0);
  }
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  // Backfill blind-index hashes even if encryption of plaintext PII is not configured.
  // We only need the HMAC key to compute the blind index.
  const backfillPhone = !!HMAC;
  const backfillEmail = !!HMAC;

  try {
    if (backfillPhone) {
      const res = await client.query(
        'SELECT id, phone FROM users WHERE phone IS NOT NULL AND "phoneHash" IS NULL'
      );
      console.log(`Found ${res.rows.length} users needing phoneHash backfill`);
      for (const row of res.rows) {
        const { id, phone } = row;
        const hash = blindIndex(String(phone), HMAC);
        if (hash) {
          await client.query('UPDATE users SET "phoneHash" = $1 WHERE id = $2', [hash, id]);
          console.log(`Updated phoneHash for user ${id}`);
        }
      }
    }

    if (backfillEmail) {
      const res = await client.query(
        'SELECT id, email FROM users WHERE email IS NOT NULL AND "emailHash" IS NULL'
      );
      console.log(`Found ${res.rows.length} users needing emailHash backfill`);
      for (const row of res.rows) {
        const { id, email } = row;
        const hash = blindIndex(String(email), HMAC);
        if (hash) {
          await client.query('UPDATE users SET "emailHash" = $1 WHERE id = $2', [hash, id]);
          console.log(`Updated emailHash for user ${id}`);
        }
      }
    }
  } catch (err) {
    console.error('Backfill failed:', err);
  } finally {
    await client.end();
  }
  console.log('Backfill complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
