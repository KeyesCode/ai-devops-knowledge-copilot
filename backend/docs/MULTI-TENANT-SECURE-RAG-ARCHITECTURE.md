# Multi-Tenant Secure RAG Architecture

## Overview

This system implements a production-ready, multi-tenant Retrieval-Augmented Generation (RAG) architecture with enterprise-grade security and data isolation.

## Key Features

### 🔐 **Multi-Tenant Security**
- **Organization-level isolation**: All data is scoped by `org_id` at the database level
- **JWT Authentication**: Secure token-based authentication with role-based access control
- **ACL Enforcement**: Access Control Lists enforced in SQL queries, ensuring data isolation even if application logic has bugs

### 🛡️ **Role-Based Access Control (RBAC)**
- **Admin Role**: Full access to create, read, update, and delete sources
- **User Role**: Read-only access to sources and documents, can use chat/retrieval
- **Permission-based**: Fine-grained permissions for different operations
- **Guard-based**: Decorator-based route protection with `@Roles()` and `@RequirePermissions()`

### 🔍 **Scoped Retrieval**
- **Org-scoped queries**: Vector similarity search automatically filters by organization
- **Database-level filtering**: SQL queries include `WHERE s.org_id = $2` for security
- **Zero cross-tenant leakage**: Impossible to retrieve data from other organizations

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Request                         │
│                  (with JWT Bearer Token)                      │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    JWT Authentication                        │
│  • Validates token                                          │
│  • Extracts user context (id, email, role, orgId)          │
│  • Injects @CurrentUser() into request                      │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    RolesGuard (RBAC)                         │
│  • Checks @Roles() decorator                               │
│  • Validates @RequirePermissions()                          │
│  • Throws ForbiddenException if unauthorized               │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Business Logic                            │
│  • Uses orgId from @CurrentUser()                          │
│  • Passes orgId to all data operations                     │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Database Layer (PostgreSQL + pgvector)          │
│                                                              │
│  SELECT ... FROM embeddings e                               │
│  INNER JOIN chunks c ON c.id = e.chunk_id                   │
│  INNER JOIN documents d ON d.id = c.document_id             │
│  INNER JOIN sources s ON s.id = d.source_id                  │
│  WHERE s.org_id = $2  ← ACL Enforcement                     │
│  ORDER BY e.vector <=> $1::vector                           │
│  LIMIT $3;                                                  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow: Secure Multi-Tenant Retrieval

### 1. **Authentication Flow**
```
User Login → JWT Token Generated → Token includes (userId, email, role, orgId)
```

### 2. **Request Flow**
```
Request with JWT → JwtAuthGuard validates → RolesGuard checks permissions → 
Business logic uses orgId → Database query filters by org_id → Results returned
```

### 3. **Retrieval Flow**
```
User Query → Embed Query → Vector Search (with org_id filter) → 
Top-K Chunks (from user's org only) → LLM Context → Response
```

## Security Layers

### Layer 1: Authentication (JWT)
- **Location**: `JwtAuthGuard` (global)
- **Purpose**: Ensures user is authenticated
- **Enforcement**: All routes protected by default (except `@Public()`)

### Layer 2: Authorization (RBAC)
- **Location**: `RolesGuard` (selective)
- **Purpose**: Ensures user has required role/permissions
- **Enforcement**: Applied with `@UseGuards(RolesGuard)` + `@Roles()` or `@RequirePermissions()`

### Layer 3: Data Isolation (ACL)
- **Location**: SQL queries in `VectorStoreService`
- **Purpose**: Ensures users can only access their organization's data
- **Enforcement**: `WHERE s.org_id = $2` in all retrieval queries

## Example: Source Creation (Admin Only)

```typescript
@Post('sync')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)  // Only admins can create sources
async syncRepository(
  @Body() dto: SyncRepositoryDto,
  @CurrentUser() user: CurrentUserData,  // Automatically injected
) {
  // orgId comes from JWT token, not user input
  return this.githubIngestionService.syncRepository({
    ...dto,
    orgId: user.orgId,  // Secure: orgId from authenticated user
  });
}
```

## Example: Scoped Retrieval

```typescript
// In VectorStoreService.similaritySearch()
const results = await this.dataSource.query(`
  SELECT ...
  FROM embeddings e
  INNER JOIN chunks c ON c.id = e.chunk_id
  INNER JOIN documents d ON d.id = c.document_id
  INNER JOIN sources s ON s.id = d.source_id
  WHERE s.org_id = $2  -- ACL: Only return sources from user's org
  ORDER BY e.vector <=> $1::vector
  LIMIT $3;
`, [vectorString, orgId, topK]);
```

## Permission Matrix

| Permission | Admin | User |
|------------|-------|------|
| `CREATE_SOURCE` | ✅ | ❌ |
| `READ_SOURCE` | ✅ | ✅ |
| `UPDATE_SOURCE` | ✅ | ❌ |
| `DELETE_SOURCE` | ✅ | ❌ |
| `READ_DOCUMENT` | ✅ | ✅ |
| `UPDATE_DOCUMENT` | ✅ | ❌ |
| `USE_CHAT` | ✅ | ✅ |
| `USE_RETRIEVAL` | ✅ | ✅ |

## Multi-Tenancy Guarantees

1. **Database-level isolation**: All queries filter by `org_id`
2. **JWT-based org scoping**: `orgId` comes from authenticated token, not user input
3. **No cross-tenant access**: SQL queries make it impossible to access other orgs' data
4. **Source creation scoped**: Sources are automatically assigned to user's organization
5. **Retrieval scoped**: Vector search only returns chunks from user's organization

## Testing

Comprehensive test suite covers:
- ✅ Permission checks
- ✅ Role-based access control
- ✅ Guard enforcement
- ✅ ACL filtering in retrieval
- ✅ Integration tests

Run tests:
```bash
npm test
npm test -- rbac
```

## API Endpoints

### Public Endpoints
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get JWT token
- `GET /` - Health check

### Protected Endpoints (Require JWT)
- `POST /chat/stream` - Chat with RAG (all authenticated users)
- `POST /github/sync` - Sync GitHub repo (ADMIN only)

## Security Best Practices Implemented

1. ✅ **Defense in Depth**: Multiple security layers (Auth → RBAC → ACL)
2. ✅ **Principle of Least Privilege**: Users only get minimum required permissions
3. ✅ **Database-level Security**: ACL enforced in SQL, not just application code
4. ✅ **Token-based Auth**: Stateless JWT authentication
5. ✅ **Role-based Access**: Fine-grained permission system
6. ✅ **Input Validation**: DTOs with class-validator
7. ✅ **Org Scoping**: Automatic organization isolation

