import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { EvalService, EvalSetResponse, EvalQuestionResponse } from './eval.service';
import { EvalRunnerService, EvalRunResponse, EvalResultResponse } from './eval-runner.service';
import { CreateEvalSetDto, CreateEvalQuestionDto } from './dto/create-eval-set.dto';
import { UpdateEvalSetDto, UpdateEvalQuestionDto } from './dto/update-eval-set.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../entities/user.entity';

@Controller('eval')
@UseGuards(RolesGuard)
export class EvalController {
  private readonly logger = new Logger(EvalController.name);

  constructor(
    private readonly evalService: EvalService,
    private readonly evalRunnerService: EvalRunnerService,
  ) {}

  /**
   * Create a new eval set
   * POST /eval/sets
   */
  @Post('sets')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.USER)
  async createEvalSet(
    @Body() dto: CreateEvalSetDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<EvalSetResponse> {
    this.logger.log(`Creating eval set: ${dto.name} by user ${user.id}`);
    return this.evalService.createEvalSet(dto, user.orgId);
  }

  /**
   * Get all eval sets for the current organization
   * GET /eval/sets
   */
  @Get('sets')
  @Roles(UserRole.ADMIN, UserRole.USER)
  async getEvalSets(
    @CurrentUser() user: CurrentUserData,
  ): Promise<EvalSetResponse[]> {
    return this.evalService.getEvalSets(user.orgId);
  }

  /**
   * Get a single eval set by ID
   * GET /eval/sets/:id
   */
  @Get('sets/:id')
  @Roles(UserRole.ADMIN, UserRole.USER)
  async getEvalSetById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<EvalSetResponse> {
    return this.evalService.getEvalSetById(id, user.orgId);
  }

  /**
   * Update an eval set
   * PUT /eval/sets/:id
   */
  @Put('sets/:id')
  @Roles(UserRole.ADMIN)
  async updateEvalSet(
    @Param('id') id: string,
    @Body() dto: UpdateEvalSetDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<EvalSetResponse> {
    this.logger.log(`Updating eval set: ${id} by user ${user.id}`);
    return this.evalService.updateEvalSet(id, dto, user.orgId);
  }

  /**
   * Delete an eval set
   * DELETE /eval/sets/:id
   */
  @Delete('sets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN)
  async deleteEvalSet(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<void> {
    this.logger.log(`Deleting eval set: ${id} by user ${user.id}`);
    await this.evalService.deleteEvalSet(id, user.orgId);
  }

  /**
   * Get all questions for an eval set
   * GET /eval/sets/:evalSetId/questions
   */
  @Get('sets/:evalSetId/questions')
  @Roles(UserRole.ADMIN, UserRole.USER)
  async getQuestions(
    @Param('evalSetId') evalSetId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<EvalQuestionResponse[]> {
    return this.evalService.getQuestions(evalSetId, user.orgId);
  }

  /**
   * Get a single question by ID
   * GET /eval/sets/:evalSetId/questions/:questionId
   */
  @Get('sets/:evalSetId/questions/:questionId')
  @Roles(UserRole.ADMIN, UserRole.USER)
  async getQuestionById(
    @Param('evalSetId') evalSetId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<EvalQuestionResponse> {
    return this.evalService.getQuestionById(questionId, evalSetId, user.orgId);
  }

  /**
   * Create questions for an eval set
   * POST /eval/sets/:evalSetId/questions
   */
  @Post('sets/:evalSetId/questions')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  async createQuestions(
    @Param('evalSetId') evalSetId: string,
    @Body() dto: CreateEvalQuestionDto[],
    @CurrentUser() user: CurrentUserData,
  ): Promise<EvalQuestionResponse[]> {
    this.logger.log(`Creating ${dto.length} questions for eval set: ${evalSetId}`);
    return this.evalService.createQuestions(evalSetId, dto);
  }

  /**
   * Update a question
   * PUT /eval/sets/:evalSetId/questions/:questionId
   */
  @Put('sets/:evalSetId/questions/:questionId')
  @Roles(UserRole.ADMIN)
  async updateQuestion(
    @Param('evalSetId') evalSetId: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateEvalQuestionDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<EvalQuestionResponse> {
    this.logger.log(`Updating question: ${questionId} in eval set: ${evalSetId}`);
    return this.evalService.updateQuestion(questionId, evalSetId, dto, user.orgId);
  }

  /**
   * Delete a question
   * DELETE /eval/sets/:evalSetId/questions/:questionId
   */
  @Delete('sets/:evalSetId/questions/:questionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN)
  async deleteQuestion(
    @Param('evalSetId') evalSetId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<void> {
    this.logger.log(`Deleting question: ${questionId} from eval set: ${evalSetId}`);
    await this.evalService.deleteQuestion(questionId, evalSetId, user.orgId);
  }

  /**
   * Run evaluation for an eval set
   * POST /eval/sets/:evalSetId/run
   */
  @Post('sets/:evalSetId/run')
  @Roles(UserRole.ADMIN)
  async runEvaluation(
    @Param('evalSetId') evalSetId: string,
    @CurrentUser() user: CurrentUserData,
    @Query('topK') topK?: string,
  ): Promise<EvalRunResponse> {
    this.logger.log(`Starting evaluation for eval set: ${evalSetId}`);
    const topKValue = topK ? parseInt(topK, 10) : 10;
    return this.evalRunnerService.runEvaluation(evalSetId, user.orgId, topKValue);
  }

  /**
   * Get all eval runs for an eval set
   * GET /eval/sets/:evalSetId/runs
   */
  @Get('sets/:evalSetId/runs')
  @Roles(UserRole.ADMIN, UserRole.USER)
  async getEvalRuns(
    @Param('evalSetId') evalSetId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<EvalRunResponse[]> {
    return this.evalRunnerService.getEvalRuns(evalSetId, user.orgId);
  }

  /**
   * Get a single eval run by ID
   * GET /eval/runs/:runId
   */
  @Get('runs/:runId')
  @Roles(UserRole.ADMIN, UserRole.USER)
  async getEvalRun(
    @Param('runId') runId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<EvalRunResponse> {
    return this.evalRunnerService.getEvalRunById(runId, user.orgId);
  }

  /**
   * Get results for an eval run
   * GET /eval/runs/:runId/results
   */
  @Get('runs/:runId/results')
  @Roles(UserRole.ADMIN, UserRole.USER)
  async getEvalResults(
    @Param('runId') runId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<EvalResultResponse[]> {
    return this.evalRunnerService.getEvalResults(runId, user.orgId);
  }
}

