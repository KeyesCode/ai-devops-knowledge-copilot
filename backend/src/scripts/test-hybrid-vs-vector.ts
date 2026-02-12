/**
 * Test script to compare BM25 hybrid search vs vector-only search
 * 
 * This script runs the same question with:
 * - hybridWeight = 0.5 (BM25 hybrid - equal weight)
 * - hybridWeight = 1.0 (Vector only)
 * 
 * Usage:
 *   npm run test:hybrid-vs-vector
 * 
 * Environment variables:
 *   - ORG_ID: Organization ID to use for testing (required)
 *   - QUESTION: Question to test (optional, defaults to example)
 *   - EXPECTED_ANSWER: Expected answer (optional, defaults to example)
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RetrievalService } from '../retrieval/retrieval.service';
import { LLMService } from '../llm/llm.service';

interface ComparisonResult {
  hybridWeight: number;
  method: string;
  chunks: any[];
  context: string;
  generatedAnswer: string;
  retrievalTime: number;
  generationTime: number;
  totalTime: number;
}

async function testHybridVsVector() {
  const orgId = process.env.ORG_ID;
  const question = process.env.QUESTION || 'What is the main purpose of this system?';
  const expectedAnswer = process.env.EXPECTED_ANSWER || 'The system is designed for multi-tenant secure RAG.';

  if (!orgId) {
    console.error('❌ Error: ORG_ID environment variable is required');
    console.log('\nUsage:');
    console.log('  ORG_ID=your-org-id npm run test:hybrid-vs-vector');
    console.log('  ORG_ID=your-org-id QUESTION="Your question" EXPECTED_ANSWER="Expected answer" npm run test:hybrid-vs-vector');
    process.exit(1);
  }

  console.log('🚀 Starting Hybrid vs Vector-Only Comparison Test\n');
  console.log(`📋 Question: ${question}`);
  console.log(`📋 Expected Answer: ${expectedAnswer}`);
  console.log(`📋 Organization ID: ${orgId}\n`);

  const app = await NestFactory.createApplicationContext(AppModule);
  const retrievalService = app.get(RetrievalService);
  const llmService = app.get(LLMService);

  const results: ComparisonResult[] = [];

  // Test configurations
  const testConfigs = [
    { hybridWeight: 0.5, method: 'BM25 Hybrid (equal weight)' },
    { hybridWeight: 1.0, method: 'Vector Only' },
  ];

  for (const config of testConfigs) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing: ${config.method} (hybridWeight=${config.hybridWeight})`);
    console.log('='.repeat(80));

    const startTime = Date.now();

    try {
      // Step 1: Run retrieval
      const retrievalStart = Date.now();
      const retrievalResult = await retrievalService.retrieve(
        question,
        orgId,
        20, // topK
        config.hybridWeight,
      );
      const retrievalTime = Date.now() - retrievalStart;

      console.log(`\n✅ Retrieval completed in ${retrievalTime}ms`);
      console.log(`   Retrieved ${retrievalResult.chunks.length} chunks`);
      console.log(`   Total chunks available: ${retrievalResult.metadata.totalChunks}`);

      // Display top chunks
      if (retrievalResult.chunks.length > 0) {
        console.log(`\n📄 Top 3 Retrieved Chunks:`);
        retrievalResult.chunks.slice(0, 3).forEach((chunk, idx) => {
          const similarity = chunk.similarity?.toFixed(4) || 'N/A';
          const vectorScore = chunk.metadata?.vectorScore?.toFixed(4) || 'N/A';
          const bm25Score = chunk.metadata?.bm25Score?.toFixed(4) || 'N/A';
          const hybridScore = chunk.metadata?.hybridScore?.toFixed(4) || 'N/A';
          
          console.log(`\n   Chunk ${idx + 1}:`);
          console.log(`     Similarity: ${similarity}`);
          if (config.hybridWeight === 0.5) {
            console.log(`     Vector Score: ${vectorScore}`);
            console.log(`     BM25 Score: ${bm25Score}`);
            console.log(`     Hybrid Score: ${hybridScore}`);
          }
          console.log(`     Source: ${chunk.sourceId}`);
          console.log(`     Document: ${chunk.documentTitle || 'N/A'}`);
          console.log(`     Content: ${chunk.content.substring(0, 150)}...`);
        });
      }

      // Step 2: Generate answer
      const generationStart = Date.now();
      const systemPrompt = buildSystemPrompt(retrievalResult.context);
      const messages = [
        {
          role: 'user' as const,
          content: question,
        },
      ];

      let generatedAnswer = '';
      for await (const chunk of llmService.streamChat(messages, systemPrompt)) {
        if (chunk.done) {
          break;
        }
        if (chunk.content) {
          generatedAnswer += chunk.content;
        }
      }
      generatedAnswer = generatedAnswer.trim();
      const generationTime = Date.now() - generationStart;

      const totalTime = Date.now() - startTime;

      console.log(`\n✅ Generation completed in ${generationTime}ms`);
      console.log(`\n📝 Generated Answer:`);
      console.log(`   ${generatedAnswer}`);

      results.push({
        hybridWeight: config.hybridWeight,
        method: config.method,
        chunks: retrievalResult.chunks,
        context: retrievalResult.context,
        generatedAnswer,
        retrievalTime,
        generationTime,
        totalTime,
      });

      console.log(`\n⏱️  Total time: ${totalTime}ms`);
    } catch (error) {
      console.error(`\n❌ Error testing ${config.method}:`, error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }

  // Comparison summary
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📊 COMPARISON SUMMARY');
  console.log('='.repeat(80));

  if (results.length === 2) {
    const hybrid = results[0];
    const vectorOnly = results[1];

    console.log(`\n🔍 Retrieval Comparison:`);
    console.log(`   Hybrid:      ${hybrid.chunks.length} chunks in ${hybrid.retrievalTime}ms`);
    console.log(`   Vector Only: ${vectorOnly.chunks.length} chunks in ${vectorOnly.retrievalTime}ms`);
    console.log(`   Difference:  ${vectorOnly.chunks.length - hybrid.chunks.length} chunks, ${vectorOnly.retrievalTime - hybrid.retrievalTime}ms`);

    console.log(`\n⏱️  Performance Comparison:`);
    console.log(`   Hybrid:      ${hybrid.totalTime}ms total`);
    console.log(`   Vector Only: ${vectorOnly.totalTime}ms total`);
    console.log(`   Difference:  ${vectorOnly.totalTime - hybrid.totalTime}ms`);

    console.log(`\n📝 Answer Comparison:`);
    console.log(`\n   Hybrid Answer:`);
    console.log(`   ${hybrid.generatedAnswer.substring(0, 200)}${hybrid.generatedAnswer.length > 200 ? '...' : ''}`);
    console.log(`\n   Vector Only Answer:`);
    console.log(`   ${vectorOnly.generatedAnswer.substring(0, 200)}${vectorOnly.generatedAnswer.length > 200 ? '...' : ''}`);

    // Check for unique chunks
    const hybridChunkIds = new Set(hybrid.chunks.map(c => c.chunkId));
    const vectorChunkIds = new Set(vectorOnly.chunks.map(c => c.chunkId));
    
    const onlyInHybrid = hybrid.chunks.filter(c => !vectorChunkIds.has(c.chunkId));
    const onlyInVector = vectorOnly.chunks.filter(c => !hybridChunkIds.has(c.chunkId));
    const inBoth = hybrid.chunks.filter(c => vectorChunkIds.has(c.chunkId));

    console.log(`\n📊 Chunk Overlap Analysis:`);
    console.log(`   Chunks in both: ${inBoth.length}`);
    console.log(`   Only in Hybrid: ${onlyInHybrid.length}`);
    console.log(`   Only in Vector: ${onlyInVector.length}`);

    if (onlyInHybrid.length > 0) {
      console.log(`\n   Chunks only retrieved by Hybrid:`);
      onlyInHybrid.slice(0, 3).forEach((chunk, idx) => {
        console.log(`     ${idx + 1}. ${chunk.documentTitle || 'N/A'} - ${chunk.content.substring(0, 100)}...`);
      });
    }

    if (onlyInVector.length > 0) {
      console.log(`\n   Chunks only retrieved by Vector:`);
      onlyInVector.slice(0, 3).forEach((chunk, idx) => {
        console.log(`     ${idx + 1}. ${chunk.documentTitle || 'N/A'} - ${chunk.content.substring(0, 100)}...`);
      });
    }
  }

  await app.close();
  console.log(`\n✅ Test completed!\n`);
  process.exit(0);
}

function buildSystemPrompt(context: string): string {
  return `You are a helpful assistant that answers questions based EXCLUSIVELY on the provided context.

CRITICAL: You MUST use ONLY the information provided in the context below. Do NOT use any external knowledge or information not present in the context. If the context doesn't contain enough information to fully answer the question, explicitly state what information is missing.

Context:
${context}

Instructions:
- Answer the question based EXCLUSIVELY on the context provided above
- Do NOT use any information outside of the provided context
- If the context doesn't contain enough information, explicitly say so
- Be concise and accurate
- Cite specific parts of the context when relevant`;
}

testHybridVsVector().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

