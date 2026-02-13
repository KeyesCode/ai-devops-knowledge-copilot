/**
 * Simple token estimation utility
 * Uses a rough approximation: ~4 characters per token for English text
 * This is a conservative estimate that works reasonably well for most LLMs
 */
export class TokenEstimator {
  /**
   * Estimate token count for a given text
   * Uses approximation: ~4 characters per token (conservative estimate)
   */
  static estimate(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }
    // Rough approximation: 4 characters per token
    // This is conservative and works well for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate tokens for an array of messages
   */
  static estimateMessages(
    messages: Array<{ role: string; content: string }>,
  ): number {
    return messages.reduce((total, msg) => {
      // Add overhead for role and formatting (roughly 10 tokens per message)
      return total + this.estimate(msg.content) + 10;
    }, 0);
  }

  /**
   * Estimate tokens for system prompt
   */
  static estimateSystemPrompt(prompt: string): number {
    return this.estimate(prompt);
  }
}

