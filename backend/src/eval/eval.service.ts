import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateEvalSetDto, CreateEvalQuestionDto } from './dto/create-eval-set.dto';
import { UpdateEvalSetDto, UpdateEvalQuestionDto } from './dto/update-eval-set.dto';

export interface EvalSetResponse {
  id: string;
  name: string;
  description: string | null;
  orgId: string;
  scopedSources: string[] | null;
  metadata: Record<string, any>;
  questionCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvalQuestionResponse {
  id: string;
  evalSetId: string;
  question: string;
  expectedAnswer: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class EvalService {
  private readonly logger = new Logger(EvalService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create a new eval set with optional questions
   */
  async createEvalSet(
    dto: CreateEvalSetDto,
    orgId: string,
  ): Promise<EvalSetResponse> {
    this.logger.log(`Creating eval set: ${dto.name} for org: ${orgId}`);

    const result = await this.dataSource.query(
      `INSERT INTO eval_sets (name, description, org_id, scoped_sources, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, org_id, scoped_sources, metadata, created_at, updated_at`,
      [
        dto.name,
        dto.description || null,
        orgId,
        dto.scopedSources || null,
        JSON.stringify(dto.metadata || {}),
      ],
    );

    const evalSet = result[0];

    // Create questions if provided
    if (dto.questions && dto.questions.length > 0) {
      await this.createQuestions(evalSet.id, dto.questions);
    }

    return this.mapEvalSetToResponse(evalSet);
  }

  /**
   * Get all eval sets for an organization
   */
  async getEvalSets(orgId: string): Promise<EvalSetResponse[]> {
    const results = await this.dataSource.query(
      `SELECT 
        es.id,
        es.name,
        es.description,
        es.org_id,
        es.scoped_sources,
        es.metadata,
        es.created_at,
        es.updated_at,
        COUNT(eq.id) as question_count
       FROM eval_sets es
       LEFT JOIN eval_questions eq ON eq.eval_set_id = es.id
       WHERE es.org_id = $1
       GROUP BY es.id, es.name, es.description, es.org_id, es.scoped_sources, es.metadata, es.created_at, es.updated_at
       ORDER BY es.created_at DESC`,
      [orgId],
    );

    return results.map((row: any) => ({
      ...this.mapEvalSetToResponse(row),
      questionCount: parseInt(row.question_count, 10),
    }));
  }

  /**
   * Get a single eval set by ID
   */
  async getEvalSetById(id: string, orgId: string): Promise<EvalSetResponse> {
    const result = await this.dataSource.query(
      `SELECT 
        es.id,
        es.name,
        es.description,
        es.org_id,
        es.scoped_sources,
        es.metadata,
        es.created_at,
        es.updated_at,
        COUNT(eq.id) as question_count
       FROM eval_sets es
       LEFT JOIN eval_questions eq ON eq.eval_set_id = es.id
       WHERE es.id = $1 AND es.org_id = $2
       GROUP BY es.id, es.name, es.description, es.org_id, es.scoped_sources, es.metadata, es.created_at, es.updated_at`,
      [id, orgId],
    );

    if (result.length === 0) {
      throw new NotFoundException(`Eval set with ID ${id} not found`);
    }

    return {
      ...this.mapEvalSetToResponse(result[0]),
      questionCount: parseInt(result[0].question_count, 10),
    };
  }

  /**
   * Update an eval set
   */
  async updateEvalSet(
    id: string,
    dto: UpdateEvalSetDto,
    orgId: string,
  ): Promise<EvalSetResponse> {
    // Verify ownership
    await this.getEvalSetById(id, orgId);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(dto.name);
    }
    if (dto.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(dto.description || null);
    }
    if (dto.scopedSources !== undefined) {
      updates.push(`scoped_sources = $${paramIndex++}`);
      values.push(dto.scopedSources || null);
    }
    if (dto.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(dto.metadata));
    }

    if (updates.length === 0) {
      return this.getEvalSetById(id, orgId);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, orgId);

    await this.dataSource.query(
      `UPDATE eval_sets 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND org_id = $${paramIndex++}`,
      values,
    );

    return this.getEvalSetById(id, orgId);
  }

  /**
   * Delete an eval set
   */
  async deleteEvalSet(id: string, orgId: string): Promise<void> {
    // Verify ownership
    await this.getEvalSetById(id, orgId);

    await this.dataSource.query(
      `DELETE FROM eval_sets WHERE id = $1 AND org_id = $2`,
      [id, orgId],
    );

    this.logger.log(`Deleted eval set: ${id}`);
  }

  /**
   * Get all questions for an eval set
   */
  async getQuestions(evalSetId: string, orgId: string): Promise<EvalQuestionResponse[]> {
    // Verify eval set exists and belongs to org
    await this.getEvalSetById(evalSetId, orgId);

    const results = await this.dataSource.query(
      `SELECT id, eval_set_id, question, expected_answer, metadata, created_at, updated_at
       FROM eval_questions
       WHERE eval_set_id = $1
       ORDER BY created_at ASC`,
      [evalSetId],
    );

    return results.map((row: any) => this.mapQuestionToResponse(row));
  }

  /**
   * Get a single question by ID
   */
  async getQuestionById(
    questionId: string,
    evalSetId: string,
    orgId: string,
  ): Promise<EvalQuestionResponse> {
    // Verify eval set belongs to org
    await this.getEvalSetById(evalSetId, orgId);

    const result = await this.dataSource.query(
      `SELECT id, eval_set_id, question, expected_answer, metadata, created_at, updated_at
       FROM eval_questions
       WHERE id = $1 AND eval_set_id = $2`,
      [questionId, evalSetId],
    );

    if (result.length === 0) {
      throw new NotFoundException(`Question with ID ${questionId} not found`);
    }

    return this.mapQuestionToResponse(result[0]);
  }

  /**
   * Create questions for an eval set
   */
  async createQuestions(
    evalSetId: string,
    questions: CreateEvalQuestionDto[],
  ): Promise<EvalQuestionResponse[]> {
    const created: EvalQuestionResponse[] = [];

    for (const q of questions) {
      const result = await this.dataSource.query(
        `INSERT INTO eval_questions (eval_set_id, question, expected_answer, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING id, eval_set_id, question, expected_answer, metadata, created_at, updated_at`,
        [
          evalSetId,
          q.question,
          q.expectedAnswer,
          JSON.stringify(q.metadata || {}),
        ],
      );

      created.push(this.mapQuestionToResponse(result[0]));
    }

    return created;
  }

  /**
   * Update a question
   */
  async updateQuestion(
    questionId: string,
    evalSetId: string,
    dto: UpdateEvalQuestionDto,
    orgId: string,
  ): Promise<EvalQuestionResponse> {
    // Verify eval set belongs to org
    await this.getEvalSetById(evalSetId, orgId);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.question !== undefined) {
      updates.push(`question = $${paramIndex++}`);
      values.push(dto.question);
    }
    if (dto.expectedAnswer !== undefined) {
      updates.push(`expected_answer = $${paramIndex++}`);
      values.push(dto.expectedAnswer);
    }
    if (dto.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(dto.metadata));
    }

    if (updates.length === 0) {
      return this.getQuestionById(questionId, evalSetId, orgId);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(questionId, evalSetId);

    await this.dataSource.query(
      `UPDATE eval_questions 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND eval_set_id = $${paramIndex++}`,
      values,
    );

    return this.getQuestionById(questionId, evalSetId, orgId);
  }

  /**
   * Delete a question
   */
  async deleteQuestion(
    questionId: string,
    evalSetId: string,
    orgId: string,
  ): Promise<void> {
    // Verify eval set belongs to org
    await this.getEvalSetById(evalSetId, orgId);

    const result = await this.dataSource.query(
      `DELETE FROM eval_questions 
       WHERE id = $1 AND eval_set_id = $2
       RETURNING id`,
      [questionId, evalSetId],
    );

    if (result.length === 0) {
      throw new NotFoundException(`Question with ID ${questionId} not found`);
    }
  }

  private mapEvalSetToResponse(row: any): EvalSetResponse {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      orgId: row.org_id,
      scopedSources: row.scoped_sources,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapQuestionToResponse(row: any): EvalQuestionResponse {
    return {
      id: row.id,
      evalSetId: row.eval_set_id,
      question: row.question,
      expectedAnswer: row.expected_answer,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

