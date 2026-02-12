import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface ChunkEmbedding {
  chunkId: string;
  embedding: number[];
  model: string;
}

export interface SimilaritySearchResult {
  chunkId: string;
  content: string;
  documentId: string;
  documentTitle: string | null;
  sourceId: string;
  similarity: number;
  distance: number;
  metadata?: Record<string, any>;
}

interface UpsertResultRow {
  id: string;
}

interface SimilaritySearchRow {
  embedding_id: string;
  chunk_id: string;
  content: string;
  chunk_metadata: Record<string, any> | null;
  document_id: string;
  document_title: string | null;
  source_id: string;
  similarity: string;
  distance: string;
}

@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Upsert a chunk embedding into the vector store
   * @param chunkId - The UUID of the chunk
   * @param embedding - The embedding vector (array of numbers)
   * @param model - The model name used to generate the embedding
   * @returns Promise resolving to the embedding ID
   */
  async upsertChunkEmbedding(
    chunkId: string,
    embedding: number[],
    model: string,
  ): Promise<string> {
    try {
      // Validate inputs
      if (!chunkId) {
        throw new Error('chunkId is required');
      }
      if (!embedding || embedding.length === 0) {
        throw new Error('embedding vector is required and cannot be empty');
      }
      if (!model) {
        throw new Error('model name is required');
      }

      // Pad embedding to 1536 dimensions if needed (for IVFFlat index compatibility)
      // This allows Ollama (768 dims) and OpenAI (1536 dims) to coexist
      const TARGET_DIMENSION = 1536;
      let normalizedEmbedding: number[] = embedding;

      if (embedding.length < TARGET_DIMENSION) {
        // Pad with zeros to reach target dimension
        const padding = new Array<number>(
          TARGET_DIMENSION - embedding.length,
        ).fill(0);
        normalizedEmbedding = [...embedding, ...padding];
        this.logger.debug(
          `Padded embedding from ${embedding.length} to ${TARGET_DIMENSION} dimensions`,
        );
      } else if (embedding.length > TARGET_DIMENSION) {
        // Truncate if somehow larger (shouldn't happen, but be safe)
        normalizedEmbedding = embedding.slice(0, TARGET_DIMENSION);
        this.logger.warn(
          `Truncated embedding from ${embedding.length} to ${TARGET_DIMENSION} dimensions`,
        );
      }

      // Convert embedding array to PostgreSQL vector format
      const vectorString = `[${normalizedEmbedding.join(',')}]`;

      // Use ON CONFLICT to upsert (insert or update if chunk_id already exists)
      const result: UpsertResultRow[] = await this.dataSource.query(
        `
        INSERT INTO embeddings (chunk_id, vector, model)
        VALUES ($1, $2::vector, $3)
        ON CONFLICT (chunk_id) 
        DO UPDATE SET 
          vector = $2::vector,
          model = $3,
          created_at = CURRENT_TIMESTAMP
        RETURNING id;
        `,
        [chunkId, vectorString, model],
      );

      if (!result || result.length === 0) {
        throw new Error('Failed to upsert embedding');
      }

      const embeddingId = result[0].id;
      this.logger.debug(
        `Upserted embedding for chunk ${chunkId} with model ${model}`,
      );

      return embeddingId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to upsert chunk embedding: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * Perform similarity search using cosine distance
   * Returns the top K most similar chunks filtered by organization ID
   * @param queryEmbedding - The query embedding vector
   * @param topK - Number of results to return (default: 10)
   * @param orgId - Organization ID to filter results by
   * @returns Promise resolving to array of similarity search results
   */
  async similaritySearch(
    queryEmbedding: number[],
    topK: number = 10,
    orgId: string,
  ): Promise<SimilaritySearchResult[]> {
    try {
      // Validate inputs
      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error('queryEmbedding is required and cannot be empty');
      }
      if (topK <= 0) {
        throw new Error('topK must be greater than 0');
      }
      if (!orgId) {
        throw new Error('orgId is required for ACL filtering');
      }

      // Pad query embedding to 1536 dimensions if needed (same as stored embeddings)
      const TARGET_DIMENSION = 1536;
      let normalizedQueryEmbedding: number[] = queryEmbedding;

      if (queryEmbedding.length < TARGET_DIMENSION) {
        const padding = new Array<number>(
          TARGET_DIMENSION - queryEmbedding.length,
        ).fill(0);
        normalizedQueryEmbedding = [...queryEmbedding, ...padding];
        this.logger.debug(
          `Padded query embedding from ${queryEmbedding.length} to ${TARGET_DIMENSION} dimensions`,
        );
      } else if (queryEmbedding.length > TARGET_DIMENSION) {
        normalizedQueryEmbedding = queryEmbedding.slice(0, TARGET_DIMENSION);
        this.logger.warn(
          `Truncated query embedding from ${queryEmbedding.length} to ${TARGET_DIMENSION} dimensions`,
        );
      }

      // Convert embedding array to PostgreSQL vector format
      const vectorString = `[${normalizedQueryEmbedding.join(',')}]`;

      // Perform similarity search with org_id filtering
      // Join through: embeddings -> chunks -> documents -> sources
      // Filter by sources.org_id for ACL
      // Use cosine distance (<=>) operator for similarity
      // 1 - distance gives us similarity (higher is better)
      const results: SimilaritySearchRow[] = await this.dataSource.query(
        `
        SELECT 
          e.id as embedding_id,
          c.id as chunk_id,
          c.content,
          c.metadata as chunk_metadata,
          d.id as document_id,
          d.title as document_title,
          s.id as source_id,
          1 - (e.vector <=> $1::vector) as similarity,
          e.vector <=> $1::vector as distance
        FROM embeddings e
        INNER JOIN chunks c ON c.id = e.chunk_id
        INNER JOIN documents d ON d.id = c.document_id
        INNER JOIN sources s ON s.id = d.source_id
        WHERE s.org_id = $2
        ORDER BY e.vector <=> $1::vector
        LIMIT $3;
        `,
        [vectorString, orgId, topK],
      );

      // Transform results to match the interface
      const searchResults: SimilaritySearchResult[] = results.map((row) => ({
        chunkId: row.chunk_id,
        content: row.content,
        documentId: row.document_id,
        documentTitle: row.document_title,
        sourceId: row.source_id,
        similarity: parseFloat(row.similarity),
        distance: parseFloat(row.distance),
        metadata: row.chunk_metadata || {},
      }));

      this.logger.debug(
        `Similarity search completed: found ${searchResults.length} results for org ${orgId}`,
      );

      return searchResults;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to perform similarity search: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }
}
