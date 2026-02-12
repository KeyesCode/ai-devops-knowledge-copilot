/**
 * Interface for embedding providers
 * Allows for provider-agnostic embedding generation
 */
export interface IEmbeddingProvider {
  /**
   * Generate embeddings for the given text
   * @param text - The text to embed
   * @returns Promise resolving to a vector array
   */
  embed(text: string): Promise<number[]>;
}

