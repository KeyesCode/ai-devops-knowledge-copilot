import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { EvalRun } from './eval-run.entity';
import { EvalQuestion } from './eval-question.entity';

@Entity('eval_results')
export class EvalResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'eval_run_id', type: 'uuid' })
  evalRunId: string;

  @ManyToOne(() => EvalRun, (run) => run.results, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'eval_run_id' })
  evalRun: EvalRun;

  @Column({ name: 'eval_question_id', type: 'uuid' })
  evalQuestionId: string;

  @ManyToOne(() => EvalQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eval_question_id' })
  evalQuestion: EvalQuestion;

  @Column({ type: 'text' })
  question: string;

  @Column({ name: 'expected_answer', type: 'text' })
  expectedAnswer: string;

  @Column({ name: 'retrieved_chunks', type: 'jsonb', default: [] })
  retrievedChunks: any[];

  @Column({ name: 'generated_answer', type: 'text' })
  generatedAnswer: string;

  @Column({ name: 'context_used', type: 'text' })
  contextUsed: string;

  @Column({ name: 'faithfulness_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  faithfulnessScore: number | null;

  @Column({ name: 'faithfulness_reasoning', type: 'text', nullable: true })
  faithfulnessReasoning: string | null;

  @Column({ name: 'context_recall_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  contextRecallScore: number | null;

  @Column({ name: 'context_recall_reasoning', type: 'text', nullable: true })
  contextRecallReasoning: string | null;

  @Column({ name: 'context_precision_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  contextPrecisionScore: number | null;

  @Column({ name: 'context_precision_reasoning', type: 'text', nullable: true })
  contextPrecisionReasoning: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

