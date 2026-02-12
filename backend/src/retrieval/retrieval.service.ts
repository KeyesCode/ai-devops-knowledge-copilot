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
   * @param topK - Number of top chunks to retrieve (default: 20)
   * @param orgId - Organization ID for ACL filtering
   * @returns Promise resolving to structured retrieval result
   */
  async retrieve(
    query: string,
    orgId: string,
    topK: number = 20,
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

    // Step 1: Expand query with synonyms and related terms for better semantic matching
    const expandedQuery = this.expandQuery(query);
    this.logger.debug(`Expanded query: "${expandedQuery}"`);

    // Step 2: Embed expanded query
    this.logger.debug('Step 2: Embedding expanded query...');
    const queryEmbedding = await this.embeddingService.embed(expandedQuery);
    this.logger.debug(
      `Query embedding generated: ${queryEmbedding.length} dimensions`,
    );

    // Step 3: Fetch topK chunks using similarity search
    // Fetch more chunks than needed to allow for re-ranking with metadata boosting
    const fetchK = Math.min(topK * 2, 50); // Fetch up to 2x or 50, whichever is smaller
    this.logger.debug(`Step 2: Fetching top ${fetchK} chunks for re-ranking...`);
    const searchResults = await this.vectorStoreService.similaritySearch(
      queryEmbedding,
      fetchK,
      orgId,
    );

    this.logger.log(
      `Retrieved ${searchResults.length} chunks for org ${orgId}`,
    );

    // Step 2.5: Apply metadata-based boosting and re-rank
    const boostedResults = this.applyMetadataBoosting(searchResults);
    
    // Take top K after boosting
    const topResults = boostedResults.slice(0, topK);

    // Log scoring information for each chunk
    if (topResults.length > 0) {
      this.logger.log('Retrieval scoring results (after boosting):');
      topResults.forEach((result, index) => {
        const boostInfo = result.metadata?.boostApplied 
          ? ` | Boost: +${result.metadata.boostApplied.toFixed(3)}` 
          : '';
        this.logger.log(
          `  [${index + 1}] Chunk ${result.chunkId.substring(0, 8)}... | ` +
            `Similarity: ${result.similarity.toFixed(4)}${boostInfo} | ` +
            `Distance: ${result.distance.toFixed(4)} | ` +
            `Document: ${result.documentTitle || result.documentId.substring(0, 8)}...`,
        );
      });
    } else {
      this.logger.warn('No chunks retrieved for query');
    }

    // Step 4: Format context block
    this.logger.debug('Step 3: Formatting context block...');
    const context = this.formatContextBlock(topResults);

    // Calculate metadata
    const similarities = topResults.map((r) => r.similarity);
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

    // Step 5: Return structured retrieval result
    return {
      query,
      chunks: topResults.map((result) => ({
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
   * Expand query with synonyms and related terms to improve semantic matching
   * @param query - Original user query
   * @returns Expanded query with additional context
   */
  private expandQuery(query: string): string {
    const lowerQuery = query.toLowerCase();
    const expansions: string[] = [query]; // Always include original query

    // Project name expansions
    if (lowerQuery.includes('ai devops knowledge copilot') || 
        lowerQuery.includes('devops knowledge copilot') ||
        lowerQuery.includes('knowledge copilot')) {
      expansions.push('project', 'system', 'application', 'platform');
      if (lowerQuery.includes('about') || lowerQuery.includes('what is')) {
        expansions.push('description', 'overview', 'introduction', 'purpose');
      }
    }

    // Security-related expansions
    if (lowerQuery.includes('security') || lowerQuery.includes('defense')) {
      expansions.push('authentication', 'authorization', 'access control', 'isolation');
      if (lowerQuery.includes('depth')) {
        expansions.push('layers', 'multi-layer', 'defense in depth');
      }
    }

    // Multi-tenant expansions
    if (lowerQuery.includes('multi-tenant') || lowerQuery.includes('tenant')) {
      expansions.push('organization', 'org', 'isolation', 'scoped');
    }

    // Retrieval/RAG expansions
    if (lowerQuery.includes('retrieval') || lowerQuery.includes('rag')) {
      expansions.push('vector search', 'similarity search', 'embedding', 'semantic search');
    }

    // Role/permission expansions
    if (lowerQuery.includes('role') || lowerQuery.includes('permission')) {
      expansions.push('admin', 'user', 'access', 'privilege');
    }

    // Embedding/LLM expansions
    if (lowerQuery.includes('embedding') || lowerQuery.includes('llm')) {
      expansions.push('openai', 'ollama', 'model', 'provider');
    }

    // Database/vector store expansions
    if (lowerQuery.includes('database') || lowerQuery.includes('vector')) {
      expansions.push('postgresql', 'pgvector', 'postgres', 'vector store');
    }

    // Setup/installation expansions
    if (lowerQuery.includes('setup') || lowerQuery.includes('install') || 
        lowerQuery.includes('first time')) {
      expansions.push('getting started', 'installation', 'configuration', 'prerequisites');
    }

    // Combine expansions, removing duplicates while preserving order
    const uniqueExpansions = Array.from(new Set(expansions));
    return uniqueExpansions.join(' ');
  }

  /**
   * Apply metadata-based boosting to prioritize important documents and chunks
   * - Boosts README.md and README files significantly
   * - Boosts early chunks (chunkIndex 0-2) which often contain project descriptions
   * - Boosts documentation files
   * @param chunks - Array of similarity search results
   * @returns Re-ranked array with boosted similarity scores
   */
  private applyMetadataBoosting(
    chunks: SimilaritySearchResult[],
  ): SimilaritySearchResult[] {
    const BOOST_README = 0.15; // Significant boost for README files
    const BOOST_EARLY_CHUNK = 0.08; // Boost for early chunks (project descriptions)
    const BOOST_DOCS = 0.05; // Small boost for documentation files

    return chunks
      .map((chunk) => {
        let boost = 0;
        const metadata = chunk.metadata || {};
        const documentTitle = (chunk.documentTitle || '').toLowerCase();
        const filePath = (metadata.filePath || '').toLowerCase();

        // Boost README.md and README files significantly
        if (
          documentTitle === 'readme.md' ||
          filePath === 'readme.md' ||
          filePath.endsWith('/readme.md') ||
          documentTitle.includes('readme')
        ) {
          boost += BOOST_README;
          this.logger.debug(
            `Boosting README.md chunk: ${chunk.chunkId.substring(0, 8)}... (+${BOOST_README})`,
          );
        }

        // Boost early chunks (likely to contain project descriptions)
        const chunkIndex = metadata.chunkIndex;
        if (chunkIndex !== undefined && chunkIndex <= 2) {
          boost += BOOST_EARLY_CHUNK;
          this.logger.debug(
            `Boosting early chunk (index ${chunkIndex}): ${chunk.chunkId.substring(0, 8)}... (+${BOOST_EARLY_CHUNK})`,
          );
        }

        // Boost documentation files (docs/, .md files in root)
        if (
          filePath.includes('/docs/') ||
          (filePath.endsWith('.md') && !filePath.includes('/src/'))
        ) {
          boost += BOOST_DOCS;
        }

        // Apply boost to similarity score
        const boostedSimilarity = Math.min(1.0, chunk.similarity + boost);

        return {
          ...chunk,
          similarity: boostedSimilarity,
          distance: 1 - boostedSimilarity, // Update distance to match
          metadata: {
            ...metadata,
            boostApplied: boost,
            originalSimilarity: chunk.similarity,
          },
        };
      })
      .sort((a, b) => b.similarity - a.similarity); // Re-sort by boosted similarity
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

