import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LLMService } from './llm.service';
import { OpenAILLMProvider } from './providers/openai-llm.provider';
import { OllamaLLMProvider } from './providers/ollama-llm.provider';

@Module({
  imports: [ConfigModule],
  providers: [LLMService, OpenAILLMProvider, OllamaLLMProvider],
  exports: [LLMService],
})
export class LLMModule {}

