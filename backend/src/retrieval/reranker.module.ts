import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RerankerService } from './reranker.service';

@Module({
  imports: [ConfigModule],
  providers: [RerankerService],
  exports: [RerankerService],
})
export class RerankerModule {}

