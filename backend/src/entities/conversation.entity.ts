import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Message } from './message.entity';

@Entity('conversations')
@Index(['userId', 'orgId'])
@Index(['orgId', 'updatedAt'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'org_id', type: 'varchar', length: 255 })
  @Index()
  orgId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title: string | null;

  @Column({ name: 'total_tokens', type: 'integer', default: 0 })
  totalTokens: number;

  @Column({ name: 'message_count', type: 'integer', default: 0 })
  messageCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Message, (message) => message.conversation, {
    cascade: true,
  })
  messages: Message[];
}

