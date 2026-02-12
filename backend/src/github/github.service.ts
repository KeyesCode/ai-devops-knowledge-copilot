import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GitHubFile {
  path: string;
  content: string;
  sha: string;
  size: number;
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);
  private readonly apiToken: string | undefined;
  private readonly baseUrl = 'https://api.github.com';

  constructor(private readonly configService: ConfigService) {
    this.apiToken = this.configService.get<string>('GITHUB_TOKEN');
    if (!this.apiToken) {
      this.logger.warn('GITHUB_TOKEN not set. GitHub API calls may be rate-limited.');
    }
  }

  /**
   * Get the repository tree recursively
   * @param owner - Repository owner (username or org)
   * @param repo - Repository name
   * @param branch - Branch name (default: 'main')
   * @returns Promise resolving to array of tree items
   */
  async getRepoTree(
    owner: string,
    repo: string,
    branch: string = 'main',
  ): Promise<GitHubTreeItem[]> {
    try {
      // First, get the commit SHA for the branch
      const branchResponse = await this.fetch(
        `/repos/${owner}/${repo}/git/ref/heads/${branch}`,
      );
      const commitSha = branchResponse.object.sha;

      // Get the tree recursively
      const treeResponse = await this.fetch(
        `/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`,
      );

      return treeResponse.tree || [];
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to get repo tree for ${owner}/${repo}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Filter tree items to only include .md and .ts files
   * @param treeItems - Array of tree items
   * @returns Filtered array of file items
   */
  filterMarkdownAndTypeScriptFiles(
    treeItems: GitHubTreeItem[],
  ): GitHubTreeItem[] {
    return treeItems.filter(
      (item) =>
        item.type === 'blob' &&
        (item.path.endsWith('.md') || item.path.endsWith('.ts')),
    );
  }

  /**
   * Fetch file content from GitHub
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param path - File path
   * @returns Promise resolving to file content
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
  ): Promise<GitHubFile> {
    try {
      const response = await this.fetch(
        `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      );

      // GitHub API returns base64 encoded content
      const content = Buffer.from(response.content, 'base64').toString('utf-8');

      return {
        path: response.path,
        content,
        sha: response.sha,
        size: response.size,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to get file content for ${owner}/${repo}/${path}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Fetch multiple files in parallel (with rate limiting consideration)
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param paths - Array of file paths
   * @param concurrency - Number of concurrent requests (default: 5)
   * @returns Promise resolving to array of files
   */
  async getFilesContent(
    owner: string,
    repo: string,
    paths: string[],
    concurrency: number = 5,
  ): Promise<GitHubFile[]> {
    const results: GitHubFile[] = [];
    const errors: Array<{ path: string; error: string }> = [];

    // Process in batches to respect rate limits
    for (let i = 0; i < paths.length; i += concurrency) {
      const batch = paths.slice(i, i + concurrency);
      const batchPromises = batch.map(async (path) => {
        try {
          return await this.getFileContent(owner, repo, path);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          errors.push({ path, error: errorMessage });
          this.logger.warn(`Failed to fetch ${path}: ${errorMessage}`);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((file): file is GitHubFile => file !== null));

      // Small delay between batches to avoid hitting rate limits
      if (i + concurrency < paths.length) {
        await this.delay(100);
      }
    }

    if (errors.length > 0) {
      this.logger.warn(
        `Failed to fetch ${errors.length} files out of ${paths.length}`,
      );
    }

    return results;
  }

  /**
   * Make authenticated GitHub API request
   */
  private async fetch(endpoint: string): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (this.apiToken) {
      headers.Authorization = `token ${this.apiToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response.json();
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

