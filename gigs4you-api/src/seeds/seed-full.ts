/**
 * Full seed — Gigs4You platform with realistic dummy data.
 *
 * Usage:  npm run seed:full
 *
 * Creates:
 *   1. Default "Gigs4You" platform organisation
 *   2. super_admin  (Peter Muchene)
 *   3. 1 org admin
 *   4. 2 managers
 *   5. 2 supervisors
 *   6. 8 agents
 *   7. 1 employer
 *   8. 2 worker (no-org freelancers)
 *   9. Agent records + wallets + transactions
 *  10. 6 skills
 *  11. 10 tasks (varied statuses + priorities)
 *  12. 6 jobs (varied urgency + status)
 *  13. Job applications
 *  14. GPS logs (last 7 days for active agents)
 *  15. Audit logs
 *  16. System options (counties + industries)
 *  17. Notifications
 */
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { v4 as uuid } from 'uuid';
import AppDataSource from '../data-source';

dotenv.config();

// ── helpers ──────────────────────────────────────────────────────────────────
const hash = (p: string) => bcrypt.hash(p, 10);
const daysAgo  = (n: number) => new Date(Date.now() - n * 86_400_000);
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

// Nairobi-area GPS coords (slightly varied)
const nairobiCoords = [
  { lat: -1.286389, lng: 36.817223 },
  { lat: -1.292066, lng: 36.821945 },
  { lat: -1.300271, lng: 36.825694 },
  { lat: -1.268750, lng: 36.808611 },
  { lat: -1.310000, lng: 36.840000 },
  { lat: -1.275500, lng: 36.795000 },
  { lat: -1.320000, lng: 36.855000 },
  { lat: -1.255000, lng: 36.783000 },
];

async function run() {
  await AppDataSource.initialize();
  const q = AppDataSource.query.bind(AppDataSource);

  console.log('🌱 Starting full seed…\n');

  // ── 0. Wipe existing data (bypass FK checks) ─────────────────────────────
  await q(`SET session_replication_role = 'replica'`);
  const tablesToTruncate = [
    'audit_logs','notifications','gps_logs',
    'wallet_transactions','wallets',
    'job_applications','job_required_skills','job_skills',
    'agent_skills','tasks','jobs',
    'agents','system_options',
    'users','organisations',
  ];
  for (const t of tablesToTruncate) {
    await q(`TRUNCATE TABLE "${t}" CASCADE`).catch(() => {/* table may not exist yet */});
  }
  await q(`SET session_replication_role = 'origin'`);
  console.log('✅ Existing data cleared');

  // ── 0b. Ensure enums & extensions exist ──────────────────────────────────
  await q(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  // ── 1. Organisation ───────────────────────────────────────────────────────
  const orgId = uuid();
  await q(`
    INSERT INTO organisations (id, name, industry, county, description, "adminUserId", "isActive")
    VALUES ($1, 'Gigs4You', 'Technology', 'Nairobi',
            'Default platform organisation — field operations, staffing & gig economy.',
            $2, true)
    ON CONFLICT DO NOTHING
  `, [orgId, orgId]);  // adminUserId will be updated to super_admin id shortly
  console.log(`✅ Organisation: Gigs4You (${orgId})`);

  // ── 2. Users ──────────────────────────────────────────────────────────────
  const pw = await hash('Test@1234');

  const users = [
    { id: uuid(), name: 'Peter Muchene',    phone: '+254759596670', email: 'peter@gigs4you.co.ke',        username: 'peter.muchene',    role: 'super_admin', orgId },
    { id: uuid(), name: 'Grace Wanjiku',    phone: '+254700100001', email: 'grace.wanjiku@gigs4you.co.ke',username: 'grace.admin',       role: 'admin',       orgId },
    { id: uuid(), name: 'James Ochieng',    phone: '+254700100002', email: 'james.ochieng@gigs4you.co.ke',username: 'james.manager',     role: 'manager',     orgId },
    { id: uuid(), name: 'Ruth Njeri',       phone: '+254700100003', email: 'ruth.njeri@gigs4you.co.ke',   username: 'ruth.manager',      role: 'manager',     orgId },
    { id: uuid(), name: 'David Kamau',      phone: '+254700100004', email: 'david.kamau@gigs4you.co.ke',  username: 'david.supervisor',  role: 'supervisor',  orgId },
    { id: uuid(), name: 'Esther Achieng',   phone: '+254700100005', email: 'esther.achieng@gigs4you.co.ke',username:'esther.supervisor', role: 'supervisor',  orgId },
    { id: uuid(), name: 'Brian Kipchoge',   phone: '+254700100006', email: 'brian.kip@gigs4you.co.ke',    username: 'brian.agent',       role: 'agent',       orgId },
    { id: uuid(), name: 'Mary Wambua',      phone: '+254700100007', email: 'mary.wambua@gigs4you.co.ke',  username: 'mary.agent',        role: 'agent',       orgId },
    { id: uuid(), name: 'Kevin Otieno',     phone: '+254700100008', email: 'kevin.otieno@gigs4you.co.ke', username: 'kevin.agent',       role: 'agent',       orgId },
    { id: uuid(), name: 'Stella Mutua',     phone: '+254700100009', email: 'stella.mutua@gigs4you.co.ke', username: 'stella.agent',      role: 'agent',       orgId },
    { id: uuid(), name: 'Felix Ndung\'u',   phone: '+254700100010', email: 'felix.ndungu@gigs4you.co.ke', username: 'felix.agent',       role: 'agent',       orgId },
    { id: uuid(), name: 'Cynthia Moraa',    phone: '+254700100011', email: 'cynthia.moraa@gigs4you.co.ke',username: 'cynthia.agent',     role: 'agent',       orgId },
    { id: uuid(), name: 'Samuel Waweru',    phone: '+254700100012', email: 'samuel.waweru@gigs4you.co.ke',username: 'samuel.agent',      role: 'agent',       orgId },
    { id: uuid(), name: 'Irene Cherono',    phone: '+254700100013', email: 'irene.cherono@gigs4you.co.ke',username: 'irene.agent',       role: 'agent',       orgId },
    { id: uuid(), name: 'Shopify KE Ltd',   phone: '+254700100014', email: 'jobs@shopifyke.co.ke',        username: 'shopify.employer',  role: 'employer',    orgId },
    { id: uuid(), name: 'John Freelancer',  phone: '+254700100015', email: 'john.free@gmail.com',         username: 'john.worker',       role: 'worker',      orgId: null },
    { id: uuid(), name: 'Anne Gig Worker',  phone: '+254700100016', email: 'anne.gig@gmail.com',          username: 'anne.worker',       role: 'worker',      orgId: null },
  ];

  for (const u of users) {
    await q(`
      INSERT INTO users (id, name, phone, email, username, role, password, "isActive", "organisationId", county, "createdAt", "updatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,'Nairobi',now(),now())
      ON CONFLICT (phone) DO UPDATE
        SET id=EXCLUDED.id, name=EXCLUDED.name, role=EXCLUDED.role,
            "organisationId"=EXCLUDED."organisationId",
            email=EXCLUDED.email, username=EXCLUDED.username
    `, [u.id, u.name, u.phone, u.email, u.username, u.role, pw, u.orgId]);
  }
  console.log(`✅ Users: ${users.length} created`);

  // Fix org adminUserId to super_admin
  await q(`UPDATE organisations SET "adminUserId" = $1 WHERE id = $2`, [users[0].id, orgId]);

  // ── 3. Agent records ──────────────────────────────────────────────────────
  // Agents = supervisors + agents (roles that need agent records)
  const agentUsers = users.filter(u => ['supervisor','agent'].includes(u.role));
  // Also create for admin, manager (needed for GPS / tasks)
  const staffUsers = users.filter(u => ['admin','manager','supervisor','agent'].includes(u.role));

  const agentMap: Record<string, string> = {};  // userId → agentId

  const agentData = [
    { xp: 4200, level: 5, streak: 14, rating: 4.8, completedJobs: 42, module: 'sales' },
    { xp: 3100, level: 4, streak:  7, rating: 4.5, completedJobs: 31, module: 'merchandising' },
    { xp: 5800, level: 6, streak: 21, rating: 4.9, completedJobs: 58, module: 'logistics' },
    { xp: 2200, level: 3, streak:  3, rating: 4.2, completedJobs: 22, module: 'sales' },
    { xp: 1500, level: 2, streak:  0, rating: 3.9, completedJobs: 15, module: 'technician' },
    { xp: 6700, level: 7, streak: 30, rating: 4.95, completedJobs: 67, module: 'research' },
    { xp: 800,  level: 1, streak:  1, rating: 4.1, completedJobs:  8, module: 'merchandising' },
    { xp: 3400, level: 4, streak:  9, rating: 4.6, completedJobs: 34, module: 'sales' },
    { xp: 900,  level: 1, streak:  2, rating: 4.0, completedJobs:  9, module: 'logistics' },
    { xp: 2800, level: 3, streak:  5, rating: 4.3, completedJobs: 28, module: 'technician' },
  ];

  for (let i = 0; i < staffUsers.length; i++) {
    const u = staffUsers[i];
    const d = agentData[i % agentData.length];
    const agentId = uuid();
    agentMap[u.id] = agentId;
    const coords = nairobiCoords[i % nairobiCoords.length];
    await q(`
      INSERT INTO agents (id, "userId", "organisationId", category, "totalXp", level, "currentStreak",
        "averageRating", "completedJobs", "isAvailable", "isConfirmed", status,
        "lastLatitude", "lastLongitude", "lastSeenAt", "createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true,'offline',$10,$11,$12,now())
      ON CONFLICT DO NOTHING
    `, [agentId, u.id, orgId, d.module, d.xp, d.level, d.streak,
        d.rating, d.completedJobs, coords.lat, coords.lng, hoursAgo(Math.floor(Math.random()*8+1))]);
  }
  console.log(`✅ Agents: ${staffUsers.length} agent records`);

  // ── 4. Wallets ────────────────────────────────────────────────────────────
  const walletMap: Record<string, string> = {};  // agentId → walletId

  const agentOnlyUsers = users.filter(u => u.role === 'agent');
  const walletAmounts = [4500, 12000, 800, 22000, 3200, 9800, 650, 15500];

  for (let i = 0; i < agentOnlyUsers.length; i++) {
    const u = agentOnlyUsers[i];
    const agentId = agentMap[u.id];
    if (!agentId) continue;
    const walletId = uuid();
    walletMap[agentId] = walletId;
    const bal = walletAmounts[i % walletAmounts.length];
    await q(`
      INSERT INTO wallets (id, "agentId", balance, "pendingBalance", "totalEarned", "totalWithdrawn", currency, "mpesaPhone", "createdAt", "updatedAt")
      VALUES ($1,$2,$3,500,$4,$5,'KES',$6,now(),now())
      ON CONFLICT ("agentId") DO NOTHING
    `, [walletId, agentId, bal, bal + 5000, Math.floor(bal * 0.3), u.phone]);
  }
  console.log(`✅ Wallets: ${agentOnlyUsers.length} wallets`);

  // ── 5. Wallet transactions ─────────────────────────────────────────────────
  const txDescriptions = [
    ['Task completion — CBD audit',        'credit',  850],
    ['Task completion — Westlands survey', 'credit', 1200],
    ['M-Pesa withdrawal',                  'debit',  3000],
    ['Task completion — Kikuyu road check','credit',  650],
    ['Task completion — Mombasa Rd recon', 'credit', 1500],
    ['M-Pesa withdrawal',                  'debit',  5000],
    ['Bonus — monthly streak reward',      'credit',  500],
    ['Task completion — Thika Rd sample',  'credit',  900],
    ['Referral bonus',                     'credit',  300],
    ['M-Pesa withdrawal',                  'debit',  2000],
  ];

  const mpesaRef = () => 'MP' + Math.random().toString(36).substring(2, 10).toUpperCase();

  for (const agentId of Object.keys(walletMap)) {
    const walletId = walletMap[agentId];
    for (let i = 0; i < 5; i++) {
      const [desc, type, amount] = txDescriptions[i % txDescriptions.length];
      const ref = mpesaRef();
      await q(`
        INSERT INTO wallet_transactions (id, "walletId", type, amount, description, status, reference, "createdAt")
        VALUES ($1,$2,$3,$4,$5,'completed',$6,$7)
      `, [uuid(), walletId, type, amount, desc, ref, daysAgo(Math.floor(Math.random()*25+1))]);
    }
  }
  console.log(`✅ Wallet transactions: seeded`);

  // ── 6. Skills ─────────────────────────────────────────────────────────────
  const skills = [
    { id: uuid(), name: 'Sales & Promotions',      category: 'sales',         iconCode: 0xe55f, colorIndex: 0 },
    { id: uuid(), name: 'Merchandising',            category: 'merchandising', iconCode: 0xe55c, colorIndex: 1 },
    { id: uuid(), name: 'Delivery & Logistics',     category: 'logistics',     iconCode: 0xe558, colorIndex: 2 },
    { id: uuid(), name: 'Data Collection',          category: 'research',      iconCode: 0xe55d, colorIndex: 3 },
    { id: uuid(), name: 'Technical Installation',   category: 'technician',    iconCode: 0xe55e, colorIndex: 4 },
    { id: uuid(), name: 'Customer Service',         category: 'general',       iconCode: 0xe560, colorIndex: 5 },
  ];

  for (const s of skills) {
    await q(`
      INSERT INTO skills (id, name, category, "colorIndex", "createdAt")
      VALUES ($1,$2,$3,$4,now())
      ON CONFLICT DO NOTHING
    `, [s.id, s.name, s.category, s.colorIndex]);
  }
  console.log(`✅ Skills: ${skills.length}`);

  // ── 7. Tasks ──────────────────────────────────────────────────────────────
  const agentUserIds = users.filter(u => u.role === 'agent');
  const managerUser  = users.find(u => u.role === 'manager')!;

  const taskDefs = [
    { title: 'Shelf audit — Nairobi CBD Carrefour',       priority: 'high',   status: 'completed',   daysAgo: 5,  xp: 150 },
    { title: 'Product display setup — Westlands Mall',    priority: 'medium', status: 'completed',   daysAgo: 3,  xp: 100 },
    { title: 'Mystery shopper — Junction Mall',           priority: 'low',    status: 'in_progress', daysAgo: 1,  xp: 80  },
    { title: 'Competitor pricing survey — Industrial Area',priority:'high',   status: 'pending',     daysAgo: 0,  xp: 120 },
    { title: 'Stock count — Kiambu Road distributors',    priority: 'medium', status: 'pending',     daysAgo: 0,  xp: 90  },
    { title: 'Brand ambassador activation — Thika Rd',    priority: 'high',   status: 'failed',      daysAgo: 7,  xp: 100 },
    { title: 'Route-to-market survey — South B',          priority: 'low',    status: 'completed',   daysAgo: 10, xp: 70  },
    { title: 'Planogram compliance check — Karen',        priority: 'medium', status: 'in_progress', daysAgo: 2,  xp: 110 },
    { title: 'Sample distribution — Eastlands',           priority: 'high',   status: 'pending',     daysAgo: 0,  xp: 130 },
    { title: 'Equipment installation — Gigiri office',    priority: 'medium', status: 'completed',   daysAgo: 6,  xp: 200 },
  ];

  const taskIds: string[] = [];
  for (let i = 0; i < taskDefs.length; i++) {
    const def = taskDefs[i];
    const agentUser = agentUserIds[i % agentUserIds.length];
    const agentId   = agentMap[agentUser.id];
    const coords    = nairobiCoords[i % nairobiCoords.length];
    const taskId    = uuid();
    taskIds.push(taskId);

    const createdAt  = daysAgo(def.daysAgo + 1);
    const dueAt      = def.status === 'pending' ? daysFromNow(2) : daysAgo(def.daysAgo - 1);
    const completedAt = def.status === 'completed' ? daysAgo(def.daysAgo) : null;
    const startedAt   = ['completed','in_progress','failed'].includes(def.status)
      ? new Date(createdAt.getTime() + 3_600_000) : null;

    await q(`
      INSERT INTO tasks (
        id, title, description, status, priority,
        latitude, longitude, "locationName",
        "dueAt", "startedAt", "completedAt",
        "xpReward", "agentId", "assignedBy",
        "acceptanceStatus", "organisationId",
        "createdAt", "updatedAt"
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,
        $9,$10,$11,
        $12,$13,$14,
        'accepted',$15,
        $16,$16
      ) ON CONFLICT DO NOTHING
    `, [
      taskId, def.title,
      `Detailed field task: ${def.title}. Ensure all checklist items are completed before submission.`,
      def.status, def.priority,
      coords.lat, coords.lng, `Nairobi — ${def.title.split('—')[1]?.trim() || 'CBD'}`,
      dueAt, startedAt, completedAt,
      def.xp, agentId, managerUser.id,
      orgId, createdAt,
    ]);
  }
  console.log(`✅ Tasks: ${taskDefs.length}`);

  // ── 8. Jobs ───────────────────────────────────────────────────────────────
  const employerUser = users.find(u => u.role === 'employer')!;

  const jobDefs = [
    { title: 'Brand Promoters Needed — Nairobi CBD',    category: 'sales',         urgent: true,  featured: true,  budgetMin: 800,  budgetMax: 1200, budgetType: 'daily',   positions: 5 },
    { title: 'Merchandisers — Westlands Supermarkets',  category: 'merchandising', urgent: false, featured: true,  budgetMin: 600,  budgetMax: 900,  budgetType: 'daily',   positions: 3 },
    { title: 'Delivery Riders — Nairobi Metro Area',    category: 'logistics',     urgent: true,  featured: false, budgetMin: 500,  budgetMax: 700,  budgetType: 'daily',   positions: 10 },
    { title: 'Data Enumerators — Household Survey',     category: 'research',      urgent: false, featured: false, budgetMin: 1500, budgetMax: 2500, budgetType: 'fixed',   positions: 8 },
    { title: 'IT Support Technicians — Nairobi CBD',    category: 'technician',    urgent: false, featured: true,  budgetMin: 2000, budgetMax: 4000, budgetType: 'daily',   positions: 2 },
    { title: 'Customer Care Reps — Mombasa Rd Office',  category: 'general',       urgent: false, featured: false, budgetMin: 30000, budgetMax: 45000, budgetType: 'monthly', positions: 4 },
  ];

  const jobIds: string[] = [];
  for (let i = 0; i < jobDefs.length; i++) {
    const def = jobDefs[i];
    const jobId = uuid();
    jobIds.push(jobId);
    const coords = nairobiCoords[i % nairobiCoords.length];
    await q(`
      INSERT INTO jobs (
        id, title, description, category,
        "budgetMin", "budgetMax", "budgetType",
        location, latitude, longitude, county,
        status, "isUrgent", "isFeatured",
        "startDate", deadline,
        "postedById", "companyName",
        "positionsAvailable", "applicantCount", "viewCount",
        "createdAt", "updatedAt"
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,
        $8,$9,$10,'Nairobi',
        'open',$11,$12,
        $13,$14,
        $15,'Gigs4You',
        $16,0,$17,
        $18,$18
      ) ON CONFLICT DO NOTHING
    `, [
      jobId, def.title,
      `We are looking for motivated ${def.category} professionals. This role requires reliability, good communication skills and willingness to work in the field. Apply today!`,
      def.category,
      def.budgetMin, def.budgetMax, def.budgetType,
      `Nairobi, Kenya`, coords.lat, coords.lng,
      def.urgent, def.featured,
      daysFromNow(7), daysFromNow(30),
      employerUser.id,
      def.positions, Math.floor(Math.random()*80+10),
      daysAgo(Math.floor(Math.random()*14+1)),
    ]);

    // Link skills to job
    const skillIdx = i % skills.length;
    await q(`
      INSERT INTO job_required_skills ("jobsId", "skillsId")
      VALUES ($1, $2) ON CONFLICT DO NOTHING
    `, [jobId, skills[skillIdx].id]);
  }
  console.log(`✅ Jobs: ${jobDefs.length}`);

  // ── 9. Job applications ───────────────────────────────────────────────────
  const appStatuses = ['pending', 'shortlisted', 'accepted', 'rejected', 'pending'];
  for (let j = 0; j < 3; j++) {
    const jobId = jobIds[j];
    for (let a = 0; a < 3; a++) {
      const agentUser = agentUserIds[a];
      const agentId   = agentMap[agentUser.id];
      if (!agentId) continue;
      await q(`
        INSERT INTO job_applications (id, "jobId", "applicantId", status, "coverNote", "appliedAt")
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT DO NOTHING
      `, [
        uuid(), jobId, agentId,
        appStatuses[(j + a) % appStatuses.length],
        'I am experienced in this type of work and available immediately. I have a clean track record and strong references.',
        daysAgo(Math.floor(Math.random()*7+1)),
      ]);
    }
  }
  console.log(`✅ Job applications: seeded`);

  // ── 10. GPS logs (last 7 days for 4 active agents) ───────────────────────
  const activeAgentUsers = agentUserIds.slice(0, 4);
  for (const u of activeAgentUsers) {
    const agentId = agentMap[u.id];
    if (!agentId) continue;
    const baseCoord = nairobiCoords[agentUserIds.indexOf(u) % nairobiCoords.length];
    for (let day = 7; day >= 1; day--) {
      // 6 pings per working day
      for (let ping = 0; ping < 6; ping++) {
        const jitterLat = (Math.random() - 0.5) * 0.01;
        const jitterLng = (Math.random() - 0.5) * 0.01;
        const ts = new Date(daysAgo(day).getTime() + (8 + ping * 1.5) * 3_600_000);
        await q(`
          INSERT INTO gps_logs (id, "agentId", latitude, longitude, speed, accuracy, "isFlagged", "createdAt")
          VALUES ($1,$2,$3,$4,$5,$6,false,$7)
        `, [
          uuid(), agentId,
          baseCoord.lat + jitterLat, baseCoord.lng + jitterLng,
          Math.round(Math.random() * 40 * 100) / 100,   // 0–40 km/h
          Math.round(Math.random() * 15 * 100) / 100,   // 0–15m accuracy
          ts,
        ]);
      }
    }
  }
  console.log(`✅ GPS logs: ${activeAgentUsers.length * 7 * 6} pings`);

  // ── 11. System options ────────────────────────────────────────────────────
  const counties = [
    'Nairobi','Mombasa','Kisumu','Nakuru','Eldoret','Thika','Nyeri','Machakos',
    'Meru','Garissa','Kakamega','Kericho','Kisii','Embu','Malindi',
  ];
  const industries = [
    'Technology','FMCG & Retail','Logistics & Transport','Finance & Banking',
    'Healthcare','Construction','Hospitality','Education','Agriculture','Telecoms',
  ];

  for (const county of counties) {
    await q(`
      INSERT INTO system_options (id, type, value, "createdAt")
      VALUES (gen_random_uuid(), 'county', $1, now())
      ON CONFLICT DO NOTHING
    `, [county]);
  }
  for (const industry of industries) {
    await q(`
      INSERT INTO system_options (id, type, value, "createdAt")
      VALUES (gen_random_uuid(), 'industry', $1, now())
      ON CONFLICT DO NOTHING
    `, [industry]);
  }
  console.log(`✅ System options: ${counties.length} counties, ${industries.length} industries`);

  // ── 12. Notifications ─────────────────────────────────────────────────────
  const adminUser = users.find(u => u.role === 'admin')!;
  const notifDefs = [
    { userId: adminUser.id, type: 'task',    title: 'Task overdue', body: 'Shelf audit — CBD Carrefour is 2 hours overdue.' },
    { userId: adminUser.id, type: 'payment', title: 'Payment processed', body: 'KES 3,000 M-Pesa payment to Brian Kipchoge was successful.' },
    { userId: adminUser.id, type: 'system',  title: 'New agent registered', body: 'Irene Cherono has joined your organisation.' },
    { userId: adminUser.id, type: 'job',     title: 'New job application', body: '3 agents applied for Brand Promoters Needed — Nairobi CBD.' },
    { userId: users[0].id,  type: 'system',  title: 'System health OK', body: 'All services are operational. No incidents in the last 24h.' },
  ];

  for (const n of notifDefs) {
    await q(`
      INSERT INTO notifications (id, "userId", type, title, body, "isRead", "createdAt")
      VALUES ($1,$2,$3,$4,$5,false,$6)
      ON CONFLICT DO NOTHING
    `, [uuid(), n.userId, n.type, n.title, n.body, daysAgo(Math.floor(Math.random()*3))]);
  }
  console.log(`✅ Notifications: ${notifDefs.length}`);

  // ── 13. Audit logs ────────────────────────────────────────────────────────
  const auditEntries = [
    { userId: users[0].id, userRole: 'super_admin', action: 'CREATE', entity: 'Organisation', entityId: orgId, details: { name: 'Gigs4You' } },
    { userId: users[1].id, userRole: 'admin',       action: 'CREATE', entity: 'Task',         entityId: taskIds[0], details: { title: taskDefs[0].title } },
    { userId: users[2].id, userRole: 'manager',     action: 'ASSIGN', entity: 'Task',         entityId: taskIds[1], details: { agentName: agentUserIds[0].name } },
    { userId: users[0].id, userRole: 'super_admin', action: 'LOGIN',  entity: 'User',         entityId: users[0].id, details: { ip: '127.0.0.1' } },
    { userId: users[1].id, userRole: 'admin',       action: 'LOGIN',  entity: 'User',         entityId: users[1].id, details: { ip: '197.232.10.5' } },
    { userId: users[2].id, userRole: 'manager',     action: 'CREATE', entity: 'Job',          entityId: jobIds[0], details: { title: jobDefs[0].title } },
  ];

  for (const entry of auditEntries) {
    await q(`
      INSERT INTO audit_logs (id, "userId", "userRole", "orgId", action, entity, "entityId", details, ip, "createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'127.0.0.1',$9)
      ON CONFLICT DO NOTHING
    `, [uuid(), entry.userId, entry.userRole, orgId, entry.action, entry.entity, entry.entityId,
        JSON.stringify(entry.details), daysAgo(Math.floor(Math.random()*5))]);
  }
  console.log(`✅ Audit logs: ${auditEntries.length}`);

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n🎉 Seed complete!\n');
  console.log('Login credentials (all users):  password → Test@1234');
  console.log('─────────────────────────────────────────────────────');
  console.log(`Super Admin  → phone: +254759596670  username: peter.muchene`);
  console.log(`Org Admin    → phone: +254700100001  username: grace.admin`);
  console.log(`Manager      → phone: +254700100002  username: james.manager`);
  console.log(`Agent        → phone: +254700100006  username: brian.agent`);
  console.log(`Employer     → phone: +254700100014  username: shopify.employer`);
  console.log(`Worker       → phone: +254700100015  username: john.worker`);
  console.log('─────────────────────────────────────────────────────\n');

  await AppDataSource.destroy();
}

run().catch(e => { console.error('❌ Seed failed:', e.message, e); process.exit(1); });
