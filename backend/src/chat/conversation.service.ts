import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Conversation } from '../entities/conversation.entity';
import { Message, MessageRole } from '../entities/message.entity';
import { TokenEstimator } from './utils/token-estimator';

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export interface ContextWindowConfig {
  maxTokens: number; // Maximum tokens for context window
  reservedTokens: number; // Tokens reserved for system prompt and new query
  keepRecentMessages: number; // Always keep this many recent messages
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  // Default context window configuration
  // Most modern LLMs support 128k tokens, but we'll use a conservative 32k
  // Reserve 4k for system prompt and new query
  private readonly defaultConfig: ContextWindowConfig = {
    maxTokens: 32000,
    reservedTokens: 4000,
    keepRecentMessages: 5, // Always keep last 5 messages
  };

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  /**
   * Create a new conversation
   */
  async createConversation(
    userId: string,
    orgId: string,
    title?: string,
  ): Promise<Conversation> {
    const conversation = this.conversationRepository.create({
      userId,
      orgId,
      title: title || null,
      totalTokens: 0,
      messageCount: 0,
    });

    const saved = await this.conversationRepository.save(conversation);
    this.logger.log(
      `Created conversation ${saved.id} for user ${userId} in org ${orgId}`,
    );
    return saved;
  }

  /**
   * Get all conversations for a user within their org
   */
  async getConversations(
    userId: string,
    orgId: string,
    limit: number = 50,
  ): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: {
        userId,
        orgId,
      },
      order: {
        updatedAt: 'DESC',
      },
      take: limit,
    });
  }

  /**
   * Get a conversation with its messages
   * Enforces RBAC: user must belong to the conversation's org
   */
  async getConversationWithMessages(
    conversationId: string,
    userId: string,
    orgId: string,
  ): Promise<ConversationWithMessages> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ['messages'],
      order: {
        messages: {
          createdAt: 'ASC',
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${conversationId} not found`,
      );
    }

    // RBAC check: ensure user belongs to the conversation's org
    if (conversation.orgId !== orgId) {
      throw new ForbiddenException(
        'You do not have access to this conversation',
      );
    }

    // Additional check: ensure user owns the conversation (or is admin)
    // For now, we'll allow any user in the org to access any conversation
    // You can add stricter ownership checks if needed

    return conversation;
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    citations?: Array<{
      chunkId: string;
      documentId: string;
      documentTitle: string | null;
      sourceId: string;
      similarity: number;
      content: string;
    }>,
    userId?: string,
    orgId?: string,
  ): Promise<Message> {
    // Verify conversation exists and user has access
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${conversationId} not found`,
      );
    }

    // RBAC check if userId/orgId provided
    if (userId && orgId) {
      if (conversation.orgId !== orgId) {
        throw new ForbiddenException(
          'You do not have access to this conversation',
        );
      }
    }

    // Estimate token count
    const tokenCount = TokenEstimator.estimate(content);

    // Create message
    const message = this.messageRepository.create({
      conversationId,
      role,
      content,
      tokenCount,
      citations: citations || null,
    });

    const saved = await this.messageRepository.save(message);

    // Update conversation metadata
    await this.conversationRepository.update(conversationId, {
      totalTokens: conversation.totalTokens + tokenCount,
      messageCount: conversation.messageCount + 1,
      updatedAt: new Date(),
    });

    this.logger.debug(
      `Added ${role} message to conversation ${conversationId} (${tokenCount} tokens)`,
    );

    return saved;
  }

  /**
   * Update conversation title
   */
  async updateTitle(
    conversationId: string,
    title: string,
    userId: string,
    orgId: string,
  ): Promise<Conversation> {
    const conversation = await this.getConversationWithMessages(
      conversationId,
      userId,
      orgId,
    );

    conversation.title = title;
    return this.conversationRepository.save(conversation);
  }

  /**
   * Delete a conversation (cascades to messages)
   */
  async deleteConversation(
    conversationId: string,
    userId: string,
    orgId: string,
  ): Promise<void> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${conversationId} not found`,
      );
    }

    if (conversation.orgId !== orgId) {
      throw new ForbiddenException(
        'You do not have access to this conversation',
      );
    }

    await this.conversationRepository.remove(conversation);
    this.logger.log(`Deleted conversation ${conversationId}`);
  }

  /**
   * Get conversation history optimized for context window
   * Returns messages that fit within the token budget
   */
  async getOptimizedHistory(
    conversationId: string,
    userId: string,
    orgId: string,
    config?: Partial<ContextWindowConfig>,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const conversation = await this.getConversationWithMessages(
      conversationId,
      userId,
      orgId,
    );

    const finalConfig = { ...this.defaultConfig, ...config };
    const availableTokens =
      finalConfig.maxTokens - finalConfig.reservedTokens;

    const messages = conversation.messages.filter(
      (m) => m.role !== MessageRole.SYSTEM,
    );

    if (messages.length === 0) {
      return [];
    }

    // Always keep the most recent messages
    const recentMessages = messages.slice(-finalConfig.keepRecentMessages);
    const olderMessages = messages.slice(0, -finalConfig.keepRecentMessages);

    // Calculate tokens for recent messages
    let usedTokens = TokenEstimator.estimateMessages(
      recentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    );

    // Add older messages from newest to oldest until we hit the limit
    const selectedMessages: Message[] = [...recentMessages];
    for (let i = olderMessages.length - 1; i >= 0; i--) {
      const msg = olderMessages[i];
      const msgTokens = (msg.tokenCount || TokenEstimator.estimate(msg.content)) + 10;

      if (usedTokens + msgTokens <= availableTokens) {
        selectedMessages.unshift(msg);
        usedTokens += msgTokens;
      } else {
        // Stop when we can't fit more messages
        break;
      }
    }

    this.logger.debug(
      `Optimized history: ${selectedMessages.length}/${messages.length} messages, ~${usedTokens} tokens`,
    );

    return selectedMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  }

  /**
   * Generate a title for a conversation based on the first user message
   */
  async generateTitle(conversationId: string): Promise<string> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ['messages'],
      order: {
        messages: {
          createdAt: 'ASC',
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${conversationId} not found`,
      );
    }

    // Find first user message
    const firstUserMessage = conversation.messages.find(
      (m) => m.role === MessageRole.USER,
    );

    if (!firstUserMessage) {
      return 'New Conversation';
    }

    // Generate a title from the first message (first 50 chars)
    const content = firstUserMessage.content.trim();
    const title = content.substring(0, 50).replace(/\n/g, ' ').trim();

    return content.length > 50 ? `${title}...` : title;
  }
}

