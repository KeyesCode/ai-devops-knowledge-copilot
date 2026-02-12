import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { EvalSet } from './eval-set.entity';

@Entity('eval_questions')
export class EvalQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'eval_set_id', type: 'uuid' })
  evalSetId: string;

  @ManyToOne(() => EvalSet, (evalSet) => evalSet.questions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'eval_set_id' })
  evalSet: EvalSet;

  @Column({ type: 'text' })
  question: string;

  @Column({ name: 'expected_answer', type: 'text' })
  expectedAnswer: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

