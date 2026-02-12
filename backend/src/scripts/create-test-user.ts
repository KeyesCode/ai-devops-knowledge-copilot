/**
 * Script to create a test user for E2E testing
 * 
 * Usage:
 *   npm run create-test-user
 * 
 * Or with ts-node:
 *   ts-node -r tsconfig-paths/register src/scripts/create-test-user.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../entities/user.entity';

async function createTestUser() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const authService = app.get(AuthService);

  const email = 'admin_e2e@example.com';
  const password = 'password';
  const orgId = 'e2e-test-org';
  const role = UserRole.ADMIN;

  try {
    console.log(`Creating test user: ${email}...`);
    
    const result = await authService.register({
      email,
      password,
      orgId,
      role,
    });

    console.log('\n✅ User created successfully!');
    console.log(`   Email: ${result.user.email}`);
    console.log(`   Role: ${result.user.role}`);
    console.log(`   Org ID: ${result.user.orgId}`);
    console.log(`   User ID: ${result.user.id}`);
    console.log(`\n   Token: ${result.access_token.substring(0, 50)}...`);
    console.log('\n💡 You can now use these credentials to login:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log(`\n⚠️  User ${email} already exists.`);
      console.log('   You can use the existing credentials to login.');
    } else {
      console.error('\n❌ Error creating user:', error.message);
      process.exit(1);
    }
  }

  await app.close();
  process.exit(0);
}

createTestUser().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

