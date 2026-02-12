import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmbeddingProvider } from './interfaces/embedding-provider.interface';
import { OpenAIEmbeddingProvider } from './providers/openai-embedding.provider';
import { OllamaEmbeddingProvider } from './providers/ollama-embedding.provider';
import { RedisService } from './redis.service';
import * as crypto from 'crypto';

export type EmbeddingProviderType = 'openai' | 'ollama';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly provider: IEmbeddingProvider;
  private readonly cacheEnabled: boolean;
  private readonly cacheTtl: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    // Get provider type from env, default to 'openai'
    const providerType = this.configService.get<EmbeddingProviderType>(
      'EMBEDDING_PROVIDER',
      'openai',
    );

    // Initialize the appropriate provider
    this.provider = this.createProvider(providerType);
    
    // Cache configuration
    this.cacheEnabled = this.configService.get<boolean>(
      'EMBEDDING_CACHE_ENABLED',
      true,
    );
    this.cacheTtl = this.configService.get<number>(
      'EMBEDDING_CACHE_TTL',
      86400, // 24 hours in seconds
    );

    this.logger.log(
      `EmbeddingService initialized with provider: ${providerType}, cache: ${this.cacheEnabled ? 'enabled' : 'disabled'}`,
    );
  }

  /**
   * Generate embeddings for the given text
   * Uses Redis caching to avoid duplicate API calls
   * @param text - The text to embed
   * @returns Promise resolving to a vector array
   */
  async embed(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // Generate cache key from text hash
    const cacheKey = this.getCacheKey(text);

    // Try to get from cache first
    if (this.cacheEnabled) {
      try {
        const cached = await this.redisService.get<number[]>(cacheKey);
        if (cached) {
          this.logger.debug(`Cache hit for embedding: ${cacheKey.substring(0, 16)}...`);
          return cached;
        }
      } catch (error) {
        this.logger.warn(`Cache read error: ${error.message}`);
        // Continue to generate embedding even if cache fails
      }
    }

    // Generate embedding from provider
    this.logger.debug(`Generating embedding for text: ${text.substring(0, 50)}...`);
    const embedding = await this.provider.embed(text);

    // Store in cache
    if (this.cacheEnabled) {
      try {
        await this.redisService.set(cacheKey, embedding, this.cacheTtl);
        this.logger.debug(`Cached embedding: ${cacheKey.substring(0, 16)}...`);
      } catch (error) {
        this.logger.warn(`Cache write error: ${error.message}`);
        // Continue even if cache write fails
      }
    }

    return embedding;
  }

  /**
   * Generate a cache key from text using SHA-256 hash
   */
  private getCacheKey(text: string): string {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    return `embedding:${hash}`;
  }

  /**
   * Factory method to create the appropriate provider based on type
   */
  private createProvider(type: EmbeddingProviderType): IEmbeddingProvider {
    switch (type) {
      case 'openai':
        return new OpenAIEmbeddingProvider(this.configService);
      case 'ollama':
        return new OllamaEmbeddingProvider(this.configService);
      default:
        throw new Error(
          `Unsupported embedding provider: ${type}. Supported providers: openai, ollama`,
        );
    }
  }
}

