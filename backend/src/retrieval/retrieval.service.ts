import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embeddings/embedding.service';
import {
  VectorStoreService,
  SimilaritySearchResult,
} from '../vector-store/vector-store.service';

export interface RetrievalResult {
  query: string;
  chunks: RetrievedChunk[];
  context: string;
  metadata: {
    topK: number;
    totalChunks: number;
    avgSimilarity: number;
    minSimilarity: number;
    maxSimilarity: number;
  };
}

export interface RetrievedChunk {
  chunkId: string;
  content: string;
  documentId: string;
  documentTitle: string | null;
  sourceId: string;
  similarity: number;
  distance: number;
  metadata?: Record<string, any>;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStoreService: VectorStoreService,
  ) {}

  /**
   * Perform full RAG retrieval pipeline:
   * 1. Embed user query
   * 2. Fetch topK chunks using similarity search
   * 3. Format context block
   * 4. Return structured retrieval result with scoring
   *
   * @param query - The user query string
   * @param topK - Number of top chunks to retrieve (default: 10)
   * @param orgId - Organization ID for ACL filtering
   * @returns Promise resolving to structured retrieval result
   */
  async retrieve(
    query: string,
    orgId: string,
    topK: number = 10,
  ): Promise<RetrievalResult> {
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }
    if (!orgId) {
      throw new Error('orgId is required for ACL filtering');
    }
    if (topK <= 0) {
      throw new Error('topK must be greater than 0');
    }

    this.logger.log(`Starting retrieval for query: "${query.substring(0, 100)}..."`);

    // Step 1: Embed user query
    this.logger.debug('Step 1: Embedding user query...');
    const queryEmbedding = await this.embeddingService.embed(query);
    this.logger.debug(
      `Query embedding generated: ${queryEmbedding.length} dimensions`,
    );

    // Step 2: Fetch topK chunks using similarity search
    this.logger.debug(`Step 2: Fetching top ${topK} chunks...`);
    const searchResults = await this.vectorStoreService.similaritySearch(
      queryEmbedding,
      topK,
      orgId,
    );

    this.logger.log(
      `Retrieved ${searchResults.length} chunks for org ${orgId}`,
    );

    // Log scoring information for each chunk
    if (searchResults.length > 0) {
      this.logger.log('Retrieval scoring results:');
      searchResults.forEach((result, index) => {
        this.logger.log(
          `  [${index + 1}] Chunk ${result.chunkId.substring(0, 8)}... | ` +
            `Similarity: ${result.similarity.toFixed(4)} | ` +
            `Distance: ${result.distance.toFixed(4)} | ` +
            `Document: ${result.documentTitle || result.documentId.substring(0, 8)}...`,
        );
      });
    } else {
      this.logger.warn('No chunks retrieved for query');
    }

    // Step 3: Format context block
    this.logger.debug('Step 3: Formatting context block...');
    const context = this.formatContextBlock(searchResults);

    // Calculate metadata
    const similarities = searchResults.map((r) => r.similarity);
    const metadata = {
      topK,
      totalChunks: searchResults.length,
      avgSimilarity:
        similarities.length > 0
          ? similarities.reduce((a, b) => a + b, 0) / similarities.length
          : 0,
      minSimilarity:
        similarities.length > 0 ? Math.min(...similarities) : 0,
      maxSimilarity:
        similarities.length > 0 ? Math.max(...similarities) : 0,
    };

    this.logger.log(
      `Retrieval complete: ${metadata.totalChunks} chunks, ` +
        `avg similarity: ${metadata.avgSimilarity.toFixed(4)}, ` +
        `range: [${metadata.minSimilarity.toFixed(4)}, ${metadata.maxSimilarity.toFixed(4)}]`,
    );

    // Step 4: Return structured retrieval result
    return {
      query,
      chunks: searchResults.map((result) => ({
        chunkId: result.chunkId,
        content: result.content,
        documentId: result.documentId,
        documentTitle: result.documentTitle,
        sourceId: result.sourceId,
        similarity: result.similarity,
        distance: result.distance,
        metadata: result.metadata,
      })),
      context,
      metadata,
    };
  }

  /**
   * Format retrieved chunks into a context block for LLM consumption
   * @param chunks - Array of similarity search results
   * @returns Formatted context string
   */
  private formatContextBlock(chunks: SimilaritySearchResult[]): string {
    if (chunks.length === 0) {
      return '';
    }

    const contextParts = chunks.map((chunk, index) => {
      const title = chunk.documentTitle || `Document ${chunk.documentId.substring(0, 8)}`;
      const header = `[Chunk ${index + 1}] ${title} (Similarity: ${chunk.similarity.toFixed(4)})`;
      return `${header}\n${chunk.content}`;
    });

    return contextParts.join('\n\n---\n\n');
  }
}

