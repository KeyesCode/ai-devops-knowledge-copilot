import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMProvider, LLMStreamChunk } from '../interfaces/llm-provider.interface';

@Injectable()
export class OllamaLLMProvider implements LLMProvider {
  private readonly logger = new Logger(OllamaLLMProvider.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    // Default to localhost:11434, can be overridden via env
    this.baseUrl = this.configService.get<string>(
      'OLLAMA_BASE_URL',
      'http://localhost:11434',
    );

    // Default to llama3, can be overridden via env
    // Common models: llama3, llama3.1, llama2, mistral, codellama
    this.model = this.configService.get<string>(
      'OLLAMA_LLM_MODEL',
      'llama3',
    );

    this.logger.log(
      `Initialized Ollama LLM provider with model: ${this.model} at ${this.baseUrl}`,
    );
  }

  async *streamChat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    systemPrompt?: string,
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    try {
      // Build messages array with optional system prompt
      const chatMessages: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
      }> = [];

      if (systemPrompt) {
        chatMessages.push({
          role: 'system',
          content: systemPrompt,
        });
      }

      // Add user/assistant messages
      chatMessages.push(...messages);

      // Ollama API expects a different format
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: chatMessages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      if (!response.body) {
        throw new Error('No response body from Ollama');
      }

      // Stream the response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            yield {
              content: '',
              done: true,
            };
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;

            try {
              const data = JSON.parse(line);
              const content = data.message?.content || '';
              if (content) {
                yield {
                  content,
                  done: false,
                };
              }

              if (data.done) {
                yield {
                  content: '',
                  done: true,
                };
                return;
              }
            } catch (parseError) {
              // Skip invalid JSON lines
              this.logger.debug(`Failed to parse line: ${line}`);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      this.logger.error(
        `Failed to stream chat completion with Ollama: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

