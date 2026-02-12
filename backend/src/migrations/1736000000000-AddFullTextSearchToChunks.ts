import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFullTextSearchToChunks1736000000000
  implements MigrationInterface
{
  name = 'AddFullTextSearchToChunks1736000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add tsvector column to chunks table for full-text search
    await queryRunner.query(`
      ALTER TABLE chunks 
      ADD COLUMN IF NOT EXISTS content_tsvector tsvector;
    `);

    // Create GIN index on tsvector column for fast full-text search
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_content_tsvector 
      ON chunks 
      USING GIN (content_tsvector);
    `);

    // Create function to automatically update tsvector when content changes
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_chunks_tsvector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.content_tsvector := to_tsvector('english', COALESCE(NEW.content, ''));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to automatically update tsvector on insert/update
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_update_chunks_tsvector ON chunks;
      CREATE TRIGGER trigger_update_chunks_tsvector
      BEFORE INSERT OR UPDATE OF content ON chunks
      FOR EACH ROW
      EXECUTE FUNCTION update_chunks_tsvector();
    `);

    // Populate tsvector for existing chunks
    await queryRunner.query(`
      UPDATE chunks 
      SET content_tsvector = to_tsvector('english', COALESCE(content, ''))
      WHERE content_tsvector IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop trigger
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_update_chunks_tsvector ON chunks;
    `);

    // Drop function
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS update_chunks_tsvector();
    `);

    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_chunks_content_tsvector;
    `);

    // Drop column
    await queryRunner.query(`
      ALTER TABLE chunks 
      DROP COLUMN IF EXISTS content_tsvector;
    `);
  }
}

