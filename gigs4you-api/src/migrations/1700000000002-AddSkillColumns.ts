import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkillColumns1700000000002 implements MigrationInterface {
  name = 'AddSkillColumns1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "description" varchar`);
    await queryRunner.query(`ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "iconCode" varchar`);
    await queryRunner.query(`ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "colorIndex" integer DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "isActive" boolean DEFAULT true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN "description"`);
    await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN "iconCode"`);
    await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN "colorIndex"`);
    await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN "isActive"`);
  }
}
