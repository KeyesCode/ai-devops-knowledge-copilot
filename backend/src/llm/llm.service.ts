import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMProvider, LLMStreamChunk } from './interfaces/llm-provider.interface';
import { OpenAILLMProvider } from './providers/openai-llm.provider';
import { OllamaLLMProvider } from './providers/ollama-llm.provider';

export type LLMProviderType = 'openai' | 'ollama';

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly provider: LLMProvider;

  constructor(private readonly configService: ConfigService) {
    // Get provider type from env, default to 'openai'
    const providerType = this.configService.get<LLMProviderType>(
      'LLM_PROVIDER',
      'openai',
    );

    // Initialize the appropriate provider
    this.provider = this.createProvider(providerType);

    this.logger.log(`LLMService initialized with provider: ${providerType}`);
  }

  /**
   * Stream a chat completion response
   * @param messages - Array of chat messages
   * @param systemPrompt - Optional system prompt
   * @returns Async generator yielding stream chunks
   */
  async *streamChat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    systemPrompt?: string,
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    yield* this.provider.streamChat(messages, systemPrompt);
  }

  /**
   * Factory method to create the appropriate provider based on type
   */
  private createProvider(type: LLMProviderType): LLMProvider {
    switch (type) {
      case 'openai':
        return new OpenAILLMProvider(this.configService);
      case 'ollama':
        return new OllamaLLMProvider(this.configService);
      default:
        throw new Error(
          `Unsupported LLM provider: ${type}. Supported providers: openai, ollama`,
        );
    }
  }
}

