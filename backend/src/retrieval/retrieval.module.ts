import { Module } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';

@Module({
  imports: [EmbeddingsModule, VectorStoreModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}

