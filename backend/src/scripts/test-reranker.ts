/**
 * Test script for cross-encoder reranker
 * 
 * Usage:
 *   npm run test:reranker
 * 
 * Or with environment variables:
 *   ORG_ID=your-org-id npm run test:reranker
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RetrievalService } from '../retrieval/retrieval.service';
import { RerankerService } from '../retrieval/reranker.service';

async function testReranker() {
  console.log('🧪 Testing Cross-Encoder Reranker\n');
  console.log('='.repeat(80));

  // Get orgId from environment or use default
  const orgId = process.env.ORG_ID || 'test-org-id';
  if (!orgId || orgId === 'test-org-id') {
    console.warn('⚠️  Warning: Using default orgId. Set ORG_ID env var for real testing.\n');
  }

  // Initialize NestJS app
  const app = await NestFactory.createApplicationContext(AppModule);
  const retrievalService = app.get(RetrievalService);
  const rerankerService = app.get(RerankerService);

  // Test 1: Check if reranker is enabled and loaded
  console.log('\n📋 Test 1: Reranker Status Check');
  console.log('-'.repeat(80));
  const isEnabled = rerankerService.isEnabled();
  console.log(`Reranker Enabled: ${isEnabled ? '✅ YES' : '❌ NO'}`);
  
  if (!isEnabled) {
    console.log('\n⚠️  Reranker is not enabled or failed to load.');
    console.log('   Check your .env file:');
    console.log('   - RERANKER_ENABLED=true');
    console.log('   - RERANKER_MODEL=Xenova/ms-marco-MiniLM-L-6-v2');
    console.log('\n   The system will continue without reranking.');
    await app.close();
    return;
  }

  console.log('✅ Reranker is loaded and ready!\n');

  // Test 2: Test retrieval with reranking
  console.log('📋 Test 2: Retrieval with Reranking');
  console.log('-'.repeat(80));

  const testQueries = [
    'How do I deploy an application?',
    'What is the authentication system?',
    'How does the vector search work?',
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 Query: "${query}"`);
    console.log('-'.repeat(80));

    try {
      const startTime = Date.now();
      const retrievalResult = await retrievalService.retrieve(query, orgId, 10);
      const retrievalTime = Date.now() - startTime;

      console.log(`\n✅ Retrieval completed in ${retrievalTime}ms`);
      console.log(`   Retrieved ${retrievalResult.chunks.length} chunks`);
      console.log(`   Total candidates: ${retrievalResult.metadata.totalChunks}`);

      if (retrievalResult.chunks.length === 0) {
        console.log('   ⚠️  No chunks retrieved. Make sure you have indexed some documents.');
        continue;
      }

      // Display top chunks with rerank information
      console.log(`\n📊 Top ${Math.min(5, retrievalResult.chunks.length)} Results (after reranking):`);
      retrievalResult.chunks.slice(0, 5).forEach((chunk, idx) => {
        const similarity = chunk.similarity?.toFixed(4) || 'N/A';
        const rerankScore = chunk.metadata?.rerankScore?.toFixed(4) || 'N/A';
        const originalRank = chunk.metadata?.originalRank !== undefined 
          ? `#${chunk.metadata.originalRank + 1}` 
          : 'N/A';
        const originalSimilarity = chunk.metadata?.originalSimilarity?.toFixed(4) || 'N/A';
        const boostApplied = chunk.metadata?.boostApplied?.toFixed(4) || '0.0000';

        console.log(`\n   ${idx + 1}. Rank #${idx + 1} (Original: ${originalRank})`);
        console.log(`      Final Similarity: ${similarity}`);
        if (rerankScore !== 'N/A') {
          console.log(`      Rerank Score: ${rerankScore}`);
        }
        if (originalSimilarity !== 'N/A' && originalSimilarity !== similarity) {
          console.log(`      Original Similarity: ${originalSimilarity}`);
          console.log(`      Boost Applied: +${boostApplied}`);
        }
        console.log(`      Document: ${chunk.documentTitle || chunk.documentId.substring(0, 8)}...`);
        console.log(`      Content: ${chunk.content.substring(0, 100)}...`);
      });

      // Show reranking impact
      const chunksWithRerank = retrievalResult.chunks.filter(
        (c) => c.metadata?.rerankScore !== undefined
      );
      if (chunksWithRerank.length > 0) {
        const rerankScores = chunksWithRerank.map((c) => c.metadata!.rerankScore!);
        const minRerank = Math.min(...rerankScores).toFixed(4);
        const maxRerank = Math.max(...rerankScores).toFixed(4);
        const avgRerank = (rerankScores.reduce((a, b) => a + b, 0) / rerankScores.length).toFixed(4);
        
        console.log(`\n📈 Reranking Statistics:`);
        console.log(`   Reranked chunks: ${chunksWithRerank.length}`);
        console.log(`   Rerank score range: [${minRerank}, ${maxRerank}]`);
        console.log(`   Average rerank score: ${avgRerank}`);
      }

    } catch (error) {
      console.error(`\n❌ Error during retrieval:`, error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }

  // Test 3: Compare with and without reranking (if possible)
  console.log('\n\n📋 Test 3: Reranking Impact Analysis');
  console.log('-'.repeat(80));
  console.log('\n💡 To see reranking impact:');
  console.log('   1. Run a query with RERANKER_ENABLED=true');
  console.log('   2. Note the chunk order and scores');
  console.log('   3. Set RERANKER_ENABLED=false and run the same query');
  console.log('   4. Compare the chunk order - reranking should improve relevance');

  console.log('\n' + '='.repeat(80));
  console.log('✅ Reranker testing complete!\n');

  await app.close();
}

// Run the test
testReranker().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

