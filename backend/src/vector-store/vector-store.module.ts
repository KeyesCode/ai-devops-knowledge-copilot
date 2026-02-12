import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VectorStoreService } from './vector-store.service';
import { BM25SearchService } from './bm25-search.service';

@Module({
  imports: [TypeOrmModule],
  providers: [VectorStoreService, BM25SearchService],
  exports: [VectorStoreService, BM25SearchService],
})
export class VectorStoreModule {}
