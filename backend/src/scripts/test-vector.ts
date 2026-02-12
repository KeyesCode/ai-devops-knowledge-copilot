/**
 * Test script to verify pgvector migration and vector similarity queries
 * Run with: npm run test:vector
 */

import { DataSource } from 'typeorm';
import dataSource from '../data-source';

async function testVectorOperations() {
  console.log('🚀 Starting pgvector test...\n');

  let connection: DataSource | null = null;

  try {
    // Initialize connection
    connection = await dataSource.initialize();
    console.log('✅ Database connection established\n');

    // Test 1: Verify pgvector extension is enabled
    console.log('📋 Test 1: Checking pgvector extension...');
    const extensionResult = await connection.query(
      `SELECT * FROM pg_extension WHERE extname = 'vector';`,
    );
    if (extensionResult.length > 0) {
      console.log('✅ pgvector extension is enabled');
      console.log(`   Version: ${extensionResult[0].extversion}\n`);
    } else {
      throw new Error('❌ pgvector extension not found');
    }

    // Test 2: Verify tables exist
    console.log('📋 Test 2: Verifying tables exist...');
    const tables = ['sources', 'documents', 'chunks', 'embeddings'];
    for (const table of tables) {
      const tableExists = await connection.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${table}'
        );
      `);
      if (tableExists[0].exists) {
        console.log(`✅ Table '${table}' exists`);
      } else {
        throw new Error(`❌ Table '${table}' not found`);
      }
    }
    console.log('');

    // Test 3: Verify vector column exists
    console.log('📋 Test 3: Verifying vector column...');
    const vectorColumn = await connection.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'embeddings' AND column_name = 'vector';
    `);
    if (vectorColumn.length > 0) {
      console.log('✅ Vector column exists');
      console.log(`   Type: ${vectorColumn[0].udt_name}\n`);
    } else {
      throw new Error('❌ Vector column not found');
    }

    // Test 4: Verify IVFFlat index exists
    console.log('📋 Test 4: Verifying IVFFlat index...');
    const indexResult = await connection.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'embeddings' AND indexname LIKE '%ivfflat%';
    `);
    if (indexResult.length > 0) {
      console.log('✅ IVFFlat index exists');
      console.log(`   Index: ${indexResult[0].indexname}\n`);
    } else {
      console.log('⚠️  IVFFlat index not found (may need data first)\n');
    }

    // Test 5: Insert test data and perform similarity search
    console.log('📋 Test 5: Inserting test data and testing vector similarity...');

    // Create a test source
    const sourceResult = await connection.query(`
      INSERT INTO sources (name, type, url, metadata)
      VALUES ('Test Source', 'test', 'https://example.com', '{"test": true}')
      RETURNING id;
    `);
    const sourceId = sourceResult[0].id;
    console.log(`✅ Created test source: ${sourceId}`);

    // Create a test document
    const docResult = await connection.query(`
      INSERT INTO documents (source_id, title, content, url)
      VALUES ($1, 'Test Document', 'This is a test document about AI and DevOps.', 'https://example.com/doc')
      RETURNING id;
    `, [sourceId]);
    const docId = docResult[0].id;
    console.log(`✅ Created test document: ${docId}`);

    // Create a test chunk
    const chunkResult = await connection.query(`
      INSERT INTO chunks (document_id, content, chunk_index)
      VALUES ($1, 'This is a test chunk about AI and DevOps.', 0)
      RETURNING id;
    `, [docId]);
    const chunkId = chunkResult[0].id;
    console.log(`✅ Created test chunk: ${chunkId}`);

    // Create a test embedding (1536-dimensional vector, OpenAI ada-002 format)
    // Using a simple test vector: [0.1, 0.2, 0.3, ...] normalized
    const testVector = Array.from({ length: 1536 }, (_, i) => (i + 1) * 0.001);
    const vectorString = `[${testVector.join(',')}]`;

    await connection.query(`
      INSERT INTO embeddings (chunk_id, vector, model)
      VALUES ($1, $2::vector, 'text-embedding-ada-002')
      ON CONFLICT (chunk_id) DO UPDATE SET vector = $2::vector;
    `, [chunkId, vectorString]);
    console.log(`✅ Created test embedding with 1536 dimensions`);

    // Create a query vector (slightly different)
    const queryVector = Array.from({ length: 1536 }, (_, i) => (i + 2) * 0.001);
    const queryVectorString = `[${queryVector.join(',')}]`;

    // Perform cosine similarity search
    const similarityResult = await connection.query(`
      SELECT 
        e.id,
        c.content,
        1 - (e.vector <=> $1::vector) as cosine_similarity,
        e.vector <=> $1::vector as distance
      FROM embeddings e
      JOIN chunks c ON c.id = e.chunk_id
      ORDER BY e.vector <=> $1::vector
      LIMIT 5;
    `, [queryVectorString]);

    console.log(`✅ Vector similarity query executed successfully`);
    console.log(`   Found ${similarityResult.length} result(s)`);
    if (similarityResult.length > 0) {
      console.log(`   Top result similarity: ${similarityResult[0].cosine_similarity}`);
      console.log(`   Distance: ${similarityResult[0].distance}`);
    }
    console.log('');

    // Cleanup test data
    console.log('🧹 Cleaning up test data...');
    await connection.query(`DELETE FROM sources WHERE id = $1;`, [sourceId]);
    console.log('✅ Test data cleaned up\n');

    console.log('🎉 All tests passed! pgvector is working correctly.');
    console.log('\n📸 Screenshot suggestions:');
    console.log('   1. Run: SELECT * FROM pg_extension WHERE extname = \'vector\';');
    console.log('   2. Run: SELECT 1 - (vector <=> \'[0.1,0.2,0.3,...]\'::vector) as similarity FROM embeddings LIMIT 1;');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    if (connection?.isInitialized) {
      await connection.destroy();
      console.log('✅ Database connection closed');
    }
  }
}

// Run the test
testVectorOperations().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

