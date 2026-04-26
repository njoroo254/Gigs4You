import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrgBranches1700000000009 implements MigrationInterface {
  name = 'AddOrgBranches1700000000009';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "parentId"   uuid`);
    await qr.query(`ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "branchName" varchar`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_org_parent ON organisations("parentId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_org_parent`);
    await qr.query(`ALTER TABLE "organisations" DROP COLUMN IF EXISTS "branchName"`);
    await qr.query(`ALTER TABLE "organisations" DROP COLUMN IF EXISTS "parentId"`);
  }
}
