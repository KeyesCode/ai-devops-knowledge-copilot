import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RetrievalService } from '../retrieval/retrieval.service';
import { LLMService } from '../llm/llm.service';
import { EvalService } from './eval.service';
import { EvalRunStatus } from '../entities/eval-run.entity';

export interface EvalRunResponse {
  id: string;
  evalSetId: string;
  orgId: string;
  status: EvalRunStatus;
  totalQuestions: number;
  completedQuestions: number;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface EvalResultResponse {
  id: string;
  evalRunId: string;
  evalQuestionId: string;
  question: string;
  expectedAnswer: string;
  generatedAnswer: string;
  faithfulnessScore: number | null;
  contextRecallScore: number | null;
  contextPrecisionScore: number | null;
  createdAt: Date;
}

@Injectable()
export class EvalRunnerService {
  private readonly logger = new Logger(EvalRunnerService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly retrievalService: RetrievalService,
    private readonly llmService: LLMService,
    private readonly evalService: EvalService,
  ) {}

  /**
   * Run evaluation for an eval set
   */
  async runEvaluation(
    evalSetId: string,
    orgId: string,
    topK: number = 20,
    hybridWeight: number = 0.5,
  ): Promise<EvalRunResponse> {
    this.logger.log(`Starting evaluation for eval set: ${evalSetId}`);

    // Get eval set and verify ownership
    const evalSet = await this.evalService.getEvalSetById(evalSetId, orgId);
    const questions = await this.evalService.getQuestions(evalSetId, orgId);

    if (questions.length === 0) {
      throw new NotFoundException('No questions found in eval set');
    }

    // Create eval run with metadata
    const metadata = {
      topK,
      hybridWeight,
    };
    const runResult = await this.dataSource.query(
      `INSERT INTO eval_runs (eval_set_id, org_id, status, total_questions, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, eval_set_id, org_id, status, total_questions, completed_questions, metadata, created_at, updated_at, completed_at`,
      [evalSetId, orgId, EvalRunStatus.RUNNING, questions.length, JSON.stringify(metadata)],
    );
    const evalRunId = runResult[0].id;

    this.logger.log(`Created eval run: ${evalRunId} with ${questions.length} questions`);

    // Process questions sequentially
    let completedCount = 0;
    for (const question of questions) {
      try {
        await this.processQuestion(
          evalRunId,
          question.id,
          question.question,
          question.expectedAnswer,
          orgId,
          topK,
          evalSet.scopedSources || null,
          hybridWeight,
        );
        completedCount++;
        
        // Update progress
        await this.dataSource.query(
          `UPDATE eval_runs 
           SET completed_questions = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [completedCount, evalRunId],
        );
      } catch (error) {
        this.logger.error(
          `Failed to process question ${question.id}: ${error.message}`,
          error.stack,
        );
        // Continue with next question
      }
    }

    // Mark run as completed
    await this.dataSource.query(
      `UPDATE eval_runs 
       SET status = $1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [EvalRunStatus.COMPLETED, evalRunId],
    );

    this.logger.log(`Evaluation completed: ${evalRunId}`);

    return this.getEvalRunById(evalRunId, orgId);
  }

  /**
   * Process a single question through the evaluation pipeline
   */
  private async processQuestion(
    evalRunId: string,
    questionId: string,
    question: string,
    expectedAnswer: string,
    orgId: string,
    topK: number,
    scopedSources: string[] | null,
    hybridWeight: number = 0.5,
  ): Promise<void> {
    this.logger.debug(`Processing question: ${questionId}`);

    // Step 1: Run retrieval
    const retrievalResult = await this.retrievalService.retrieve(
      question,
      orgId,
      topK,
      hybridWeight,
    );

    // Filter by scoped sources if specified
    let filteredChunks = retrievalResult.chunks;
    if (scopedSources && scopedSources.length > 0) {
      filteredChunks = retrievalResult.chunks.filter((chunk) =>
        scopedSources.includes(chunk.sourceId),
      );
    }

    // Step 2: Run generation (collect LLM stream)
    const generatedAnswer = await this.generateAnswer(
      question,
      retrievalResult.context,
    );

    // Step 3: Store outputs
    const resultId = await this.storeResult(
      evalRunId,
      questionId,
      question,
      expectedAnswer,
      filteredChunks,
      generatedAnswer,
      retrievalResult.context,
    );

    // Step 4: Run LLM judge for metrics
    await this.runLLMJudge(
      resultId,
      question,
      expectedAnswer,
      generatedAnswer,
      filteredChunks,
      retrievalResult.context,
    );

    this.logger.debug(`Completed processing question: ${questionId}`);
  }

  /**
   * Generate answer using LLM (collect stream into full response)
   */
  private async generateAnswer(
    question: string,
    context: string,
  ): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(context);
    const messages = [
      {
        role: 'user' as const,
        content: question,
      },
    ];

    let fullResponse = '';
    for await (const chunk of this.llmService.streamChat(messages, systemPrompt)) {
      if (chunk.done) {
        break;
      }
      if (chunk.content) {
        fullResponse += chunk.content;
      }
    }

    return fullResponse.trim();
  }

  /**
   * Build system prompt for RAG
   */
  private buildSystemPrompt(context: string): string {
    return `You are a helpful assistant that answers questions based EXCLUSIVELY on the provided context.

CRITICAL: You MUST use ONLY the information provided in the context below. Do NOT use any external knowledge or information not present in the context. If the context doesn't contain enough information to fully answer the question, explicitly state what information is missing.

Context:
${context}

Instructions:
- Answer the question based EXCLUSIVELY on the context provided above
- Do NOT use any information outside of the provided context
- If the context doesn't contain enough information, explicitly say so
- Be concise and accurate
- Cite specific parts of the context when relevant`;
  }

  /**
   * Store evaluation result
   */
  private async storeResult(
    evalRunId: string,
    questionId: string,
    question: string,
    expectedAnswer: string,
    chunks: any[],
    generatedAnswer: string,
    context: string,
  ): Promise<string> {
    const result = await this.dataSource.query(
      `INSERT INTO eval_results (
        eval_run_id, eval_question_id, question, expected_answer,
        retrieved_chunks, generated_answer, context_used
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [
        evalRunId,
        questionId,
        question,
        expectedAnswer,
        JSON.stringify(chunks),
        generatedAnswer,
        context,
      ],
    );

    return result[0].id;
  }

  /**
   * Run LLM judge to evaluate metrics
   */
  private async runLLMJudge(
    resultId: string,
    question: string,
    expectedAnswer: string,
    generatedAnswer: string,
    chunks: any[],
    context: string,
  ): Promise<void> {
    // Run all three metrics in parallel for efficiency
    const [faithfulness, contextRecall, contextPrecision] = await Promise.all([
      this.evaluateFaithfulness(question, generatedAnswer, context),
      this.evaluateContextRecall(question, expectedAnswer, context),
      this.evaluateContextPrecision(question, context, chunks),
    ]);

    // Update result with scores
    await this.dataSource.query(
      `UPDATE eval_results 
       SET faithfulness_score = $1, faithfulness_reasoning = $2,
           context_recall_score = $3, context_recall_reasoning = $4,
           context_precision_score = $5, context_precision_reasoning = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [
        faithfulness.score,
        faithfulness.reasoning,
        contextRecall.score,
        contextRecall.reasoning,
        contextPrecision.score,
        contextPrecision.reasoning,
        resultId,
      ],
    );
  }

  /**
   * Evaluate faithfulness: Does the answer stay true to the retrieved context?
   */
  private async evaluateFaithfulness(
    question: string,
    generatedAnswer: string,
    context: string,
  ): Promise<{ score: number; reasoning: string }> {
    const prompt = `You are an evaluator assessing the faithfulness of an AI-generated answer to the provided context.

Question: ${question}

Context:
${context}

Generated Answer:
${generatedAnswer}

Evaluate whether the generated answer is faithful to the context. The answer should:
1. Only contain information present in the context
2. Not introduce information not in the context
3. Not contradict information in the context

Respond with a JSON object:
{
  "score": <number between 0.0 and 1.0>,
  "reasoning": "<brief explanation>"
}

Score guide:
- 1.0: Answer is completely faithful, all information from context
- 0.7-0.9: Mostly faithful, minor issues
- 0.4-0.6: Some faithfulness issues, some information not in context
- 0.0-0.3: Answer contradicts or contains significant information not in context`;

    const response = await this.callLLMForJudge(prompt);
    return this.parseJudgeResponse(response);
  }

  /**
   * Evaluate context recall: Did we retrieve all relevant context?
   */
  private async evaluateContextRecall(
    question: string,
    expectedAnswer: string,
    context: string,
  ): Promise<{ score: number; reasoning: string }> {
    const prompt = `You are an evaluator assessing whether the retrieved context contains all information needed to answer the question.

Question: ${question}

Expected Answer (ground truth):
${expectedAnswer}

Retrieved Context:
${context}

Evaluate whether the retrieved context contains sufficient information to answer the question correctly. Consider:
1. Does the context contain the key information from the expected answer?
2. Is there missing critical information?
3. Is the context comprehensive enough?

Respond with a JSON object:
{
  "score": <number between 0.0 and 1.0>,
  "reasoning": "<brief explanation>"
}

Score guide:
- 1.0: Context contains all necessary information
- 0.7-0.9: Context contains most necessary information
- 0.4-0.6: Context is missing some important information
- 0.0-0.3: Context is missing critical information`;

    const response = await this.callLLMForJudge(prompt);
    return this.parseJudgeResponse(response);
  }

  /**
   * Evaluate context precision: Is all retrieved context relevant?
   */
  private async evaluateContextPrecision(
    question: string,
    context: string,
    chunks: any[],
  ): Promise<{ score: number; reasoning: string }> {
    const prompt = `You are an evaluator assessing whether the retrieved context is relevant to the question.

Question: ${question}

Retrieved Context:
${context}

Number of chunks retrieved: ${chunks.length}

Evaluate whether the retrieved context is relevant to answering the question. Consider:
1. Is each chunk relevant to the question?
2. Is there irrelevant or redundant information?
3. Is the context focused and precise?

Respond with a JSON object:
{
  "score": <number between 0.0 and 1.0>,
  "reasoning": "<brief explanation>"
}

Score guide:
- 1.0: All context is highly relevant
- 0.7-0.9: Most context is relevant, minor irrelevant parts
- 0.4-0.6: Some context is irrelevant
- 0.0-0.3: Much of the context is irrelevant`;

    const response = await this.callLLMForJudge(prompt);
    return this.parseJudgeResponse(response);
  }

  /**
   * Call LLM for judge evaluation (without RAG system prompt)
   */
  private async callLLMForJudge(prompt: string): Promise<string> {
    const messages = [
      {
        role: 'user' as const,
        content: prompt,
      },
    ];

    let fullResponse = '';
    for await (const chunk of this.llmService.streamChat(messages)) {
      if (chunk.done) {
        break;
      }
      if (chunk.content) {
        fullResponse += chunk.content;
      }
    }

    return fullResponse.trim();
  }

  /**
   * Parse LLM judge response into score and reasoning
   */
  private parseJudgeResponse(response: string): { score: number; reasoning: string } {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: Math.max(0, Math.min(1, parseFloat(parsed.score) || 0)),
          reasoning: parsed.reasoning || 'No reasoning provided',
        };
      }
    } catch (error) {
      this.logger.warn(`Failed to parse judge response: ${response}`);
    }

    // Fallback: try to extract score from text
    const scoreMatch = response.match(/["']?score["']?\s*[:=]\s*([0-9.]+)/i);
    const score = scoreMatch
      ? Math.max(0, Math.min(1, parseFloat(scoreMatch[1])))
      : 0.5;

    return {
      score,
      reasoning: response.substring(0, 500) || 'Could not parse response',
    };
  }

  /**
   * Get eval run by ID
   */
  async getEvalRunById(id: string, orgId: string): Promise<EvalRunResponse> {
    const result = await this.dataSource.query(
      `SELECT id, eval_set_id, org_id, status, total_questions, completed_questions, metadata, created_at, updated_at, completed_at
       FROM eval_runs
       WHERE id = $1 AND org_id = $2`,
      [id, orgId],
    );

    if (result.length === 0) {
      throw new NotFoundException(`Eval run with ID ${id} not found`);
    }

    return this.mapEvalRunToResponse(result[0]);
  }

  /**
   * Get all eval runs for an eval set
   */
  async getEvalRuns(evalSetId: string, orgId: string): Promise<EvalRunResponse[]> {
    const results = await this.dataSource.query(
      `SELECT id, eval_set_id, org_id, status, total_questions, completed_questions, metadata, created_at, updated_at, completed_at
       FROM eval_runs
       WHERE eval_set_id = $1 AND org_id = $2
       ORDER BY created_at DESC`,
      [evalSetId, orgId],
    );

    return results.map((row: any) => this.mapEvalRunToResponse(row));
  }

  /**
   * Get results for an eval run
   */
  async getEvalResults(evalRunId: string, orgId: string): Promise<EvalResultResponse[]> {
    // Verify run belongs to org
    await this.getEvalRunById(evalRunId, orgId);

    const results = await this.dataSource.query(
      `SELECT er.id, er.eval_run_id, er.eval_question_id, er.question, er.expected_answer,
              er.generated_answer, er.faithfulness_score, er.context_recall_score,
              er.context_precision_score, er.created_at
       FROM eval_results er
       INNER JOIN eval_runs erun ON erun.id = er.eval_run_id
       WHERE er.eval_run_id = $1 AND erun.org_id = $2
       ORDER BY er.created_at ASC`,
      [evalRunId, orgId],
    );

    return results.map((row: any) => ({
      id: row.id,
      evalRunId: row.eval_run_id,
      evalQuestionId: row.eval_question_id,
      question: row.question,
      expectedAnswer: row.expected_answer,
      generatedAnswer: row.generated_answer,
      faithfulnessScore: row.faithfulness_score
        ? parseFloat(row.faithfulness_score)
        : null,
      contextRecallScore: row.context_recall_score
        ? parseFloat(row.context_recall_score)
        : null,
      contextPrecisionScore: row.context_precision_score
        ? parseFloat(row.context_precision_score)
        : null,
      createdAt: row.created_at,
    }));
  }

  private mapEvalRunToResponse(row: any): EvalRunResponse {
    return {
      id: row.id,
      evalSetId: row.eval_set_id,
      orgId: row.org_id,
      status: row.status as EvalRunStatus,
      totalQuestions: parseInt(row.total_questions, 10),
      completedQuestions: parseInt(row.completed_questions, 10),
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }
}

