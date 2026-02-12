# Database Migrations

This project uses TypeORM migrations to manage database schema changes.

## Running Migrations

### Run all pending migrations
```bash
npm run migration:run
```

### Revert the last migration
```bash
npm run migration:revert
```

### Show migration status
```bash
npm run migration:show
```

### Generate a new migration
```bash
npm run migration:generate src/migrations/YourMigrationName
```

## Testing pgvector

After running migrations, test the pgvector setup:

```bash
npm run test:vector
```

This will:
- Verify pgvector extension is enabled
- Check all tables exist
- Verify vector column and IVFFlat index
- Insert test data and perform a similarity search

## Manual Verification

### Check pgvector extension
```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### Test vector similarity query
```sql
-- Example: Find similar embeddings
SELECT 
  e.id,
  c.content,
  1 - (e.vector <=> '[0.1,0.2,0.3,...]'::vector) as cosine_similarity
FROM embeddings e
JOIN chunks c ON c.id = e.chunk_id
ORDER BY e.vector <=> '[0.1,0.2,0.3,...]'::vector
LIMIT 5;
```

## Schema Overview

- **sources**: Represents data sources (GitHub repos, docs, etc.)
- **documents**: Individual documents from sources
- **chunks**: Text chunks from documents (for RAG)
- **embeddings**: Vector embeddings for chunks (1536 dimensions, OpenAI ada-002 format)

## IVFFlat Index

The IVFFlat index is created for efficient vector similarity search. For optimal performance:
- Rebuild the index after bulk inserts: `REINDEX INDEX idx_embeddings_vector_ivfflat;`
- Adjust `lists` parameter based on your data size (default: 100)

