import {
  Controller,
  Post,
  Body,
  Res,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { RetrievalService } from '../retrieval/retrieval.service';
import { LLMService } from '../llm/llm.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator';

export interface ChatStreamRequest {
  query: string;
  topK?: number;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface Citation {
  chunkId: string;
  documentId: string;
  documentTitle: string | null;
  sourceId: string;
  similarity: number;
  content: string;
}

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly retrievalService: RetrievalService,
    private readonly llmService: LLMService,
  ) {}

  /**
   * Stream chat response using Server-Sent Events (SSE)
   * POST /chat/stream
   *
   * Body:
   * {
   *   "query": "user question",
   *   "topK": 5, // optional, defaults to 10
   *   "conversationHistory": [] // optional
   * }
   *
   * Headers:
   * Authorization: Bearer <jwt-token>
   *
   * Response: SSE stream with:
   * - "token" events: streaming LLM tokens
   * - "citations" event: final event with citation data
   */
  @Post('stream')
  async streamChat(
    @Body() dto: ChatStreamRequest,
    @CurrentUser() user: CurrentUserData,
    @Res() res: Response,
  ): Promise<void> {
    // Validate request
    if (!dto.query || dto.query.trim().length === 0) {
      throw new BadRequestException('query is required');
    }

    const topK = dto.topK || 10;
    const orgId = user.orgId;

    this.logger.log(
      `Stream chat request: query="${dto.query.substring(0, 100)}...", orgId=${orgId}, userId=${user.id}, topK=${topK}`,
    );

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    try {
      // Step 1: Retrieve context using RAG
      this.logger.debug('Retrieving context...');
      const retrievalResult = await this.retrievalService.retrieve(
        dto.query,
        orgId,
        topK,
      );

      this.logger.log(
        `Retrieved ${retrievalResult.chunks.length} chunks with avg similarity: ${retrievalResult.metadata.avgSimilarity.toFixed(4)}`,
      );

      // Build system prompt with context
      const systemPrompt = this.buildSystemPrompt(retrievalResult.context);

      // Build messages array
      const messages: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
      }> = [];

      // Add conversation history if provided
      if (dto.conversationHistory && dto.conversationHistory.length > 0) {
        messages.push(...dto.conversationHistory);
      }

      // Add current user query
      messages.push({
        role: 'user',
        content: dto.query,
      });

      // Step 2: Stream LLM response
      this.logger.debug('Starting LLM stream...');
      let tokenCount = 0;

      for await (const chunk of this.llmService.streamChat(
        messages,
        systemPrompt,
      )) {
        if (chunk.done) {
          break;
        }

        if (chunk.content) {
          tokenCount++;
          // Emit token as SSE event
          res.write(`event: token\n`);
          res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        }
      }

      this.logger.log(`Streamed ${tokenCount} tokens`);

      // Step 3: Emit citations event at the end
      const citations: Citation[] = retrievalResult.chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        sourceId: chunk.sourceId,
        similarity: chunk.similarity,
        content: chunk.content,
      }));

      this.logger.debug(`Emitting citations event with ${citations.length} citations`);

      res.write(`event: citations\n`);
      res.write(`data: ${JSON.stringify({ citations })}\n\n`);

      // Send done event
      res.write(`event: done\n`);
      res.write(`data: ${JSON.stringify({ success: true })}\n\n`);

      res.end();
    } catch (error) {
      this.logger.error(
        `Error in stream chat: ${error.message}`,
        error.stack,
      );

      // Send error event
      res.write(`event: error\n`);
      res.write(
        `data: ${JSON.stringify({ error: error.message || 'Internal server error' })}\n\n`,
      );
      res.end();
    }
  }

  /**
   * Build system prompt with retrieved context
   */
  private buildSystemPrompt(context: string): string {
    if (!context || context.trim().length === 0) {
      return `You are a helpful AI assistant. Answer questions based on your knowledge. If you don't know something, say so.`;
    }

    return `You are a helpful AI assistant that answers questions based on the provided context from documentation.

Use the following context to answer the user's question. If the context doesn't contain enough information to answer the question, say so. Cite specific parts of the context when relevant.

Context:
${context}

Instructions:
- Answer the question based on the context provided above
- Be concise and accurate
- If the context doesn't contain relevant information, say so
- Use natural language and be helpful`;
  }
}

