import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { GitHubIngestionService, SyncResult } from './github-ingestion.service';
import type { SyncRepositoryDto } from './github-ingestion.service';

@Controller('github')
export class GitHubController {
  private readonly logger = new Logger(GitHubController.name);

  constructor(
    private readonly githubIngestionService: GitHubIngestionService,
  ) {}

  /**
   * Sync a GitHub repository
   * POST /github/sync
   * 
   * Body:
   * {
   *   "owner": "owner-name",
   *   "repo": "repo-name",
   *   "branch": "main" // optional, defaults to "main"
   * }
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncRepository(
    @Body() dto: SyncRepositoryDto,
  ): Promise<SyncResult> {
    this.logger.log(
      `Sync request received for ${dto.owner}/${dto.repo}`,
    );

    // Validate required fields
    if (!dto.owner || !dto.repo) {
      throw new BadRequestException('owner and repo are required');
    }

    return this.githubIngestionService.syncRepository(dto);
  }
}

