import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LLMProvider, LLMStreamChunk } from '../interfaces/llm-provider.interface';

@Injectable()
export class OpenAILLMProvider implements LLMProvider {
  private readonly logger = new Logger(OpenAILLMProvider.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI LLM provider');
    }

    this.client = new OpenAI({
      apiKey,
    });

    // Default to gpt-4o-mini, can be overridden via env
    this.model = this.configService.get<string>(
      'OPENAI_LLM_MODEL',
      'gpt-4o-mini',
    );
    this.logger.log(`Initialized OpenAI LLM provider with model: ${this.model}`);
  }

  async *streamChat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    systemPrompt?: string,
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    try {
      // Build messages array with optional system prompt
      const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        [];

      if (systemPrompt) {
        chatMessages.push({
          role: 'system',
          content: systemPrompt,
        });
      }

      // Add user/assistant messages
      chatMessages.push(...messages);

      // Create streaming completion
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: chatMessages,
        stream: true,
        temperature: 0.7,
      });

      // Stream chunks
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield {
            content,
            done: false,
          };
        }

        // Check if this is the final chunk
        const finishReason = chunk.choices[0]?.finish_reason;
        if (finishReason) {
          yield {
            content: '',
            done: true,
          };
          break;
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to stream chat completion with OpenAI: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

