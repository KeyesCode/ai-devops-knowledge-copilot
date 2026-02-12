import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SimilaritySearchResult } from './vector-store.service';

export interface BM25SearchResult {
  chunkId: string;
  content: string;
  documentId: string;
  documentTitle: string | null;
  sourceId: string;
  bm25Score: number;
  metadata?: Record<string, any>;
}

interface BM25SearchRow {
  chunk_id: string;
  content: string;
  chunk_metadata: Record<string, any> | null;
  document_id: string;
  document_title: string | null;
  source_id: string;
  bm25_score: string;
}

@Injectable()
export class BM25SearchService {
  private readonly logger = new Logger(BM25SearchService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Perform BM25 keyword-based search using PostgreSQL full-text search
   * BM25 scoring is approximated using PostgreSQL's ts_rank_cd function
   * which provides a similar ranking algorithm optimized for full-text search
   *
   * @param query - The search query string
   * @param topK - Number of results to return (default: 20)
   * @param orgId - Organization ID to filter results by
   * @returns Promise resolving to array of BM25 search results
   */
  async bm25Search(
    query: string,
    topK: number = 20,
    orgId: string,
  ): Promise<BM25SearchResult[]> {
    try {
      // Validate inputs
      if (!query || query.trim().length === 0) {
        throw new Error('query is required and cannot be empty');
      }
      if (topK <= 0) {
        throw new Error('topK must be greater than 0');
      }
      if (!orgId) {
        throw new Error('orgId is required for ACL filtering');
      }

      // Convert query to tsquery format for PostgreSQL full-text search
      // This handles tokenization and prepares the query for matching
      const queryTokens = this.prepareQuery(query);
      const tsQuery = this.buildTsQuery(queryTokens);

      if (!tsQuery || tsQuery.trim().length === 0) {
        this.logger.warn(
          `BM25 search: No valid tokens extracted from query: "${query}"`,
        );
        return []; // Return empty results if no valid tokens
      }

      this.logger.debug(`BM25 search query: "${query}" -> tsquery: "${tsQuery}"`);

      // Perform BM25-like search using PostgreSQL's ts_rank_cd (cover density ranking)
      // ts_rank_cd provides a ranking similar to BM25 that considers:
      // - Term frequency in the document
      // - Inverse document frequency
      // - Document length normalization
      // Join through: chunks -> documents -> sources
      // Filter by sources.org_id to ensure users can only access sources from their organization
      const results: BM25SearchRow[] = await this.dataSource.query(
        `
        SELECT 
          c.id as chunk_id,
          c.content,
          c.metadata as chunk_metadata,
          d.id as document_id,
          d.title as document_title,
          s.id as source_id,
          ts_rank_cd(c.content_tsvector, $1::tsquery, 32) as bm25_score
        FROM chunks c
        INNER JOIN documents d ON d.id = c.document_id
        INNER JOIN sources s ON s.id = d.source_id
        WHERE s.org_id = $2  -- ACL: Only return sources from the user's organization
          AND c.content_tsvector @@ $1::tsquery  -- Full-text search match
        ORDER BY bm25_score DESC
        LIMIT $3;
        `,
        [tsQuery, orgId, topK],
      );

      // Transform results to match the interface
      const searchResults: BM25SearchResult[] = results.map((row) => ({
        chunkId: row.chunk_id,
        content: row.content,
        documentId: row.document_id,
        documentTitle: row.document_title,
        sourceId: row.source_id,
        bm25Score: parseFloat(row.bm25_score),
        metadata: row.chunk_metadata || {},
      }));

      this.logger.debug(
        `BM25 search completed: found ${searchResults.length} results for org ${orgId}`,
      );

      return searchResults;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to perform BM25 search: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * Prepare query string by tokenizing and cleaning
   * @param query - Original query string
   * @returns Array of cleaned tokens
   */
  private prepareQuery(query: string): string[] {
    // Remove special characters and split into tokens
    // Keep alphanumeric characters, hyphens, and underscores
    return query
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/[^\w-]/g, ''))
      .filter((token) => token.length > 0);
  }

  /**
   * Build PostgreSQL tsquery from tokens
   * Uses '&' (AND) operator to require all terms, with '|' (OR) for flexibility
   * @param tokens - Array of query tokens
   * @returns PostgreSQL tsquery string
   */
  private buildTsQuery(tokens: string[]): string {
    if (tokens.length === 0) {
      return '';
    }

    // For better recall, use OR between tokens but require at least one match
    // This allows documents matching any of the query terms to be considered
    // The ranking (ts_rank_cd) will naturally boost documents with more matches
    const escapedTokens = tokens.map((token) => {
      // Escape special characters for tsquery
      return token.replace(/[:'&|!()]/g, '');
    });

    // Join with OR operator for better recall
    // Documents matching more terms will rank higher due to ts_rank_cd
    return escapedTokens.join(' | ');
  }

  /**
   * Convert BM25SearchResult to SimilaritySearchResult format for compatibility
   * Normalizes BM25 score to similarity range [0, 1]
   * @param bm25Results - BM25 search results
   * @returns SimilaritySearchResult array
   */
  convertToSimilarityResults(
    bm25Results: BM25SearchResult[],
  ): SimilaritySearchResult[] {
    if (bm25Results.length === 0) {
      return [];
    }

    // Normalize BM25 scores to [0, 1] range for combination with vector similarity
    // Find min and max scores for normalization
    const scores = bm25Results.map((r) => r.bm25Score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const scoreRange = maxScore - minScore;

    return bm25Results.map((result) => {
      // Normalize to [0, 1] range
      const normalizedScore =
        scoreRange > 0
          ? (result.bm25Score - minScore) / scoreRange
          : 0.5; // If all scores are the same, use 0.5 as default

      return {
        chunkId: result.chunkId,
        content: result.content,
        documentId: result.documentId,
        documentTitle: result.documentTitle,
        sourceId: result.sourceId,
        similarity: normalizedScore,
        distance: 1 - normalizedScore,
        metadata: {
          ...result.metadata,
          bm25Score: result.bm25Score,
          originalBM25Score: result.bm25Score,
        },
      };
    });
  }
}

