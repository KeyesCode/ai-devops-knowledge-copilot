import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embeddings/embedding.service';
import {
  VectorStoreService,
  SimilaritySearchResult,
} from '../vector-store/vector-store.service';
import { BM25SearchService } from '../vector-store/bm25-search.service';
import { RerankerService } from './reranker.service';

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
    private readonly bm25SearchService: BM25SearchService,
    private readonly rerankerService: RerankerService,
  ) {}

  /**
   * Perform full RAG retrieval pipeline with hybrid search (BM25 + Vector) + Cross-Encoder Reranking:
   * 1. Embed user query
   * 2. Perform both BM25 (keyword) and Vector (semantic) search in parallel
   * 3. Combine and normalize scores from both methods
   * 4. Apply metadata-based boosting
   * 5. Rerank results using cross-encoder model (if enabled)
   * 6. Format context block
   * 7. Return structured retrieval result with scoring
   *
   * @param query - The user query string
   * @param topK - Number of top chunks to retrieve (default: 20)
   * @param orgId - Organization ID for ACL filtering
   * @param hybridWeight - Weight for hybrid search (0.0 = BM25 only, 1.0 = Vector only, 0.5 = equal weight)
   * @returns Promise resolving to structured retrieval result
   */
  async retrieve(
    query: string,
    orgId: string,
    topK: number = 20,
    hybridWeight: number = 0.5,
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
    if (hybridWeight < 0 || hybridWeight > 1) {
      throw new Error('hybridWeight must be between 0 and 1');
    }

    this.logger.log(
      `Starting hybrid retrieval for query: "${query.substring(0, 100)}..." (weight: ${hybridWeight})`,
    );

    // Step 1: Expand query with synonyms and related terms for better semantic matching
    const expandedQuery = this.expandQuery(query);
    this.logger.debug(`Expanded query: "${expandedQuery}"`);

    // Step 2: Perform both BM25 and Vector search in parallel
    // Fetch more chunks than needed to allow for re-ranking with metadata boosting
    // For reranking to be effective, we need more candidates (reranking works best with 50-100 candidates)
    const fetchK = Math.min(topK * 4, 80); // Fetch up to 4x or 80, whichever is smaller
    this.logger.debug(`Fetching top ${fetchK} chunks from both search methods...`);

    // Parallel execution of BM25 and Vector search
    const [vectorResults, bm25Results] = await Promise.all([
      // Vector search: Embed expanded query and search
      (async () => {
        this.logger.debug('Performing vector similarity search...');
        const queryEmbedding = await this.embeddingService.embed(expandedQuery);
        this.logger.debug(
          `Query embedding generated: ${queryEmbedding.length} dimensions`,
        );
        return this.vectorStoreService.similaritySearch(
          queryEmbedding,
          fetchK,
          orgId,
        );
      })(),
      // BM25 search: Keyword-based search
      (async () => {
        this.logger.debug('Performing BM25 keyword search...');
        const bm25Results = await this.bm25SearchService.bm25Search(
          query,
          fetchK,
          orgId,
        );
        // Convert BM25 results to SimilaritySearchResult format
        return this.bm25SearchService.convertToSimilarityResults(bm25Results);
      })(),
    ]);

    this.logger.log(
      `Vector search: ${vectorResults.length} results, BM25 search: ${bm25Results.length} results`,
    );

    // Step 3: Combine results using hybrid scoring
    const hybridResults = this.combineHybridResults(
      vectorResults,
      bm25Results,
      hybridWeight,
    );

    this.logger.log(
      `Hybrid search combined ${hybridResults.length} unique chunks`,
    );

    // Step 4: Apply metadata-based boosting and re-rank
    const boostedResults = this.applyMetadataBoosting(hybridResults);

    // Step 5: Rerank using cross-encoder (if enabled)
    // Fetch more candidates for reranking to get better results
    const rerankCandidates = boostedResults.slice(0, Math.min(topK * 2, boostedResults.length));
    const rerankedResults = await this.rerankerService.rerank(
      query,
      rerankCandidates,
      topK,
    );

    // Take top K after reranking
    const topResults = rerankedResults;

    // Log scoring information for each chunk
    if (topResults.length > 0) {
      const rerankerEnabled = this.rerankerService.isEnabled();
      this.logger.log(
        `Hybrid retrieval scoring results (after ${rerankerEnabled ? 'reranking' : 'boosting'}):`,
      );
      topResults.forEach((result, index) => {
        const boostInfo = result.metadata?.boostApplied
          ? ` | Boost: +${result.metadata.boostApplied.toFixed(3)}`
          : '';
        const vectorScore = result.metadata?.vectorScore
          ? ` | Vector: ${result.metadata.vectorScore.toFixed(4)}`
          : '';
        const bm25Score = result.metadata?.bm25Score
          ? ` | BM25: ${result.metadata.bm25Score.toFixed(4)}`
          : '';
        const rerankInfo = result.metadata?.rerankScore
          ? ` | Rerank: ${result.metadata.rerankScore.toFixed(4)}`
          : '';
        const originalRankInfo =
          result.metadata?.originalRank !== undefined
            ? ` | Original Rank: ${result.metadata.originalRank + 1}`
            : '';
        this.logger.log(
          `  [${index + 1}] Chunk ${result.chunkId.substring(0, 8)}... | ` +
            `Final: ${result.similarity.toFixed(4)}${vectorScore}${bm25Score}${boostInfo}${rerankInfo}${originalRankInfo} | ` +
            `Document: ${result.documentTitle || result.documentId.substring(0, 8)}...`,
        );
      });
    } else {
      this.logger.warn('No chunks retrieved for query');
    }

    // Step 6: Format context block
    this.logger.debug('Formatting context block...');
    const context = this.formatContextBlock(topResults);

    // Calculate metadata
    const similarities = topResults.map((r) => r.similarity);
    const metadata = {
      topK,
      totalChunks: hybridResults.length,
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
      `Hybrid retrieval complete: ${metadata.totalChunks} chunks, ` +
        `avg similarity: ${metadata.avgSimilarity.toFixed(4)}, ` +
        `range: [${metadata.minSimilarity.toFixed(4)}, ${metadata.maxSimilarity.toFixed(4)}]`,
    );

    // Step 7: Return structured retrieval result
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

  /**
   * Combine BM25 and Vector search results using weighted hybrid scoring
   * Normalizes scores from both methods and combines them based on hybridWeight
   * 
   * @param vectorResults - Results from vector similarity search
   * @param bm25Results - Results from BM25 keyword search
   * @param hybridWeight - Weight for vector search (0.0 = BM25 only, 1.0 = Vector only, 0.5 = equal)
   * @returns Combined and ranked results
   */
  private combineHybridResults(
    vectorResults: SimilaritySearchResult[],
    bm25Results: SimilaritySearchResult[],
    hybridWeight: number,
  ): SimilaritySearchResult[] {
    // Create a map to store combined results by chunkId
    const combinedMap = new Map<string, SimilaritySearchResult>();

    // Add vector results to the map
    vectorResults.forEach((result) => {
      combinedMap.set(result.chunkId, {
        ...result,
        metadata: {
          ...result.metadata,
          vectorScore: result.similarity,
        },
      });
    });

    // Merge BM25 results, combining scores where chunks appear in both
    bm25Results.forEach((result) => {
      const existing = combinedMap.get(result.chunkId);
      const bm25Score = result.similarity;

      if (existing) {
        // Chunk appears in both results - combine scores
        const vectorScore = existing.metadata?.vectorScore ?? existing.similarity;
        const hybridScore =
          hybridWeight * vectorScore + (1 - hybridWeight) * bm25Score;

        combinedMap.set(result.chunkId, {
          ...existing,
          similarity: hybridScore,
          distance: 1 - hybridScore,
          metadata: {
            ...existing.metadata,
            vectorScore,
            bm25Score,
            hybridScore,
            hybridWeight,
          },
        });
      } else {
        // Chunk only appears in BM25 results
        // Scale BM25 score by (1 - hybridWeight) to reflect its contribution
        const hybridScore = (1 - hybridWeight) * bm25Score;

        combinedMap.set(result.chunkId, {
          ...result,
          similarity: hybridScore,
          distance: 1 - hybridScore,
          metadata: {
            ...result.metadata,
            vectorScore: 0, // No vector match
            bm25Score,
            hybridScore,
            hybridWeight,
          },
        });
      }
    });

    // Update chunks that only appeared in vector results
    vectorResults.forEach((result) => {
      const existing = combinedMap.get(result.chunkId);
      if (existing && !existing.metadata?.bm25Score) {
        // Chunk only appears in vector results
        const vectorScore = result.similarity;
        const hybridScore = hybridWeight * vectorScore;

        combinedMap.set(result.chunkId, {
          ...existing,
          similarity: hybridScore,
          distance: 1 - hybridScore,
          metadata: {
            ...existing.metadata,
            vectorScore,
            bm25Score: 0, // No BM25 match
            hybridScore,
            hybridWeight,
          },
        });
      }
    });

    // Convert map to array and sort by hybrid score (descending)
    const combinedResults = Array.from(combinedMap.values()).sort(
      (a, b) => b.similarity - a.similarity,
    );

    this.logger.debug(
      `Combined ${vectorResults.length} vector + ${bm25Results.length} BM25 = ` +
        `${combinedResults.length} unique chunks (weight: ${hybridWeight})`,
    );

    return combinedResults;
  }
}

