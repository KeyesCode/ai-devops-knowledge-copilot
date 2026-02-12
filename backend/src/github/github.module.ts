import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { GitHubController } from './github.controller';
import { GitHubService } from './github.service';
import { GitHubIngestionService } from './github-ingestion.service';
import { DocumentService } from './document.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';

@Module({
  imports: [
    TypeOrmModule,
    ConfigModule,
    EmbeddingsModule,
    VectorStoreModule,
  ],
  controllers: [GitHubController],
  providers: [
    GitHubService,
    GitHubIngestionService,
    DocumentService,
  ],
  exports: [GitHubIngestionService],
})
export class GitHubModule {}

