import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrgIdToSources1735690100000 implements MigrationInterface {
  name = 'AddOrgIdToSources1735690100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add org_id column to sources table
    await queryRunner.query(`
      ALTER TABLE sources 
      ADD COLUMN IF NOT EXISTS org_id VARCHAR(255);
    `);

    // Create index for better query performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sources_org_id ON sources(org_id);
    `);

    // For existing data, set a default org_id if needed
    // This allows the system to work with existing data
    await queryRunner.query(`
      UPDATE sources 
      SET org_id = 'default-org-id' 
      WHERE org_id IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sources_org_id;`);

    // Drop column
    await queryRunner.query(`ALTER TABLE sources DROP COLUMN IF EXISTS org_id;`);
  }
}

