import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * InitialSchema — creates all tables from scratch.
 * Generated to match all current entities exactly.
 * Run:  npm run migration:run
 * Revert: npm run migration:revert
 */
export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(qr: QueryRunner): Promise<void> {
    // ── Enums ──────────────────────────────────────────────────────────
    await qr.query(`DO $$ BEGIN
      CREATE TYPE users_role_enum AS ENUM (
        'super_admin','admin','manager','supervisor','agent','employer','worker'
      );
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE agents_status_enum AS ENUM ('checked_in','checked_out','offline');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE tasks_status_enum AS ENUM ('pending','in_progress','completed','failed','cancelled');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE tasks_priority_enum AS ENUM ('low','medium','high','urgent');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE jobs_status_enum AS ENUM ('open','assigned','completed','cancelled','expired');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE jobs_budgettype_enum AS ENUM ('fixed','daily','hourly','monthly');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE verifications_status_enum AS ENUM ('pending','submitted','approved','rejected');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE verifications_documenttype_enum AS ENUM ('national_id','passport','driving_license');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE billing_subscriptions_plan_enum AS ENUM ('free','starter','growth','scale','enterprise');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE billing_subscriptions_status_enum AS ENUM ('trial','active','past_due','cancelled','expired');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE billing_invoices_plan_enum AS ENUM ('free','starter','growth','scale','enterprise');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE billing_invoices_status_enum AS ENUM ('pending','paid','failed','cancelled','refunded');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE billing_invoices_paymentmethod_enum AS ENUM ('mpesa_stk','mpesa_paybill','stripe','flutterwave','manual');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE wallet_transactions_type_enum AS ENUM ('credit','debit','withdrawal','bonus','refund');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE wallet_transactions_status_enum AS ENUM ('pending','completed','failed','reversed');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    await qr.query(`DO $$ BEGIN
      CREATE TYPE notifications_type_enum AS ENUM ('task','job','payment','system','application');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$`);

    // ── Tables ─────────────────────────────────────────────────────────

    // organisations
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "organisations" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"        varchar NOT NULL,
        "slug"        varchar UNIQUE,
        "industry"    varchar,
        "county"      varchar,
        "description" text,
        "logoUrl"     varchar,
        "isActive"    boolean NOT NULL DEFAULT true,
        "adminUserId" varchar,
        "createdAt"   timestamptz NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz NOT NULL DEFAULT now()
      )`);

    // users
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"           varchar NOT NULL,
        "phone"          varchar NOT NULL UNIQUE,
        "username"       varchar UNIQUE,
        "email"          varchar UNIQUE,
        "role"           users_role_enum NOT NULL DEFAULT 'agent',
        "password"       varchar NOT NULL,
        "isActive"       boolean NOT NULL DEFAULT true,
        "organisationId" varchar,
        "companyName"    varchar,
        "county"         varchar,
        "permissions"    text,
        "lastLoginAt"    timestamptz,
        "lastLoginIp"    varchar,
        "fcmTokens"      text,
        "notifPrefs"     text,
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        "updatedAt"      timestamptz NOT NULL DEFAULT now()
      )`);

    // agents
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "agents" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"          uuid UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "organisationId"  varchar,
        "deviceId"        varchar,
        "deviceModel"     varchar,
        "status"          agents_status_enum NOT NULL DEFAULT 'offline',
        "lastLatitude"    decimal(10,7),
        "lastLongitude"   decimal(10,7),
        "lastSeenAt"      timestamptz,
        "checkedInAt"     timestamptz,
        "category"        varchar NOT NULL DEFAULT 'sales',
        "bio"             text,
        "isAvailable"     boolean NOT NULL DEFAULT true,
        "totalXp"         int NOT NULL DEFAULT 0,
        "level"           int NOT NULL DEFAULT 1,
        "currentStreak"   int NOT NULL DEFAULT 0,
        "completedJobs"   int NOT NULL DEFAULT 0,
        "averageRating"   decimal(3,2) NOT NULL DEFAULT 0,
        "totalRatings"    int NOT NULL DEFAULT 0,
        "isConfirmed"     boolean NOT NULL DEFAULT true,
        "createdAt"       timestamptz NOT NULL DEFAULT now()
      )`);

    // skills
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "skills" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"       varchar NOT NULL UNIQUE,
        "category"   varchar NOT NULL DEFAULT 'general',
        "colorIndex" int NOT NULL DEFAULT 0,
        "createdAt"  timestamptz NOT NULL DEFAULT now()
      )`);

    // agent_skills junction
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "agent_skills" (
        "agentId" uuid REFERENCES "agents"("id") ON DELETE CASCADE,
        "skillId" uuid REFERENCES "skills"("id") ON DELETE CASCADE,
        PRIMARY KEY ("agentId","skillId")
      )`);

    // tasks
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "tasks" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title"               varchar NOT NULL,
        "description"         text,
        "status"              tasks_status_enum NOT NULL DEFAULT 'pending',
        "priority"            tasks_priority_enum NOT NULL DEFAULT 'medium',
        "latitude"            decimal(10,7),
        "longitude"           decimal(10,7),
        "locationName"        varchar,
        "dueAt"               timestamptz,
        "startedAt"           timestamptz,
        "completedAt"         timestamptz,
        "estimatedMinutes"    int,
        "actualMinutes"       int,
        "requiresAcceptance"  boolean NOT NULL DEFAULT false,
        "acceptanceOverdue"   boolean NOT NULL DEFAULT false,
        "checklist"           text,
        "photoUrls"           text,
        "notes"               text,
        "signatureUrl"        varchar,
        "completionLatitude"  decimal(10,7),
        "completionLongitude" decimal(10,7),
        "xpReward"            int NOT NULL DEFAULT 50,
        "assignedBy"          varchar,
        "agentId"             uuid REFERENCES "agents"("id"),
        "organisationId"      varchar,
        "jobId"               varchar,
        "acceptanceStatus"    varchar DEFAULT 'pending',
        "acceptanceDeadline"  timestamptz,
        "createdAt"           timestamptz NOT NULL DEFAULT now(),
        "updatedAt"           timestamptz NOT NULL DEFAULT now()
      )`);

    // jobs
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "jobs" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title"          varchar NOT NULL,
        "description"    text NOT NULL,
        "category"       varchar NOT NULL DEFAULT 'general',
        "budgetMin"      decimal(10,2) NOT NULL DEFAULT 0,
        "budgetMax"      decimal(10,2) NOT NULL DEFAULT 0,
        "budgetType"     jobs_budgettype_enum NOT NULL DEFAULT 'fixed',
        "location"       varchar NOT NULL,
        "latitude"       decimal(10,7),
        "longitude"      decimal(10,7),
        "county"         varchar,
        "status"         jobs_status_enum NOT NULL DEFAULT 'open',
        "isUrgent"       boolean NOT NULL DEFAULT false,
        "isFeatured"     boolean NOT NULL DEFAULT false,
        "deadline"       timestamptz,
        "closedAt"       timestamptz,
        "postedById"     varchar NOT NULL,
        "companyName"    varchar,
        "assignedAgentId" varchar,
        "applicantCount" int NOT NULL DEFAULT 0,
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        "updatedAt"      timestamptz NOT NULL DEFAULT now()
      )`);

    // job_skills junction
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "job_skills" (
        "jobId"   uuid REFERENCES "jobs"("id") ON DELETE CASCADE,
        "skillId" uuid REFERENCES "skills"("id") ON DELETE CASCADE,
        PRIMARY KEY ("jobId","skillId")
      )`);

    // job_applications
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "job_applications" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "jobId"      uuid REFERENCES "jobs"("id") ON DELETE CASCADE,
        "applicantId" varchar NOT NULL,
        "coverNote"  text,
        "status"     varchar NOT NULL DEFAULT 'pending',
        "appliedAt"  timestamptz NOT NULL DEFAULT now()
      )`);

    // worker_profiles
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "worker_profiles" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"           varchar,
        "agentId"          varchar,
        "bio"              text,
        "location"         varchar,
        "county"           varchar,
        "dateOfBirth"      date,
        "nationalIdNumber" varchar,
        "linkedinUrl"      varchar,
        "avatarUrl"        varchar,
        "workExperience"   text,
        "education"        text,
        "certifications"   text,
        "languages"        text,
        "portfolioUrls"    text,
        "isAvailable"      boolean NOT NULL DEFAULT true,
        "availabilityNote" varchar,
        "dailyRate"        decimal(10,2),
        "hourlyRate"       decimal(10,2),
        "mpesaPhone"       varchar,
        "averageRating"    decimal(3,2) NOT NULL DEFAULT 0,
        "completedJobs"    int NOT NULL DEFAULT 0,
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now()
      )`);

    // worker_profile_skills junction
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "worker_profile_skills" (
        "workerProfileId" uuid REFERENCES "worker_profiles"("id") ON DELETE CASCADE,
        "skillId"         uuid REFERENCES "skills"("id") ON DELETE CASCADE,
        PRIMARY KEY ("workerProfileId","skillId")
      )`);

    // gps_logs
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "gps_logs" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "agentId"     uuid REFERENCES "agents"("id") ON DELETE CASCADE,
        "latitude"    decimal(10,7) NOT NULL,
        "longitude"   decimal(10,7) NOT NULL,
        "speed"       decimal(5,2),
        "accuracy"    decimal(5,2),
        "isFlagged"   boolean NOT NULL DEFAULT false,
        "flagReason"  varchar,
        "createdAt"   timestamptz NOT NULL DEFAULT now()
      )`);

    // wallets
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "wallets" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "agentId"        varchar NOT NULL UNIQUE,
        "balance"        decimal(12,2) NOT NULL DEFAULT 0,
        "pendingBalance" decimal(12,2) NOT NULL DEFAULT 0,
        "totalEarned"    decimal(12,2) NOT NULL DEFAULT 0,
        "totalWithdrawn" decimal(12,2) NOT NULL DEFAULT 0,
        "currency"       varchar NOT NULL DEFAULT 'KES',
        "mpesaPhone"     varchar,
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        "updatedAt"      timestamptz NOT NULL DEFAULT now()
      )`);

    // wallet_transactions
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "wallet_transactions" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "walletId"    uuid REFERENCES "wallets"("id"),
        "type"        wallet_transactions_type_enum NOT NULL,
        "amount"      decimal(12,2) NOT NULL,
        "description" varchar NOT NULL,
        "status"      wallet_transactions_status_enum NOT NULL DEFAULT 'pending',
        "reference"   varchar,
        "jobId"       varchar,
        "agentId"     varchar,
        "mpesaPhone"  varchar,
        "mpesaRef"    varchar,
        "createdAt"   timestamptz NOT NULL DEFAULT now()
      )`);

    // notifications
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"     varchar NOT NULL,
        "title"      varchar NOT NULL,
        "body"       text NOT NULL,
        "type"       notifications_type_enum NOT NULL DEFAULT 'system',
        "isRead"     boolean NOT NULL DEFAULT false,
        "actionId"   varchar,
        "actionType" varchar,
        "createdAt"  timestamptz NOT NULL DEFAULT now()
      )`);

    // verifications
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "verifications" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"         varchar NOT NULL UNIQUE,
        "status"         verifications_status_enum NOT NULL DEFAULT 'pending',
        "documentType"   verifications_documenttype_enum,
        "idFrontUrl"     varchar,
        "idBackUrl"      varchar,
        "selfieUrl"      varchar,
        "idNumber"       varchar,
        "fullNameOnId"   varchar,
        "dobOnId"        date,
        "reviewedBy"     varchar,
        "reviewNote"     varchar,
        "reviewedAt"     timestamptz,
        "faceMatchScore" decimal(5,2),
        "submittedAt"    timestamptz NOT NULL DEFAULT now(),
        "updatedAt"      timestamptz NOT NULL DEFAULT now()
      )`);

    // billing subscriptions
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "billing_subscriptions" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organisationId"   varchar NOT NULL UNIQUE,
        "plan"             billing_subscriptions_plan_enum NOT NULL DEFAULT 'free',
        "status"           billing_subscriptions_status_enum NOT NULL DEFAULT 'trial',
        "currentPeriodStart" timestamptz,
        "currentPeriodEnd"   timestamptz,
        "stripeSubscriptionId" varchar,
        "stripeCustomerId"     varchar,
        "cancelledAt"    timestamptz,
        "metadata"       text,
        "features"       text,
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        "updatedAt"      timestamptz NOT NULL DEFAULT now()
      )`);

    // billing invoices
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "billing_invoices" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "invoiceNumber"    varchar NOT NULL UNIQUE,
        "organisationId"   varchar NOT NULL,
        "plan"             billing_invoices_plan_enum,
        "amount"           decimal(12,2) NOT NULL,
        "currency"         varchar NOT NULL DEFAULT 'KES',
        "status"           billing_invoices_status_enum NOT NULL DEFAULT 'pending',
        "paymentMethod"    billing_invoices_paymentmethod_enum,
        "stkCheckoutId"    varchar,
        "stripePaymentId"  varchar,
        "paidAt"           timestamptz,
        "description"      varchar,
        "metadata"         text,
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now()
      )`);

    // chat messages
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversationId" varchar NOT NULL,
        "senderId"       varchar NOT NULL,
        "recipientId"    varchar NOT NULL,
        "organisationId" varchar,
        "taskId"         varchar,
        "body"           text NOT NULL,
        "attachmentUrl"  varchar,
        "attachmentType" varchar,
        "isRead"         boolean NOT NULL DEFAULT false,
        "readAt"         timestamptz,
        "messageType"    varchar NOT NULL DEFAULT 'text',
        "createdAt"      timestamptz NOT NULL DEFAULT now()
      )`);

    // chat conversations
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "chat_conversations" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversationId"   varchar NOT NULL UNIQUE,
        "participantA"     varchar NOT NULL,
        "participantB"     varchar NOT NULL,
        "organisationId"   varchar,
        "lastMessageBody"  varchar,
        "lastMessageAt"    timestamptz,
        "unreadCountA"     int NOT NULL DEFAULT 0,
        "unreadCountB"     int NOT NULL DEFAULT 0,
        "createdAt"        timestamptz NOT NULL DEFAULT now()
      )`);

    // ── Indexes ────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_users_org ON users("organisationId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_agents_org ON agents("organisationId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks("agentId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks("organisationId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_jobs_org ON jobs("postedById")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_gps_agent ON gps_logs("agentId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications("userId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_chat_conv ON chat_messages("conversationId", "createdAt")`);

    console.log('✅ InitialSchema migration complete');
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Drop in reverse dependency order
    const tables = [
      'chat_conversations','chat_messages','billing_invoices',
      'billing_subscriptions','verifications','notifications',
      'wallet_transactions','wallets','gps_logs',
      'worker_profile_skills','worker_profiles',
      'job_applications','job_skills','jobs',
      'tasks','agent_skills','skills','agents','users','organisations',
    ];
    for (const t of tables) {
      await qr.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    }
    const enums = [
      'users_role_enum','agents_status_enum','tasks_status_enum','tasks_priority_enum',
      'jobs_status_enum','jobs_budgettype_enum','verifications_status_enum',
      'verifications_documenttype_enum','billing_subscriptions_plan_enum',
      'billing_subscriptions_status_enum','billing_invoices_status_enum',
      'billing_invoices_paymentmethod_enum','wallet_transactions_type_enum',
      'wallet_transactions_status_enum','notifications_type_enum',
    ];
    for (const e of enums) {
      await qr.query(`DROP TYPE IF EXISTS "${e}"`);
    }
  }
}
