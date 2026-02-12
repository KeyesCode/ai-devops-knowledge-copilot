import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvalController } from './eval.controller';
import { EvalService } from './eval.service';
import { EvalRunnerService } from './eval-runner.service';
import { EvalSet } from '../entities/eval-set.entity';
import { EvalQuestion } from '../entities/eval-question.entity';
import { EvalRun } from '../entities/eval-run.entity';
import { EvalResult } from '../entities/eval-result.entity';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EvalSet, EvalQuestion, EvalRun, EvalResult]),
    RetrievalModule,
    LLMModule,
  ],
  controllers: [EvalController],
  providers: [EvalService, EvalRunnerService],
  exports: [EvalService, EvalRunnerService],
})
export class EvalModule {}

