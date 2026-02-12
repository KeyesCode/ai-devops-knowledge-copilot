import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';
import { RedisService } from './redis.service';
import { OpenAIEmbeddingProvider } from './providers/openai-embedding.provider';
import { OllamaEmbeddingProvider } from './providers/ollama-embedding.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    EmbeddingService,
    RedisService,
    OpenAIEmbeddingProvider,
    OllamaEmbeddingProvider,
  ],
  exports: [EmbeddingService, RedisService],
})
export class EmbeddingsModule {}

