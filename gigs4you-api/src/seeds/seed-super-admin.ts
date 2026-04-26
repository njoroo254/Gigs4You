/**
 * Seeds the super_admin user AND the default "Gigs4You" platform organisation.
 * Usage:  npm run seed:super-admin
 *
 * Override defaults via env vars:
 *   SEED_NAME, SEED_PHONE, SEED_EMAIL, SEED_USERNAME, SEED_PASSWORD
 */
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import AppDataSource from '../data-source';

dotenv.config();

async function run() {
  await AppDataSource.initialize();

  const name     = process.env.SEED_NAME     || 'Peter Muchene';
  const phone    = process.env.SEED_PHONE    || '+254759596670';
  const email    = process.env.SEED_EMAIL    || 'admin@gigs4you.co.ke';
  const username = process.env.SEED_USERNAME || 'super_admin';
  const password = process.env.SEED_PASSWORD || 'Admin@1234';

  const hashed = await bcrypt.hash(password, 10);

  // ── 1. Upsert super_admin user ─────────────────────────────────────────
  const [user] = await AppDataSource.query(`
    INSERT INTO users (name, phone, email, username, role, password, "isActive")
    VALUES ($1, $2, $3, $4, 'super_admin', $5, true)
    ON CONFLICT (phone) DO UPDATE
      SET role = 'super_admin', password = EXCLUDED.password, "isActive" = true
    RETURNING id
  `, [name, phone, email, username, hashed]);

  const userId = user.id;
  console.log(`✅ super_admin seeded — phone: ${phone}  password: ${password}  id: ${userId}`);

  // ── 2. Create the default "Gigs4You" platform organisation ────────────
  const [org] = await AppDataSource.query(`
    INSERT INTO organisations (name, industry, county, description, "ownerId", "isActive")
    VALUES ('Gigs4You', 'Technology', 'Nairobi',
            'Default platform organisation — all super_admins belong here.',
            $1, true)
    ON CONFLICT DO NOTHING
    RETURNING id
  `, [userId]);

  // org will be undefined if ON CONFLICT DO NOTHING fired (row already exists)
  let orgId: string;
  if (org?.id) {
    orgId = org.id;
    console.log(`✅ Default "Gigs4You" organisation created — id: ${orgId}`);
  } else {
    // Fetch the existing one
    const [existing] = await AppDataSource.query(
      `SELECT id FROM organisations WHERE name = 'Gigs4You' LIMIT 1`
    );
    orgId = existing.id;
    console.log(`ℹ️  Default "Gigs4You" organisation already exists — id: ${orgId}`);
  }

  // ── 3. Assign super_admin to the default org ───────────────────────────
  await AppDataSource.query(`
    UPDATE users SET "organisationId" = $1 WHERE id = $2
  `, [orgId, userId]);

  console.log(`✅ super_admin assigned to "Gigs4You" organisation`);

  await AppDataSource.destroy();
}

run().catch((e) => { console.error(e); process.exit(1); });
