import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatGroups1700000010018 implements MigrationInterface {
  name = 'AddChatGroups1700000010018';

  async up(qr: QueryRunner): Promise<void> {
    // ── Groups ──────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "chat_groups" (
        "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
        "name"           VARCHAR      NOT NULL,
        "createdBy"      UUID         NOT NULL,
        "organisationId" UUID         NULL,
        "description"    TEXT         NULL,
        "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_groups" PRIMARY KEY ("id")
      );
    `);

    // ── Group members ────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "chat_group_members" (
        "id"       UUID         NOT NULL DEFAULT gen_random_uuid(),
        "groupId"  UUID         NOT NULL,
        "userId"   UUID         NOT NULL,
        "isAdmin"  BOOLEAN      NOT NULL DEFAULT false,
        "joinedAt" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_group_members"         PRIMARY KEY ("id"),
        CONSTRAINT "UQ_chat_group_members_pair"    UNIQUE ("groupId", "userId")
      );
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_group_members_groupId"
        ON "chat_group_members" ("groupId");
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_group_members_userId"
        ON "chat_group_members" ("userId");
    `);

    // ── Group messages ───────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "chat_group_messages" (
        "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
        "groupId"        UUID         NOT NULL,
        "senderId"       UUID         NOT NULL,
        "body"           TEXT         NOT NULL,
        "attachmentUrl"  VARCHAR      NULL,
        "attachmentType" VARCHAR      NULL,
        "messageType"    VARCHAR      NOT NULL DEFAULT 'text',
        "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_group_messages" PRIMARY KEY ("id")
      );
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_group_messages_groupId_createdAt"
        ON "chat_group_messages" ("groupId", "createdAt");
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS "chat_group_messages";`);
    await qr.query(`DROP TABLE IF EXISTS "chat_group_members";`);
    await qr.query(`DROP TABLE IF EXISTS "chat_groups";`);
  }
}
