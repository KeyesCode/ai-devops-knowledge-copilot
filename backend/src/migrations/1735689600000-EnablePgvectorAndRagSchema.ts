import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePgvectorAndRagSchema1735689600000
  implements MigrationInterface
{
  name = 'EnablePgvectorAndRagSchema1735689600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgvector extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

    // Create sources table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        url TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create documents table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        title VARCHAR(500),
        content TEXT NOT NULL,
        url TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create chunks table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(document_id, chunk_index)
      );
    `);

    // Create embeddings table with vector column
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
        vector vector(1536) NOT NULL,
        model VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chunk_id)
      );
    `);

    // Create indexes for better query performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_source_id ON documents(source_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings(chunk_id);
    `);

    // Create IVFFlat index for vector similarity search
    // Note: IVFFlat requires at least some data to be effective
    // The index will be created but may need to be rebuilt after data is inserted
    // For empty tables, this will create the index structure
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_vector_ivfflat 
      ON embeddings 
      USING ivfflat (vector vector_cosine_ops)
      WITH (lists = 100);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`DROP INDEX IF EXISTS idx_embeddings_vector_ivfflat;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_embeddings_chunk_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chunks_document_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_documents_source_id;`);

    // Drop tables in reverse order (respecting foreign keys)
    await queryRunner.query(`DROP TABLE IF EXISTS embeddings;`);
    await queryRunner.query(`DROP TABLE IF EXISTS chunks;`);
    await queryRunner.query(`DROP TABLE IF EXISTS documents;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sources;`);

    // Note: We don't drop the vector extension as it might be used by other tables
    // If you want to drop it: await queryRunner.query(`DROP EXTENSION IF EXISTS vector;`);
  }
}

