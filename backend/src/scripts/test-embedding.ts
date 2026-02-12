/**
 * Test script for EmbeddingService
 * 
 * Usage:
 *   npm run test:embedding
 * 
 * Make sure to set the appropriate environment variables:
 *   - EMBEDDING_PROVIDER=openai or ollama
 *   - OPENAI_API_KEY (if using OpenAI)
 *   - OLLAMA_BASE_URL (if using Ollama, defaults to http://localhost:11434)
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { EmbeddingService } from '../embeddings/embedding.service';

async function testEmbedding() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const embeddingService = app.get(EmbeddingService);

  const testTexts = [
    'Hello, world!',
    'This is a test of the embedding service.',
    'The quick brown fox jumps over the lazy dog.',
  ];

  console.log('Testing EmbeddingService...\n');

  for (const text of testTexts) {
    console.log(`Text: "${text}"`);
    
    try {
      const startTime = Date.now();
      const embedding = await embeddingService.embed(text);
      const duration = Date.now() - startTime;

      console.log(`  ✓ Embedding generated in ${duration}ms`);
      console.log(`  ✓ Vector dimension: ${embedding.length}`);
      console.log(`  ✓ First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
      
      // Test cache hit
      const cacheStartTime = Date.now();
      const cachedEmbedding = await embeddingService.embed(text);
      const cacheDuration = Date.now() - cacheStartTime;
      
      console.log(`  ✓ Cache hit in ${cacheDuration}ms (should be much faster)`);
      console.log(`  ✓ Vectors match: ${JSON.stringify(embedding) === JSON.stringify(cachedEmbedding)}`);
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
    }
    
    console.log('');
  }

  await app.close();
  console.log('Test completed!');
  process.exit(0);
}

testEmbedding().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

