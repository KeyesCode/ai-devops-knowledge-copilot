import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEvalRunsSchema1735900000000 implements MigrationInterface {
  name = 'CreateEvalRunsSchema1735900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create eval_runs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS eval_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        eval_set_id UUID NOT NULL REFERENCES eval_sets(id) ON DELETE CASCADE,
        org_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        total_questions INTEGER NOT NULL DEFAULT 0,
        completed_questions INTEGER NOT NULL DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT check_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
      );
    `);

    // Create eval_results table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS eval_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        eval_run_id UUID NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
        eval_question_id UUID NOT NULL REFERENCES eval_questions(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        expected_answer TEXT NOT NULL,
        retrieved_chunks JSONB NOT NULL DEFAULT '[]',
        generated_answer TEXT NOT NULL,
        context_used TEXT NOT NULL,
        faithfulness_score DECIMAL(3,2),
        faithfulness_reasoning TEXT,
        context_recall_score DECIMAL(3,2),
        context_recall_reasoning TEXT,
        context_precision_score DECIMAL(3,2),
        context_precision_reasoning TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for better query performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eval_runs_eval_set_id ON eval_runs(eval_set_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eval_runs_org_id ON eval_runs(org_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eval_runs_status ON eval_runs(status);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eval_results_eval_run_id ON eval_results(eval_run_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_eval_results_eval_question_id ON eval_results(eval_question_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_eval_results_eval_question_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_eval_results_eval_run_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_eval_runs_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_eval_runs_org_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_eval_runs_eval_set_id;`);

    // Drop tables in reverse order (respecting foreign keys)
    await queryRunner.query(`DROP TABLE IF EXISTS eval_results;`);
    await queryRunner.query(`DROP TABLE IF EXISTS eval_runs;`);
  }
}

