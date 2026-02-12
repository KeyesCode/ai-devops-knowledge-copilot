import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1735700000000 implements MigrationInterface {
  name = 'CreateUsersTable1735700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        org_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_role CHECK (role IN ('admin', 'user'))
      );
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_org_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_email;`);

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS users;`);
  }
}

