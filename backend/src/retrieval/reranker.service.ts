import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  env,
} from '@xenova/transformers';
import { SimilaritySearchResult } from '../vector-store/vector-store.service';

// Import onnxruntime-node for Node.js backend (avoids web worker issues)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('onnxruntime-node');
} catch (e) {
  // onnxruntime-node not available, will use WASM fallback
}

// Configure transformers environment for Node.js
// Disable features that require web workers (not available in Node.js)
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = false;

// Configure backend based on environment variable (default: auto-detect)
// This is set at module load time, before service instantiation
// Check both TRANSFORMERS_BACKEND and RERANKER_BACKEND for flexibility
const backendPreference = process.env.TRANSFORMERS_BACKEND || process.env.RERANKER_BACKEND;
if (backendPreference === 'wasm') {
  // Force WASM backend (most stable cross-platform)
  // Set environment variable for @xenova/transformers to use
  if (!process.env.TRANSFORMERS_BACKEND) {
    process.env.TRANSFORMERS_BACKEND = 'wasm';
  }
}

// Force single-threaded execution to avoid web worker issues
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

export interface RerankResult extends SimilaritySearchResult {
  rerankScore: number;
  originalRank: number;
}

@Injectable()
export class RerankerService implements OnModuleInit {
  private readonly logger = new Logger(RerankerService.name);
  private model: any = null;
  private tokenizer: any = null;
  private readonly modelName: string;
  private readonly enabled: boolean;
  private readonly topK: number;
  private readonly useQuantized: boolean;
  private readonly backend: string;

  constructor(private readonly configService: ConfigService) {
    // Default to Xenova-converted model repo which includes ONNX files
    // @xenova/transformers requires ONNX files in /onnx folder (not PyTorch models)
    // Xenova/* repos are pre-converted and include model.onnx and model_quantized.onnx
    this.modelName = this.configService.get<string>(
      'RERANKER_MODEL',
      'Xenova/ms-marco-MiniLM-L-6-v2',
    );
    this.enabled = this.configService.get<string>('RERANKER_ENABLED', 'true') === 'true';
    this.topK = parseInt(
      this.configService.get<string>('RERANKER_TOP_K', '20'),
      10,
    );
    // Configuration for quantization (default: try quantized first, fallback to non-quantized)
    const quantizedConfig = this.configService.get<string>('RERANKER_QUANTIZED', 'auto');
    this.useQuantized = quantizedConfig === 'true' || quantizedConfig === 'auto';
    // Backend preference (wasm|node|auto)
    this.backend = this.configService.get<string>('RERANKER_BACKEND', 'auto');
    
    this.logger.log(
      `Reranker service initialized: enabled=${this.enabled}, model=${this.modelName}, topK=${this.topK}, quantized=${this.useQuantized}, backend=${this.backend}`,
    );
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Reranker is disabled');
      return;
    }

    this.logger.log(`Loading reranker model: ${this.modelName}...`);

    // Determine loading strategy based on configuration
    const shouldTryQuantized = this.useQuantized;
    const loadAttempts: Array<{ quantized: boolean; description: string }> = [];

    if (shouldTryQuantized) {
      loadAttempts.push({ quantized: true, description: 'quantized' });
      loadAttempts.push({ quantized: false, description: 'non-quantized' });
    } else {
      loadAttempts.push({ quantized: false, description: 'non-quantized' });
    }

    let lastError: Error | null = null;

    for (const attempt of loadAttempts) {
      try {
        this.logger.debug(`Attempting to load ${attempt.description} model...`);
        
        // Load model and tokenizer directly (not using pipeline)
        // This model outputs raw logits (relevance scores), not classification labels
        this.model = await AutoModelForSequenceClassification.from_pretrained(
          this.modelName,
          {
            quantized: attempt.quantized,
          },
        );
        this.tokenizer = await AutoTokenizer.from_pretrained(this.modelName);
        
        const backendInfo = this.backend !== 'auto' ? ` (backend: ${this.backend})` : '';
        this.logger.log(
          `✓ Reranker model loaded successfully (${attempt.description}${backendInfo})`,
        );
        
        // Run sanity check to verify reranker is working correctly
        await this.runSanityCheck();
        
        return; // Success, exit early
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Log at debug level for intermediate attempts, only warn on final failure
        if (attempt === loadAttempts[loadAttempts.length - 1]) {
          // This was the last attempt
          break;
        } else {
          // Intermediate attempt failed, try next one
          this.logger.debug(
            `${attempt.description} model failed, trying next option...`,
          );
        }
      }
    }

    // All attempts failed
    if (lastError) {
      // Extract a clean error message (avoid stack traces in production logs)
      const errorMessage = lastError.message || 'Unknown error';
      this.logger.warn(
        `Reranker model failed to load: ${errorMessage}. Retrieval will continue without reranking.`,
      );
      this.model = null;
      this.tokenizer = null;
    }
  }

  /**
   * Rerank search results using a cross-encoder model
   * Cross-encoders are more accurate than bi-encoders for reranking because
   * they can see both the query and document together during encoding.
   *
   * @param query - The user query
   * @param results - Initial search results to rerank
   * @param topK - Number of top results to return after reranking (default: uses config)
   * @returns Reranked results with rerank scores
   */
  async rerank(
    query: string,
    results: SimilaritySearchResult[],
    topK?: number,
  ): Promise<RerankResult[]> {
    if (!this.enabled || !this.model || !this.tokenizer) {
      this.logger.debug('Reranker disabled or not loaded, returning original results');
      return results.map((result, index) => ({
        ...result,
        rerankScore: result.similarity,
        originalRank: index,
      }));
    }

    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty for reranking');
    }

    if (!results || results.length === 0) {
      return [];
    }

    const returnTopK = topK || this.topK;
    const resultsToRerank = results.slice(0, Math.min(results.length, returnTopK * 2));

    this.logger.debug(
      `Reranking ${resultsToRerank.length} results for query: "${query.substring(0, 100)}..."`,
    );

    try {
      // Prepare query-document pairs for tokenization
      // The model expects arrays of queries and text_pairs (see HuggingFace example)
      const queries = resultsToRerank.map(() => query.trim());
      const documents = resultsToRerank.map((result) => result.content.trim());

      // Run reranking in batches to avoid memory issues
      const batchSize = 16; // Smaller batch size for cross-encoders (more memory intensive)
      const rerankScores: number[] = [];

      for (let i = 0; i < queries.length; i += batchSize) {
        const batchQueries = queries.slice(i, i + batchSize);
        const batchDocuments = documents.slice(i, i + batchSize);
        
        try {
          // Tokenize the batch (following HuggingFace example format)
          const features = this.tokenizer(batchQueries, {
            text_pair: batchDocuments,
            padding: true,
            truncation: true,
          });

          // Get raw logits from the model (these are relevance scores)
          const outputs = await this.model(features);
          
          // Extract logits - outputs.logits is a tensor with shape [batch_size, 1]
          // Higher logit = more relevant
          const logits = outputs.logits.data;
          
          // Convert logits to scores (normalize to [0, 1] range using sigmoid)
          // For ranking, we can use the raw logits directly, but sigmoid makes them probabilities
          const batchScores = Array.from(logits).map((logit: any) => {
            // Apply sigmoid to convert logit to probability: 1 / (1 + exp(-logit))
            // This gives us a score between 0 and 1
            return 1 / (1 + Math.exp(-logit));
          });

          // Debug: Log first batch scores
          if (i === 0 && batchScores.length > 0) {
            this.logger.debug(
              `Reranker raw logits (first 3): ${Array.from(logits).slice(0, 3).map((l: any) => l.toFixed(4)).join(', ')}`,
            );
            this.logger.debug(
              `Reranker scores (first 3): ${batchScores.slice(0, 3).map((s: number) => s.toFixed(4)).join(', ')}`,
            );
          }

          rerankScores.push(...batchScores);
        } catch (batchError) {
          this.logger.warn(
            `Batch reranking failed, using fallback scores: ${batchError.message}`,
          );
          // Add fallback scores for this batch
          for (let j = 0; j < batchQueries.length; j++) {
            rerankScores.push(0.5);
          }
        }
      }

      // Combine results with rerank scores
      const rerankedResults: RerankResult[] = resultsToRerank.map(
        (result, index) => ({
          ...result,
          rerankScore: rerankScores[index],
          originalRank: index,
        }),
      );

      // Sort by rerank score (descending)
      rerankedResults.sort((a, b) => b.rerankScore - a.rerankScore);

      // Update similarity scores to reflect rerank scores
      // Rerank scores are already in [0, 1] range (from sigmoid), but we can normalize them
      // to better utilize the full range for ranking
      const maxScore = Math.max(...rerankScores);
      const minScore = Math.min(...rerankScores);
      const scoreRange = maxScore - minScore;

      // Check if reranker is providing useful differentiation
      const uniqueScores = new Set(rerankScores.map((s) => s.toFixed(4)));
      if (uniqueScores.size === 1) {
        this.logger.warn(
          `Reranker returned identical scores (${maxScore.toFixed(4)}) for all ${rerankScores.length} results. ` +
            `This may indicate the model isn't differentiating properly. Using original similarity scores.`,
        );
      } else {
        this.logger.debug(
          `Reranker score range: [${minScore.toFixed(4)}, ${maxScore.toFixed(4)}] (${uniqueScores.size} unique values)`,
        );
      }

      rerankedResults.forEach((result) => {
        // Store original similarity before updating
        const originalSimilarity = result.similarity;
        
        // If all scores are the same, preserve original similarity ranking
        // Otherwise, normalize rerank scores to [0, 1] range for better distribution
        let finalSimilarity: number;
        if (scoreRange === 0 || scoreRange < 0.001) {
          // All rerank scores are the same - use original similarity
          finalSimilarity = originalSimilarity;
        } else {
          // Normalize rerank score to [0, 1] range to better utilize the full scale
          finalSimilarity = (result.rerankScore - minScore) / scoreRange;
        }

        result.similarity = finalSimilarity;
        result.distance = 1 - finalSimilarity;
        result.metadata = {
          ...result.metadata,
          rerankScore: result.rerankScore,
          originalRank: result.originalRank,
          originalSimilarity: originalSimilarity,
        };
      });

      // Take top K results
      const topResults = rerankedResults.slice(0, returnTopK);

      this.logger.log(
        `Reranking complete: ${topResults.length} results (from ${resultsToRerank.length} candidates)`,
      );

      if (topResults.length > 0) {
        this.logger.debug(
          `Rerank score range: [${topResults[topResults.length - 1].rerankScore.toFixed(4)}, ${topResults[0].rerankScore.toFixed(4)}]`,
        );
      }

      return topResults;
    } catch (error) {
      this.logger.error(
        `Reranking failed: ${error.message}`,
        error.stack,
      );
      // Fallback to original results on error
      return results.slice(0, returnTopK).map((result, index) => ({
        ...result,
        rerankScore: result.similarity,
        originalRank: index,
      }));
    }
  }

  /**
   * Run a sanity check to verify the reranker is working correctly
   * Tests with obviously relevant vs irrelevant passages
   */
  private async runSanityCheck(): Promise<void> {
    try {
      const query = 'How do I configure Redis in this project?';
      const relevant = 'RedisService connects to localhost:6379 and caches embeddings.';
      const irrelevant = 'This section describes baseball statistics from 1998.';

      // Tokenize and get logits directly
      this.logger.debug('Running sanity check with query-document pairs...');
      
      const features1 = this.tokenizer([query], {
        text_pair: [relevant],
        padding: true,
        truncation: true,
      });
      
      const features2 = this.tokenizer([query], {
        text_pair: [irrelevant],
        padding: true,
        truncation: true,
      });

      const [output1, output2] = await Promise.all([
        this.model(features1),
        this.model(features2),
      ]);

      // Extract logits and convert to scores
      const logit1 = output1.logits.data[0];
      const logit2 = output2.logits.data[0];
      
      const score1 = 1 / (1 + Math.exp(-logit1));
      const score2 = 1 / (1 + Math.exp(-logit2));

      this.logger.debug(
        `Sanity check: relevant logit=${logit1.toFixed(4)} (score=${score1.toFixed(4)}), irrelevant logit=${logit2.toFixed(4)} (score=${score2.toFixed(4)})`,
      );

      if (score1 > score2) {
        this.logger.log(
          `✓ Reranker sanity check passed: relevant=${score1.toFixed(4)}, irrelevant=${score2.toFixed(4)}`,
        );
      } else if (score1 === score2) {
        this.logger.warn(
          `⚠ Reranker sanity check: scores are identical (${score1.toFixed(4)}). Model may not be differentiating properly.`,
        );
      } else {
        this.logger.warn(
          `⚠ Reranker sanity check: irrelevant passage scored higher (${score2.toFixed(4)} > ${score1.toFixed(4)}). Model may be inverted or not working correctly.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Reranker sanity check failed: ${error.message}. This may indicate a configuration issue.`,
      );
    }
  }

  /**
   * Extract relevance score from reranker output
   * Handles different output formats from text-classification pipeline
   * 
   * Cross-encoder models typically output:
   * - Array: [{label: "LABEL_0", score: 0.05}, {label: "LABEL_1", score: 0.95}]
   * - Single object: {label: "LABEL_1", score: 0.95}
   * 
   * For ms-marco models, LABEL_1 is typically "relevant" and LABEL_0 is "not relevant"
   * If we only get LABEL_0, we might need to invert the score or look for LABEL_1
   */
  private extractRelevanceScore(output: any): number {
    // Normalize to array format
    const arr = Array.isArray(output) ? output : [output];

    if (arr.length === 0) {
      return 0.5; // Default fallback
    }

    // For binary classification (relevant/not-relevant):
    // - LABEL_1 typically means "relevant" (positive)
    // - LABEL_0 typically means "not relevant" (negative)
    // Prefer LABEL_1 if available, otherwise use the highest score
    const label1 = arr.find((x: any) => x.label === 'LABEL_1');
    const label0 = arr.find((x: any) => x.label === 'LABEL_0');
    
    let score = 0.5; // Default

    if (label1) {
      // We have LABEL_1 (relevant) - use its score directly
      score = typeof label1.score === 'number' ? label1.score : parseFloat(label1.score) || 0.5;
    } else if (label0 && arr.length === 1) {
      // Only LABEL_0 is present - this might mean "not relevant"
      // For ms-marco models, if we only get LABEL_0, we might need to:
      // 1. Use 1 - score (if score represents "not relevant" probability)
      // 2. Or check if the model is configured to return both labels
      const label0Score = typeof label0.score === 'number' ? label0.score : parseFloat(label0.score) || 0.5;
      
      // If score is 1.0, it might be a confidence score, not a relevance score
      // Try inverting it: if LABEL_0 with score 1.0 means "100% not relevant", 
      // then relevance = 1 - 0 = 0 (but that doesn't make sense if all are 1.0)
      
      // Actually, if all scores are 1.0, the model might not be working correctly
      // For now, use the score as-is but log a warning
      score = label0Score;
      
      // If we're getting LABEL_0 with score 1.0 consistently, the model might be broken
      // or we need to request both labels explicitly
    } else {
      // Multiple labels or other format - find the most relevant one
      const preferred =
        arr.find((x: any) => /pos|relevant|entail/i.test(x.label || '')) ??
        arr[0]; // Fallback to first result
      
      if (preferred) {
        score = typeof preferred.score === 'number' ? preferred.score : parseFloat(preferred.score) || 0.5;
      }
    }

    // Ensure score is in [0, 1] range
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Check if reranker is available and enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.model !== null && this.tokenizer !== null;
  }
}

