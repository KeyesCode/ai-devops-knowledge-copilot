import { Readable } from 'stream';

export interface LLMStreamChunk {
  content: string;
  done: boolean;
}

export interface LLMProvider {
  /**
   * Stream a chat completion response
   * @param messages - Array of chat messages
   * @param systemPrompt - Optional system prompt
   * @returns Async generator yielding stream chunks
   */
  streamChat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    systemPrompt?: string,
  ): AsyncGenerator<LLMStreamChunk, void, unknown>;
}

