import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GitHubService, GitHubFile } from './github.service';
import { DocumentService } from './document.service';
import {
  getMemoryUsage,
  formatMemoryUsage,
  getMemoryDelta,
  forceGC,
} from './memory-debug.util';

export interface SyncRepositoryDto {
  owner: string;
  repo: string;
  branch?: string;
  orgId: string;
}

export interface SyncResult {
  sourceId: string;
  documentsProcessed: number;
  chunksCreated: number;
  embeddingsCreated: number;
  errors: string[];
}

@Injectable()
export class GitHubIngestionService {
  private readonly logger = new Logger(GitHubIngestionService.name);
  private readonly embeddingModel: string;

  constructor(
    private readonly githubService: GitHubService,
    private readonly documentService: DocumentService,
    private readonly configService: ConfigService,
  ) {
    // Get embedding model from config
    const provider = this.configService.get<string>(
      'EMBEDDING_PROVIDER',
      'openai',
    );
    if (provider === 'openai') {
      this.embeddingModel = this.configService.get<string>(
        'OPENAI_EMBEDDING_MODEL',
        'text-embedding-3-small',
      );
    } else {
      this.embeddingModel = this.configService.get<string>(
        'OLLAMA_EMBEDDING_MODEL',
        'nomic-embed-text',
      );
    }
  }

  /**
   * Sync a GitHub repository: fetch files, store documents, chunk, and embed
   * @param dto - Repository sync parameters
   * @returns Promise resolving to sync result
   */
  async syncRepository(dto: SyncRepositoryDto): Promise<SyncResult> {
    const { owner, repo, branch = 'main', orgId } = dto;
    const repoUrl = `https://github.com/${owner}/${repo}`;

    this.logger.log(
      `Starting repository sync: ${owner}/${repo} (branch: ${branch}, orgId: ${orgId})`,
    );

    const errors: string[] = [];
    let documentsProcessed = 0;
    let chunksCreated = 0;
    let embeddingsCreated = 0;

    try {
      // Step 1: Get repository tree
      const memBefore = getMemoryUsage();
      this.logger.log(
        `[MEMORY] Starting sync - ${formatMemoryUsage(memBefore)}`,
      );
      this.logger.log('Fetching repository tree...');
      const treeItems = await this.githubService.getRepoTree(owner, repo, branch);

      // Step 2: Filter for .md and .ts files
      const fileItems = this.githubService.filterMarkdownAndTypeScriptFiles(
        treeItems,
      );
      this.logger.log(`Found ${fileItems.length} .md and .ts files`);

      if (fileItems.length === 0) {
        this.logger.warn('No .md or .ts files found in repository');
        return {
          sourceId: '',
          documentsProcessed: 0,
          chunksCreated: 0,
          embeddingsCreated: 0,
          errors: ['No .md or .ts files found in repository'],
        };
      }

      // Step 3: Create or update source
      const sourceId = await this.documentService.upsertSource(
        `${owner}/${repo}`,
        'github',
        repoUrl,
        orgId,
        {
          owner,
          repo,
          branch,
          syncedAt: new Date().toISOString(),
        },
      );

      // Step 4: Process files one at a time to avoid memory issues
      // Fetch and process each file individually instead of loading all into memory
      this.logger.log(`Processing ${fileItems.length} files one at a time...`);

      for (let i = 0; i < fileItems.length; i++) {
        const fileItem = fileItems[i];
        const memBeforeFile = getMemoryUsage();
        try {
          this.logger.debug(
            `[MEMORY] Before file ${i + 1}/${fileItems.length} (${fileItem.path}) - ${formatMemoryUsage(memBeforeFile)}`,
          );

          // Fetch file content
          const file = await this.githubService.getFileContent(
            owner,
            repo,
            fileItem.path,
          );

          const memAfterFetch = getMemoryUsage();
          const fetchDelta = getMemoryDelta(memBeforeFile, memAfterFetch);
          this.logger.debug(
            `[MEMORY] After fetch (${fileItem.path}, ${(file.size / 1024).toFixed(2)}KB) - Heap: +${fetchDelta.heapUsedDelta}MB, RSS: +${fetchDelta.rssDelta}MB`,
          );

          // Process the file
          const chunkCount = await this.documentService.processFile(
            sourceId,
            file.path,
            file.content,
            file.sha,
            file.size,
            repoUrl,
            this.embeddingModel,
          );

          const memAfterProcess = getMemoryUsage();
          const processDelta = getMemoryDelta(memAfterFetch, memAfterProcess);
          this.logger.debug(
            `[MEMORY] After process (${fileItem.path}, ${chunkCount} chunks) - Heap: +${processDelta.heapUsedDelta}MB, RSS: +${processDelta.rssDelta}MB`,
          );

          documentsProcessed++;
          chunksCreated += chunkCount;
          embeddingsCreated += chunkCount;

          // Log progress every 5 files
          if ((i + 1) % 5 === 0) {
            const memCurrent = getMemoryUsage();
            this.logger.log(
              `Processed ${i + 1}/${fileItems.length} files... (${documentsProcessed} documents, ${chunksCreated} chunks) - ${formatMemoryUsage(memCurrent)}`,
            );
          }

          // Force GC after every file to prevent accumulation
          forceGC();
          
          // Longer delay every 5 files to allow GC to complete
          if ((i + 1) % 5 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const memAfterGC = getMemoryUsage();
            this.logger.debug(
              `[MEMORY] After GC (file ${i + 1}) - ${formatMemoryUsage(memAfterGC)}`,
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to process ${fileItem.path}: ${errorMessage}`);
          this.logger.error(
            `Failed to process file ${fileItem.path}: ${errorMessage}`,
          );
        }
      }

      this.logger.log(
        `Sync completed: ${documentsProcessed} documents, ${chunksCreated} chunks, ${embeddingsCreated} embeddings`,
      );

      return {
        sourceId,
        documentsProcessed,
        chunksCreated,
        embeddingsCreated,
        errors,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Repository sync failed: ${errorMessage}`, error.stack);
      throw error;
    }
  }
}

