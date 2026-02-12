import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { GitHubIngestionService, SyncResult } from './github-ingestion.service';
import type { SyncRepositoryDto } from './github-ingestion.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';

@Controller('github')
export class GitHubController {
  private readonly logger = new Logger(GitHubController.name);

  constructor(
    private readonly githubIngestionService: GitHubIngestionService,
  ) {}

  /**
   * Sync a GitHub repository (Admin only - creates sources)
   * POST /github/sync
   * 
   * Headers:
   * Authorization: Bearer <jwt-token>
   * 
   * Body:
   * {
   *   "owner": "owner-name",
   *   "repo": "repo-name",
   *   "branch": "main" // optional, defaults to "main"
   * }
   * 
   * Requires: ADMIN role or CREATE_SOURCE permission
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async syncRepository(
    @Body() dto: Omit<SyncRepositoryDto, 'orgId'>,
    @CurrentUser() user: CurrentUserData,
  ): Promise<SyncResult> {
    this.logger.log(
      `Sync request received for ${dto.owner}/${dto.repo} by user ${user.id} (org: ${user.orgId})`,
    );

    // Validate required fields
    if (!dto.owner || !dto.repo) {
      throw new BadRequestException('owner and repo are required');
    }

    return this.githubIngestionService.syncRepository({
      ...dto,
      orgId: user.orgId,
    });
  }
}

