import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { EvalQuestion } from './eval-question.entity';

@Entity('eval_sets')
export class EvalSet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'org_id', type: 'varchar', length: 255 })
  orgId: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @OneToMany(() => EvalQuestion, (question) => question.evalSet, {
    cascade: true,
  })
  questions: EvalQuestion[];

  @Column({ name: 'scoped_sources', type: 'uuid', array: true, nullable: true })
  scopedSources: string[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

