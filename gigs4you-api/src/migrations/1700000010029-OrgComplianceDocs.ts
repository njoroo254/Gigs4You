import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrgComplianceDocs1700000010029 implements MigrationInterface {
  name = 'OrgComplianceDocs1700000010029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organisations
        ADD COLUMN IF NOT EXISTS "kraDocUrl"            VARCHAR(1024),
        ADD COLUMN IF NOT EXISTS "businessRegDocUrl"    VARCHAR(1024),
        ADD COLUMN IF NOT EXISTS "taxComplianceDocUrl"  VARCHAR(1024)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organisations
        DROP COLUMN IF EXISTS "kraDocUrl",
        DROP COLUMN IF EXISTS "businessRegDocUrl",
        DROP COLUMN IF EXISTS "taxComplianceDocUrl"
    `);
  }
}
