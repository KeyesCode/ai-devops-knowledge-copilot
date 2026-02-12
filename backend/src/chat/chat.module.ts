import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [RetrievalModule, LLMModule],
  controllers: [ChatController],
})
export class ChatModule {}

