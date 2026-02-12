import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('REDIS_ENABLED', true);
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('Redis is disabled, caching will be skipped');
      return;
    }

    try {
      const host = this.configService.get<string>('REDIS_HOST', 'localhost');
      const port = this.configService.get<number>('REDIS_PORT', 6379);

      this.client = new Redis({
        host,
        port,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });

      this.client.on('error', (error) => {
        this.logger.error(`Redis connection error: ${error.message}`);
      });

      this.client.on('connect', () => {
        this.logger.log(`Connected to Redis at ${host}:${port}`);
      });

      // Test connection
      await this.client.ping();
    } catch (error) {
      this.logger.error(`Failed to initialize Redis: ${error.message}`);
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis connection closed');
    }
  }

  /**
   * Get a value from Redis cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.warn(`Redis get error for key ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Set a value in Redis cache with TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      this.logger.warn(`Redis set error for key ${key}: ${error.message}`);
      // Don't throw - allow service to continue without cache
    }
  }

  /**
   * Delete a key from Redis
   */
  async delete(key: string): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(`Redis delete error for key ${key}: ${error.message}`);
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.enabled && this.client !== null;
  }
}

