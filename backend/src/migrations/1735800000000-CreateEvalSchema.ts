import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEvalSchema1735800000000 implements MigrationInterface {
  name = 'CreateEvalSchema1735800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create eval_sets table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS eval_sets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        org_id VARCHAR(255) NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create eval_questions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS eval_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        eval_set_id UUID NOT NULL REFERENCES eval_sets(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        expected_answer TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add scoped_sources array column to eval_sets for scoped source filtering
    await queryRunner.query(`
      ALTER TABLE eval_sets 
      ADD COLUMN IF NOT EXISTS scoped_sources UUID[];
    `);

    // Create indexes for better query performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eval_sets_org_id ON eval_sets(org_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eval_sets_name ON eval_sets(name);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eval_questions_eval_set_id ON eval_questions(eval_set_id);
    `);

    // Create GIN index for array column to enable efficient array queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eval_sets_scoped_sources ON eval_sets USING GIN(scoped_sources);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_eval_sets_scoped_sources;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_eval_questions_eval_set_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_eval_sets_name;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_eval_sets_org_id;`);

    // Drop column
    await queryRunner.query(`ALTER TABLE eval_sets DROP COLUMN IF EXISTS scoped_sources;`);

    // Drop tables in reverse order (respecting foreign keys)
    await queryRunner.query(`DROP TABLE IF EXISTS eval_questions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS eval_sets;`);
  }
}

