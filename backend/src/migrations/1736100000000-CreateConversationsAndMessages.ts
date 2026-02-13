import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConversationsAndMessages1736100000000
  implements MigrationInterface
{
  name = 'CreateConversationsAndMessages1736100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create conversations table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        org_id VARCHAR(255) NOT NULL,
        title VARCHAR(500),
        total_tokens INTEGER NOT NULL DEFAULT 0,
        message_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create messages table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER,
        citations JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_role CHECK (role IN ('user', 'assistant', 'system'))
      );
    `);

    // Create indexes for better query performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_user_id_org_id 
      ON conversations(user_id, org_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_org_id_updated_at 
      ON conversations(org_id, updated_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at 
      ON messages(conversation_id, created_at ASC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_messages_conversation_id_created_at;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_conversations_org_id_updated_at;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_conversations_user_id_org_id;`,
    );

    // Drop tables (messages first due to foreign key)
    await queryRunner.query(`DROP TABLE IF EXISTS messages;`);
    await queryRunner.query(`DROP TABLE IF EXISTS conversations;`);
  }
}

