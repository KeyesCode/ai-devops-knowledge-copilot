/**
 * Test script for JWT Authentication
 * 
 * Usage:
 *   npm run test:auth
 * 
 * Make sure:
 *   1. The server is running (npm run start:dev)
 *   2. Database migrations have been run (npm run migration:run)
 *   3. Environment variables are set (JWT_SECRET, DB_*, etc.)
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

async function makeRequest(
  method: string,
  path: string,
  body?: any,
  token?: string,
): Promise<{ status: number; data: any }> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  return {
    status: response.status,
    data,
  };
}

async function test(name: string, testFn: () => Promise<void>): Promise<void> {
  try {
    await testFn();
    results.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (error: any) {
    results.push({
      name,
      passed: false,
      error: error.message,
      details: error.details,
    });
    console.error(`✗ ${name}: ${error.message}`);
  }
}

async function runTests() {
  console.log('🧪 Testing JWT Authentication\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  let accessToken: string | undefined;
  let userId: string | undefined;
  let userEmail: string | undefined;
  let userOrgId: string | undefined;

  // Test 1: Register a new user
  await test('Register new user', async () => {
    const email = `test-${Date.now()}@example.com`;
    const password = 'testpassword123';
    const orgId = 'test-org-123';

    const response = await makeRequest('POST', '/auth/register', {
      email,
      password,
      orgId,
    });

    if (response.status !== 201) {
      throw new Error(
        `Expected status 201, got ${response.status}: ${JSON.stringify(response.data)}`,
      );
    }

    if (!response.data.access_token) {
      throw new Error('Missing access_token in response');
    }

    if (!response.data.user) {
      throw new Error('Missing user in response');
    }

    accessToken = response.data.access_token;
    userId = response.data.user.id;
    userEmail = response.data.user.email;
    userOrgId = response.data.user.orgId;

    if (response.data.user.email !== email) {
      throw new Error('Email mismatch in response');
    }

    if (response.data.user.orgId !== orgId) {
      throw new Error('OrgId mismatch in response');
    }

    if (response.data.user.role !== 'user') {
      throw new Error('Default role should be "user"');
    }
  });

  // Test 2: Try to register duplicate user (should fail)
  await test('Register duplicate user (should fail)', async () => {
    if (!userEmail) {
      throw new Error('Previous test failed, skipping');
    }

    const response = await makeRequest('POST', '/auth/register', {
      email: userEmail,
      password: 'differentpassword',
      orgId: 'different-org',
    });

    if (response.status !== 409) {
      throw new Error(
        `Expected status 409 (Conflict), got ${response.status}: ${JSON.stringify(response.data)}`,
      );
    }
  });

  // Test 3: Login with correct credentials
  await test('Login with correct credentials', async () => {
    if (!userEmail) {
      throw new Error('Previous test failed, skipping');
    }

    const response = await makeRequest('POST', '/auth/login', {
      email: userEmail,
      password: 'testpassword123',
    });

    if (response.status !== 200) {
      throw new Error(
        `Expected status 200, got ${response.status}: ${JSON.stringify(response.data)}`,
      );
    }

    if (!response.data.access_token) {
      throw new Error('Missing access_token in response');
    }

    // Update token from login
    accessToken = response.data.access_token;
  });

  // Test 4: Login with incorrect password (should fail)
  await test('Login with incorrect password (should fail)', async () => {
    if (!userEmail) {
      throw new Error('Previous test failed, skipping');
    }

    const response = await makeRequest('POST', '/auth/login', {
      email: userEmail,
      password: 'wrongpassword',
    });

    if (response.status !== 401) {
      throw new Error(
        `Expected status 401 (Unauthorized), got ${response.status}: ${JSON.stringify(response.data)}`,
      );
    }
  });

  // Test 5: Login with non-existent user (should fail)
  await test('Login with non-existent user (should fail)', async () => {
    const response = await makeRequest('POST', '/auth/login', {
      email: 'nonexistent@example.com',
      password: 'anypassword',
    });

    if (response.status !== 401) {
      throw new Error(
        `Expected status 401 (Unauthorized), got ${response.status}: ${JSON.stringify(response.data)}`,
      );
    }
  });

  // Test 6: Access protected endpoint with valid token
  await test('Access protected endpoint with valid token', async () => {
    if (!accessToken) {
      throw new Error('No access token available');
    }

    // Try to access the chat endpoint (protected)
    const response = await makeRequest(
      'POST',
      '/chat/stream',
      {
        query: 'test query',
        topK: 5,
      },
      accessToken,
    );

    // Should not get 401 (Unauthorized) - might get other errors like 400 if orgId validation fails, but not 401
    if (response.status === 401) {
      throw new Error('Got 401 Unauthorized with valid token');
    }

    // Status could be 400 (bad request) or other, but not 401
    console.log(`    Note: Got status ${response.status} (expected: not 401)`);
  });

  // Test 7: Access protected endpoint without token (should fail)
  await test('Access protected endpoint without token (should fail)', async () => {
    const response = await makeRequest('POST', '/chat/stream', {
      query: 'test query',
    });

    if (response.status !== 401) {
      throw new Error(
        `Expected status 401 (Unauthorized), got ${response.status}: ${JSON.stringify(response.data)}`,
      );
    }
  });

  // Test 8: Access protected endpoint with invalid token (should fail)
  await test('Access protected endpoint with invalid token (should fail)', async () => {
    const response = await makeRequest(
      'POST',
      '/chat/stream',
      {
        query: 'test query',
      },
      'invalid-token-here',
    );

    if (response.status !== 401) {
      throw new Error(
        `Expected status 401 (Unauthorized), got ${response.status}: ${JSON.stringify(response.data)}`,
      );
    }
  });

  // Test 9: Access public endpoint without token (should work)
  await test('Access public endpoint without token (should work)', async () => {
    const response = await makeRequest('GET', '/');

    if (response.status !== 200) {
      throw new Error(
        `Expected status 200, got ${response.status}: ${JSON.stringify(response.data)}`,
      );
    }
  });

  // Test 10: Register user with admin role
  await test('Register user with admin role', async () => {
    const email = `admin-${Date.now()}@example.com`;
    const password = 'adminpassword123';
    const orgId = 'admin-org-123';

    const response = await makeRequest('POST', '/auth/register', {
      email,
      password,
      orgId,
      role: 'admin',
    });

    if (response.status !== 201) {
      throw new Error(
        `Expected status 201, got ${response.status}: ${JSON.stringify(response.data)}`,
      );
    }

    if (response.data.user.role !== 'admin') {
      throw new Error('Role should be "admin"');
    }
  });

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('Test Summary');
  console.log('='.repeat(50));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  results.forEach((result) => {
    const icon = result.passed ? '✓' : '✗';
    console.log(`${icon} ${result.name}`);
    if (!result.passed && result.error) {
      console.log(`  Error: ${result.error}`);
    }
  });

  console.log('\n' + '='.repeat(50));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(50));

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Check if fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
  console.error(
    'Error: fetch is not available. This script requires Node.js 18+ or you need to install node-fetch.',
  );
  console.error('Please use Node.js 18+ or install: npm install --save-dev node-fetch @types/node-fetch');
  process.exit(1);
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

