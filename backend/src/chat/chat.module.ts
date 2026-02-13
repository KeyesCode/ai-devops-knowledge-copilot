import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ConversationService } from './conversation.service';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { LLMModule } from '../llm/llm.module';
import { Conversation } from '../entities/conversation.entity';
import { Message } from '../entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message]),
    RetrievalModule,
    LLMModule,
  ],
  controllers: [ChatController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ChatModule {}

