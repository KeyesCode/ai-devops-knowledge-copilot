import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmbeddingService } from '../embeddings/embedding.service';
import { VectorStoreService } from '../vector-store/vector-store.service';
import {
  getMemoryUsage,
  formatMemoryUsage,
  getMemoryDelta,
} from './memory-debug.util';

export interface DocumentMetadata {
  filePath?: string;
  fileSize?: number;
  fileSha?: string;
  [key: string]: any;
}

interface SourceRow {
  id: string;
}

interface DocumentRow {
  id: string;
}

interface ChunkRow {
  id: string;
}

/**
 * Simple text splitter implementation
 * Splits text into chunks with overlap for better context preservation
 * For markdown files, attempts to preserve structure by chunking at section boundaries
 */
class SimpleTextSplitter {
  constructor(
    private readonly chunkSize: number = 1000,
    private readonly chunkOverlap: number = 200,
  ) {}

  /**
   * Check if text appears to be markdown
   */
  private isMarkdown(text: string): boolean {
    // Check for common markdown patterns
    return /^#{1,6}\s/.test(text.trim()) || 
           /\[.*\]\(.*\)/.test(text) || 
           /^\s*[-*+]\s/.test(text) ||
           /^\s*\d+\.\s/.test(text);
  }

  /**
   * Split markdown text by sections (## headings) when possible
   */
  private splitMarkdownBySections(text: string): string[] {
    const sections: string[] = [];
    const lines = text.split('\n');
    let currentSection: string[] = [];
    let currentSectionSize = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isHeading = /^#{2,6}\s/.test(line);
      
      // If we hit a heading and have content, save current section
      if (isHeading && currentSection.length > 0) {
        const sectionText = currentSection.join('\n');
        if (sectionText.trim().length > 0) {
          sections.push(sectionText);
        }
        currentSection = [line];
        currentSectionSize = line.length;
        continue;
      }

      // Add line to current section
      currentSection.push(line);
      currentSectionSize += line.length + 1; // +1 for newline

      // If section is getting too large, split it
      if (currentSectionSize > this.chunkSize) {
        const sectionText = currentSection.join('\n');
        if (sectionText.trim().length > 0) {
          sections.push(sectionText);
        }
        // Start new section with overlap
        const overlapLines = Math.floor(this.chunkOverlap / 50); // Rough estimate
        currentSection = currentSection.slice(-overlapLines);
        currentSectionSize = currentSection.join('\n').length;
      }
    }

    // Add remaining section
    if (currentSection.length > 0) {
      const sectionText = currentSection.join('\n');
      if (sectionText.trim().length > 0) {
        sections.push(sectionText);
      }
    }

    // If we got sections, return them; otherwise fall back to regular splitting
    if (sections.length > 1) {
      return sections;
    }
    return [];
  }

  splitText(text: string): string[] {
    // Try markdown-aware splitting first
    if (this.isMarkdown(text)) {
      const markdownChunks = this.splitMarkdownBySections(text);
      if (markdownChunks.length > 1) {
        // Further split large sections if needed
        const finalChunks: string[] = [];
        for (const chunk of markdownChunks) {
          if (chunk.length <= this.chunkSize) {
            finalChunks.push(chunk);
          } else {
            // Split large sections using regular method
            finalChunks.push(...this.splitTextRegular(chunk));
          }
        }
        return finalChunks;
      }
    }

    // Fall back to regular splitting
    return this.splitTextRegular(text);
  }

  private splitTextRegular(text: string): string[] {
    if (text.length <= this.chunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;
    const textLength = text.length;
    const maxChunks = Math.ceil(textLength / (this.chunkSize - this.chunkOverlap)) + 100; // Safety limit
    let iterations = 0;

    while (start < textLength && iterations < maxChunks) {
      iterations++;
      let end = Math.min(start + this.chunkSize, textLength);
      
      // If not the last chunk, try to break at a good boundary
      if (end < textLength) {
        // Search backwards from end position (more efficient than lastIndexOf on full string)
        let foundBreak = false;
        
        // Try to break at paragraph boundary first (search in last 200 chars)
        const searchStart = Math.max(start, end - 200);
        for (let i = end - 1; i >= searchStart; i--) {
          if (i + 1 < textLength && text[i] === '\n' && text[i + 1] === '\n') {
            end = i + 2;
            foundBreak = true;
            break;
          }
        }
        
        // If no paragraph break, try line boundary
        if (!foundBreak) {
          for (let i = end - 1; i >= searchStart; i--) {
            if (text[i] === '\n') {
              end = i + 1;
              foundBreak = true;
              break;
            }
          }
        }
        
        // If no line break, try sentence boundary
        if (!foundBreak) {
          for (let i = end - 1; i >= searchStart; i--) {
            if (i + 1 < textLength && text[i] === '.' && text[i + 1] === ' ') {
              end = i + 2;
              foundBreak = true;
              break;
            }
          }
        }
      }

      // Ensure end is always greater than start
      if (end <= start) {
        end = start + 1;
      }

      // Extract chunk
      const chunk = text.substring(start, end);
      if (chunk.trim().length > 0) {
        chunks.push(chunk);
      }
      
      // Move start position with overlap
      // If chunk is smaller than overlap, advance by chunkSize - overlap to maintain reasonable progress
      // Otherwise, use the normal overlap calculation
      const chunkLength = end - start;
      let newStart: number;
      
      if (chunkLength < this.chunkOverlap) {
        // Chunk is smaller than overlap, advance by chunkSize - overlap (or at least 1)
        newStart = start + Math.max(1, this.chunkSize - this.chunkOverlap);
      } else {
        // Normal case: overlap from the end
        newStart = end - this.chunkOverlap;
      }
      
      // Ensure we always advance by at least 1
      start = Math.max(start + 1, newStart);
      
      // Final safety check: ensure we always advance
      if (start >= end) {
        start = end;
      }
      
      // Prevent creating too many chunks (safety limit)
      if (chunks.length > 100000) {
        console.warn(`Text splitter creating too many chunks (${chunks.length}), stopping`);
        break;
      }
    }

    // Safety: if we hit max iterations, log a warning
    if (iterations >= maxChunks) {
      console.warn(`Text splitter hit max iterations (${maxChunks}) for text of length ${textLength}`);
    }

    return chunks;
  }
}

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);
  private readonly textSplitter: SimpleTextSplitter;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStoreService: VectorStoreService,
  ) {
    // Initialize text splitter with improved defaults
    // Chunk size: 1500 characters, overlap: 300 characters
    // Larger chunks preserve more context; more overlap reduces splits across important sections
    this.textSplitter = new SimpleTextSplitter(1500, 300);
  }

  /**
   * Create or update a source in the database
   * @param name - Source name
   * @param type - Source type (e.g., 'github')
   * @param url - Source URL
   * @param metadata - Additional metadata
   * @returns Promise resolving to source ID
   */
  async upsertSource(
    name: string,
    type: string,
    url: string,
    orgId: string,
    metadata: Record<string, any> = {},
  ): Promise<string> {
    try {
      // Check if source already exists by URL and orgId
      const existing = await this.dataSource.query(
        `SELECT id FROM sources WHERE url = $1 AND org_id = $2 LIMIT 1`,
        [url, orgId],
      );

      if (existing.length > 0) {
        // Update existing source
        await this.dataSource.query(
          `UPDATE sources 
           SET name = $1, type = $2, metadata = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [name, type, JSON.stringify(metadata), existing[0].id],
        );
        this.logger.debug(`Updated source: ${existing[0].id}`);
        return existing[0].id;
      }

      // Create new source
      const result: SourceRow[] = await this.dataSource.query(
        `INSERT INTO sources (name, type, url, org_id, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [name, type, url, orgId, JSON.stringify(metadata)],
      );

      if (!result || result.length === 0) {
        throw new Error('Failed to create source');
      }

      const sourceId = result[0].id;
      this.logger.debug(`Created source: ${sourceId}`);
      return sourceId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to upsert source: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Create or update a document in the database
   * @param sourceId - Source ID
   * @param title - Document title
   * @param content - Document content
   * @param url - Document URL
   * @param metadata - Additional metadata
   * @returns Promise resolving to document ID
   */
  async upsertDocument(
    sourceId: string,
    title: string,
    content: string,
    url: string,
    metadata: DocumentMetadata = {},
  ): Promise<string> {
    try {
      // Check if document already exists by URL
      const existing = await this.dataSource.query(
        `SELECT id FROM documents WHERE url = $1 AND source_id = $2 LIMIT 1`,
        [url, sourceId],
      );

      if (existing.length > 0) {
        // Update existing document
        await this.dataSource.query(
          `UPDATE documents 
           SET title = $1, content = $2, metadata = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [
            title,
            content,
            JSON.stringify(metadata),
            existing[0].id,
          ],
        );
        this.logger.debug(`Updated document: ${existing[0].id}`);
        return existing[0].id;
      }

      // Create new document
      const result: DocumentRow[] = await this.dataSource.query(
        `INSERT INTO documents (source_id, title, content, url, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [sourceId, title, content, url, JSON.stringify(metadata)],
      );

      if (!result || result.length === 0) {
        throw new Error('Failed to create document');
      }

      const documentId = result[0].id;
      this.logger.debug(`Created document: ${documentId}`);
      return documentId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to upsert document: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Chunk a document and store chunks in the database
   * @param documentId - Document ID
   * @param content - Document content to chunk
   * @param metadata - Metadata to attach to chunks
   * @returns Promise resolving to array of chunk IDs
   */
  async chunkDocument(
    documentId: string,
    content: string,
    metadata: DocumentMetadata = {},
  ): Promise<string[]> {
    try {
      const memBefore = getMemoryUsage();
      const contentSizeKB = (content.length / 1024).toFixed(2);
      this.logger.debug(
        `[MEMORY] Before chunking (content: ${contentSizeKB}KB) - ${formatMemoryUsage(memBefore)}`,
      );

      // Split content into chunks
      const chunks = this.textSplitter.splitText(content);
      const totalChunks = chunks.length;

      const memAfterSplit = getMemoryUsage();
      const splitDelta = getMemoryDelta(memBefore, memAfterSplit);
      this.logger.debug(
        `[MEMORY] After split (${totalChunks} chunks from ${contentSizeKB}KB) - Heap: +${splitDelta.heapUsedDelta}MB, RSS: +${splitDelta.rssDelta}MB`,
      );
      
      // Clear content reference to help GC (chunks are already extracted)
      // Note: This doesn't actually free memory immediately, but helps GC know it can be collected

      // Delete existing chunks for this document
      await this.dataSource.query(
        `DELETE FROM chunks WHERE document_id = $1`,
        [documentId],
      );

      const chunkIds: string[] = [];

      // Insert chunks one at a time to reduce memory pressure
      for (let i = 0; i < chunks.length; i++) {
        const chunkContent = chunks[i];
        if (!chunkContent || chunkContent.trim().length === 0) {
          continue; // Skip empty chunks
        }

        const result: ChunkRow[] = await this.dataSource.query(
          `INSERT INTO chunks (document_id, content, chunk_index, metadata)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [
            documentId,
            chunkContent,
            i,
            JSON.stringify({
              ...metadata,
              chunkIndex: i,
              totalChunks,
            }),
          ],
        );

        if (result && result.length > 0) {
          chunkIds.push(result[0].id);
        }
      }

      this.logger.debug(
        `Created ${chunkIds.length} chunks for document ${documentId}`,
      );
      return chunkIds;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to chunk document: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Generate embeddings for chunks and store them
   * @param chunkIds - Array of chunk IDs
   * @param model - Model name used for embeddings
   * @returns Promise resolving when complete
   */
  async embedChunks(chunkIds: string[], model: string): Promise<void> {
    try {
      const memBefore = getMemoryUsage();
      this.logger.log(
        `Generating embeddings for ${chunkIds.length} chunks... [MEMORY] ${formatMemoryUsage(memBefore)}`,
      );

      const BATCH_SIZE = 5; // Process 5 chunks at a time to reduce memory pressure

      for (let i = 0; i < chunkIds.length; i++) {
        const chunkId = chunkIds[i];
        const memBeforeChunk = getMemoryUsage();

        // Get chunk content
        const chunkResult = await this.dataSource.query(
          `SELECT content FROM chunks WHERE id = $1`,
          [chunkId],
        );

        if (!chunkResult || chunkResult.length === 0) {
          this.logger.warn(`Chunk ${chunkId} not found, skipping`);
          continue;
        }

        const chunkContent = chunkResult[0].content;
        const chunkSize = chunkContent.length;

        // Generate embedding
        const embedding = await this.embeddingService.embed(chunkContent);

        const memAfterEmbed = getMemoryUsage();
        const embedDelta = getMemoryDelta(memBeforeChunk, memAfterEmbed);
        this.logger.debug(
          `[MEMORY] After embedding chunk ${i + 1}/${chunkIds.length} (${(chunkSize / 1024).toFixed(2)}KB, ${embedding.length} dims) - Heap: +${embedDelta.heapUsedDelta}MB`,
        );

        // Store embedding
        await this.vectorStoreService.upsertChunkEmbedding(
          chunkId,
          embedding,
          model,
        );

        const memAfterStore = getMemoryUsage();
        const storeDelta = getMemoryDelta(memAfterEmbed, memAfterStore);
        this.logger.debug(
          `[MEMORY] After store chunk ${i + 1} - Heap: +${storeDelta.heapUsedDelta}MB`,
        );

        // Clear embedding array from memory
        embedding.length = 0;

        // Log progress and add delay every BATCH_SIZE chunks
        if ((i + 1) % BATCH_SIZE === 0) {
          const memCurrent = getMemoryUsage();
          const totalDelta = getMemoryDelta(memBefore, memCurrent);
          this.logger.debug(
            `Processed ${i + 1}/${chunkIds.length} chunks... [MEMORY] Total heap increase: +${totalDelta.heapUsedDelta}MB - ${formatMemoryUsage(memCurrent)}`,
          );
          // Small delay to allow garbage collection
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      const memAfter = getMemoryUsage();
      const totalDelta = getMemoryDelta(memBefore, memAfter);
      this.logger.log(
        `Completed embedding generation for ${chunkIds.length} chunks. [MEMORY] Total increase: Heap: +${totalDelta.heapUsedDelta}MB, RSS: +${totalDelta.rssDelta}MB - ${formatMemoryUsage(memAfter)}`,
      );

      this.logger.log(`Completed embedding generation for ${chunkIds.length} chunks`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to embed chunks: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Process a file: create document, chunk it, and generate embeddings
   * @param sourceId - Source ID
   * @param filePath - File path
   * @param content - File content
   * @param fileSha - File SHA (for tracking changes)
   * @param fileSize - File size
   * @param repoUrl - Repository URL for document URL
   * @param model - Embedding model name
   * @returns Promise resolving to number of chunks created
   */
  async processFile(
    sourceId: string,
    filePath: string,
    content: string,
    fileSha: string,
    fileSize: number,
    repoUrl: string,
    model: string,
  ): Promise<number> {
    try {
      // Create or update document
      const documentUrl = `${repoUrl}/blob/main/${filePath}`;
      const documentId = await this.upsertDocument(
        sourceId,
        filePath,
        content,
        documentUrl,
        {
          filePath,
          fileSha,
          fileSize,
        },
      );

      // Chunk the document
      const chunkIds = await this.chunkDocument(documentId, content, {
        filePath,
        fileSha,
        fileSize,
      });

      const chunkCount = chunkIds.length;

      // Generate and store embeddings
      // Note: content and chunkIds will be garbage collected after this function returns
      await this.embedChunks(chunkIds, model);

      this.logger.debug(
        `Processed file ${filePath}: ${chunkCount} chunks, ${chunkCount} embeddings`,
      );

      return chunkCount;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to process file ${filePath}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * List all sources for an organization
   * @param orgId - Organization ID
   * @returns Promise resolving to array of sources with document and chunk counts
   */
  async listSources(orgId: string): Promise<Array<{
    id: string;
    name: string;
    type: string;
    url: string;
    metadata: Record<string, any>;
    documentCount: number;
    chunkCount: number;
    createdAt: string;
    updatedAt: string;
  }>> {
    try {
      const sources = await this.dataSource.query(
        `
        SELECT 
          s.id,
          s.name,
          s.type,
          s.url,
          s.metadata,
          s.created_at,
          s.updated_at,
          COUNT(DISTINCT d.id) as document_count,
          COUNT(DISTINCT c.id) as chunk_count
        FROM sources s
        LEFT JOIN documents d ON d.source_id = s.id
        LEFT JOIN chunks c ON c.document_id = d.id
        WHERE s.org_id = $1
        GROUP BY s.id, s.name, s.type, s.url, s.metadata, s.created_at, s.updated_at
        ORDER BY s.updated_at DESC
        `,
        [orgId],
      );

      return sources.map((row: any) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        url: row.url,
        metadata: row.metadata || {},
        documentCount: parseInt(row.document_count, 10) || 0,
        chunkCount: parseInt(row.chunk_count, 10) || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to list sources: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * List all documents for a source
   * @param sourceId - Source ID
   * @param orgId - Organization ID (for ACL verification)
   * @returns Promise resolving to array of documents with chunk counts
   */
  async listDocuments(
    sourceId: string,
    orgId: string,
  ): Promise<Array<{
    id: string;
    title: string;
    url: string;
    metadata: Record<string, any>;
    chunkCount: number;
    createdAt: string;
    updatedAt: string;
  }>> {
    try {
      // Verify source belongs to org
      const sourceCheck = await this.dataSource.query(
        `SELECT id FROM sources WHERE id = $1 AND org_id = $2`,
        [sourceId, orgId],
      );

      if (sourceCheck.length === 0) {
        throw new Error('Source not found or access denied');
      }

      const documents = await this.dataSource.query(
        `
        SELECT 
          d.id,
          d.title,
          d.url,
          d.metadata,
          d.created_at,
          d.updated_at,
          COUNT(DISTINCT c.id) as chunk_count
        FROM documents d
        LEFT JOIN chunks c ON c.document_id = d.id
        WHERE d.source_id = $1
        GROUP BY d.id, d.title, d.url, d.metadata, d.created_at, d.updated_at
        ORDER BY d.title
        `,
        [sourceId],
      );

      return documents.map((row: any) => ({
        id: row.id,
        title: row.title,
        url: row.url,
        metadata: row.metadata || {},
        chunkCount: parseInt(row.chunk_count, 10) || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to list documents: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}

