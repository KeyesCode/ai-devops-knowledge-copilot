import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { EvalSet } from './eval-set.entity';
import { EvalResult } from './eval-result.entity';

export enum EvalRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('eval_runs')
export class EvalRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'eval_set_id', type: 'uuid' })
  evalSetId: string;

  @ManyToOne(() => EvalSet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eval_set_id' })
  evalSet: EvalSet;

  @Column({ name: 'org_id', type: 'varchar', length: 255 })
  orgId: string;

  @Column({
    type: 'enum',
    enum: EvalRunStatus,
    default: EvalRunStatus.PENDING,
  })
  status: EvalRunStatus;

  @Column({ name: 'total_questions', type: 'integer', default: 0 })
  totalQuestions: number;

  @Column({ name: 'completed_questions', type: 'integer', default: 0 })
  completedQuestions: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @OneToMany(() => EvalResult, (result) => result.evalRun, {
    cascade: true,
  })
  results: EvalResult[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;
}

