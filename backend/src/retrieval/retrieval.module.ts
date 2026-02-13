import { Module } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { RerankerModule } from './reranker.module';

@Module({
  imports: [EmbeddingsModule, VectorStoreModule, RerankerModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}

