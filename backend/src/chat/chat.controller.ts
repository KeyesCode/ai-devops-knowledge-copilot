import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Res,
  Query,
  Logger,
  BadRequestException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { RetrievalService } from '../retrieval/retrieval.service';
import { LLMService } from '../llm/llm.service';
import { ConversationService } from './conversation.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { ChatStreamRequestDto } from './dto/chat-stream-request.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { MessageRole } from '../entities/message.entity';
import { TokenEstimator } from './utils/token-estimator';

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
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Stream chat response using Server-Sent Events (SSE)
   * POST /chat/stream
   *
   * Body:
   * {
   *   "query": "user question",
   *   "conversationId": "uuid", // optional, for persistent conversations
   *   "topK": 5, // optional, defaults to 20
   *   "conversationHistory": [] // optional, deprecated in favor of conversationId
   * }
   *
   * Headers:
   * Authorization: Bearer <jwt-token>
   *
   * Response: SSE stream with:
   * - "token" events: streaming LLM tokens
   * - "citations" event: final event with citation data
   * - "conversationId" event: ID of the conversation (created or existing)
   */
  @Post('stream')
  @UsePipes(new ValidationPipe({ transform: true }))
  async streamChat(
    @Body() dto: ChatStreamRequestDto,
    @CurrentUser() user: CurrentUserData,
    @Res() res: Response,
  ): Promise<void> {
    // Validate request
    if (!dto.query || dto.query.trim().length === 0) {
      throw new BadRequestException('query is required');
    }

    const topK = dto.topK || 20;
    const orgId = user.orgId;
    let conversationId = dto.conversationId;

    this.logger.log(
      `Stream chat request: query="${dto.query.substring(0, 100)}...", orgId=${orgId}, userId=${user.id}, topK=${topK}, conversationId=${conversationId || 'new'}`,
    );

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    try {
      // Create or get conversation
      if (!conversationId) {
        const conversation = await this.conversationService.createConversation(
          user.id,
          orgId,
        );
        conversationId = conversation.id;
        this.logger.debug(`Created new conversation: ${conversationId}`);
      }

      // Save user message
      await this.conversationService.addMessage(
        conversationId,
        MessageRole.USER,
        dto.query,
        undefined,
        user.id,
        orgId,
      );

      // Get optimized conversation history
      const conversationHistory =
        await this.conversationService.getOptimizedHistory(
          conversationId,
          user.id,
          orgId,
        );

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

      // Add conversation history (from DB or provided fallback)
      if (conversationHistory.length > 0) {
        messages.push(...conversationHistory);
      } else if (dto.conversationHistory && dto.conversationHistory.length > 0) {
        // Fallback to provided history if no DB history
        messages.push(...dto.conversationHistory);
      }

      // Add current user query (already in history, but ensure it's there)
      if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
        messages.push({
          role: 'user',
          content: dto.query,
        });
      }

      // Step 2: Stream LLM response
      this.logger.debug('Starting LLM stream...');
      let fullResponse = '';
      let tokenCount = 0;

      for await (const chunk of this.llmService.streamChat(
        messages,
        systemPrompt,
      )) {
        if (chunk.done) {
          break;
        }

        if (chunk.content) {
          fullResponse += chunk.content;
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

      // Save assistant message with citations
      await this.conversationService.addMessage(
        conversationId,
        MessageRole.ASSISTANT,
        fullResponse,
        citations,
        user.id,
        orgId,
      );

      // Generate title if this is the first message in the conversation
      const conversation = await this.conversationService.getConversationWithMessages(
        conversationId,
        user.id,
        orgId,
      );
      let updatedTitle = conversation.title;
      if (!conversation.title && conversation.messageCount === 2) {
        // First user + assistant message pair
        const title = await this.conversationService.generateTitle(conversationId);
        await this.conversationService.updateTitle(
          conversationId,
          title,
          user.id,
          orgId,
        );
        updatedTitle = title;
      }

      // Fetch updated conversation to get latest counts
      const updatedConversation = await this.conversationService.getConversationWithMessages(
        conversationId,
        user.id,
        orgId,
      );

      res.write(`event: citations\n`);
      res.write(`data: ${JSON.stringify({ citations })}\n\n`);

      // Send conversation update with latest data
      res.write(`event: conversationUpdate\n`);
      res.write(`data: ${JSON.stringify({ 
        conversationId,
        messageCount: updatedConversation.messageCount,
        title: updatedConversation.title,
        totalTokens: updatedConversation.totalTokens,
        updatedAt: updatedConversation.updatedAt,
      })}\n\n`);

      // Send conversation ID (for backwards compatibility)
      res.write(`event: conversationId\n`);
      res.write(`data: ${JSON.stringify({ conversationId })}\n\n`);

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
   * Get all conversations for the current user
   * GET /chat/conversations
   */
  @Get('conversations')
  async getConversations(
    @CurrentUser() user: CurrentUserData,
    @Query('limit') limit?: number,
  ) {
    const conversations = await this.conversationService.getConversations(
      user.id,
      user.orgId,
      limit ? parseInt(limit.toString(), 10) : 50,
    );
    return { conversations };
  }

  /**
   * Get a specific conversation with messages
   * GET /chat/conversations/:id
   */
  @Get('conversations/:id')
  async getConversation(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const conversation =
      await this.conversationService.getConversationWithMessages(
        id,
        user.id,
        user.orgId,
      );
    return { conversation };
  }

  /**
   * Create a new conversation
   * POST /chat/conversations
   */
  @Post('conversations')
  @UsePipes(new ValidationPipe({ transform: true }))
  async createConversation(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const conversation = await this.conversationService.createConversation(
      user.id,
      user.orgId,
      dto.title,
    );
    return { conversation };
  }

  /**
   * Update conversation title
   * PUT /chat/conversations/:id
   */
  @Put('conversations/:id')
  @UsePipes(new ValidationPipe({ transform: true }))
  async updateConversation(
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const conversation = await this.conversationService.updateTitle(
      id,
      dto.title,
      user.id,
      user.orgId,
    );
    return { conversation };
  }

  /**
   * Delete a conversation
   * DELETE /chat/conversations/:id
   */
  @Delete('conversations/:id')
  async deleteConversation(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.conversationService.deleteConversation(id, user.id, user.orgId);
    return { success: true };
  }

  /**
   * Build system prompt with retrieved context
   */
  private buildSystemPrompt(context: string): string {
    if (!context || context.trim().length === 0) {
      return `You are a helpful AI assistant. Answer questions based on your knowledge. If you don't know something, say so.`;
    }

    return `You are a helpful AI assistant that answers questions based EXCLUSIVELY on the provided context from documentation.

CRITICAL: You MUST use ONLY the information provided in the context below. Do NOT use any external knowledge or information not present in the context. If the context doesn't contain enough information to fully answer the question, explicitly state what information is missing.

Context:
${context}

Instructions:
- Answer the question based EXCLUSIVELY on the context provided above
- Do NOT use any information outside of the provided context
- If the context doesn't contain relevant information, explicitly say so
- Cite specific parts of the context when relevant
- Be concise and accurate
- Use natural language and be helpful`;
  }
}

