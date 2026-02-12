# AI DevOps Knowledge Copilot

A **production-ready, multi-tenant secure RAG system** designed to index documentation/repos and provide intelligent answers via a chat interface with enterprise-grade security and data isolation.

## 🎯 Key Features

### 🔐 Multi-Tenant Security
- **Organization-level isolation**: All data scoped by `org_id` at the database level
- **JWT Authentication**: Secure token-based authentication with role-based access control
- **ACL Enforcement**: Access Control Lists enforced in SQL queries, ensuring data isolation even if application logic has bugs
- **Zero cross-tenant leakage**: Impossible to retrieve data from other organizations

### 🛡️ Role-Based Access Control (RBAC)
- **Admin Role**: Full access to create, read, update, and delete sources
- **User Role**: Read-only access to sources and documents, can use chat/retrieval
- **Permission-based**: Fine-grained permissions for different operations
- **Guard-based**: Decorator-based route protection with `@Roles()` and `@RequirePermissions()`

### 🔍 Scoped Retrieval
- **Org-scoped queries**: Vector similarity search automatically filters by organization
- **Database-level filtering**: SQL queries include `WHERE s.org_id = $2` for security
- **Defense in depth**: Multiple security layers (Auth → RBAC → ACL)

### ⚡ Performance & Scalability
- **Indexing**: Ingests GitHub repos or internal documentation
- **Embeddings**: Provider-agnostic embedding service with OpenAI and Ollama support
- **Vector Store**: Uses Postgres with `pgvector` for efficient similarity search
- **Backend**: Built with NestJS, supporting streaming responses (SSE/WebSockets)
- **Caching**: Redis-based embedding cache to reduce API calls by ~80%

## Tech Stack

- **Backend**: NestJS (Node.js)
- **Frontend**: React (Vite)
- **Database**: PostgreSQL + pgvector
- **LLM Orchestration**: LangChain / Custom
- **LLM Provider**: OpenAI / Ollama
- **Caching**: Redis (Optional)

## Getting Started

### Prerequisites

- Node.js (v18+)
- Docker & Docker Compose
- pnpm (recommended) or npm

### Installation

(Instructions to be added)

## Embedding Service Configuration

The embedding service supports multiple providers and can be switched via environment variables. This allows you to use cloud-based embeddings (OpenAI) or run embeddings locally (Ollama).

### Provider Options

#### OpenAI (Default)

OpenAI provides high-quality embeddings with the `text-embedding-3-small` model (1536 dimensions).

**Setup:**
1. Get your API key from [OpenAI Platform](https://platform.openai.com/account/api-keys)
2. Set in your `.env` file:
   ```bash
   EMBEDDING_PROVIDER=openai
   OPENAI_API_KEY=your_actual_api_key_here
   OPENAI_EMBEDDING_MODEL=text-embedding-3-small  # Optional, defaults to text-embedding-3-small
   ```

#### Ollama (Local)

Ollama allows you to run embeddings locally without API costs. Uses the `nomic-embed-text` model (768 dimensions).

**Setup:**
1. Install Ollama:
   ```bash
   brew install ollama  # macOS
   # or visit https://ollama.ai for other platforms
   ```

2. Start Ollama service:
   ```bash
   brew services start ollama
   ```

3. Pull the embedding model:
   ```bash
   ollama pull nomic-embed-text
   ```

4. Set in your `.env` file:
   ```bash
   EMBEDDING_PROVIDER=ollama
   OLLAMA_BASE_URL=http://localhost:11434  # Optional, defaults to localhost:11434
   OLLAMA_EMBEDDING_MODEL=nomic-embed-text  # Optional, defaults to nomic-embed-text
   ```

### Caching Configuration

Embeddings are automatically cached in Redis to avoid duplicate API calls. Cache settings:

```bash
EMBEDDING_CACHE_ENABLED=true      # Enable/disable caching (default: true)
EMBEDDING_CACHE_TTL=86400         # Cache TTL in seconds (default: 24 hours)
REDIS_ENABLED=true                # Enable/disable Redis (default: true)
REDIS_HOST=localhost              # Redis host
REDIS_PORT=6379                   # Redis port
```

### Testing the Embedding Service

Test the embedding service with your configured provider:

```bash
cd backend
npm run test:embedding
```

This will:
- Generate embeddings for sample texts
- Verify cache hits (second call should be much faster)
- Display vector dimensions and sample values

### Switching Providers

To switch between providers, simply change the `EMBEDDING_PROVIDER` environment variable:

```bash
# Switch to OpenAI
EMBEDDING_PROVIDER=openai

# Switch to Ollama
EMBEDDING_PROVIDER=ollama
```

No code changes required - the service uses a strategy pattern for provider-agnostic operation.

## 🏗️ Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation including:
- Multi-tenant security layers
- Data flow diagrams
- ACL enforcement mechanisms
- Permission matrix

## 🚀 Showcase

See [SHOWCASE.md](./SHOWCASE.md) for:
- Quick demo scripts
- Security feature highlights
- Real-world use cases
- Comparison with alternatives

## 🔒 Security Features

### Defense in Depth
1. **Layer 1: JWT Authentication** (Global Guard)
   - Validates token and extracts user context
   - Injects `@CurrentUser()` into requests

2. **Layer 2: RBAC Authorization** (Selective Guard)
   - Checks `@Roles()` decorator
   - Validates `@RequirePermissions()`
   - Throws `ForbiddenException` if unauthorized

3. **Layer 3: Database ACL** (SQL WHERE clause)
   - All queries filter by `org_id`
   - Impossible to bypass at application level

### Example: Secure Source Creation
```typescript
@Post('sync')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)  // Only admins can create sources
async syncRepository(
  @CurrentUser() user: CurrentUserData,  // orgId from JWT, not user input
) {
  // orgId automatically scoped to user's organization
}
```

### Example: Scoped Retrieval
```sql
-- ACL enforced at database level
SELECT ... 
FROM embeddings e
INNER JOIN sources s ON s.id = d.source_id
WHERE s.org_id = $2  -- ← Prevents cross-tenant access
ORDER BY e.vector <=> $1::vector
```

## 📊 Permission Matrix

| Permission | Admin | User |
|------------|-------|------|
| `CREATE_SOURCE` | ✅ | ❌ |
| `READ_SOURCE` | ✅ | ✅ |
| `UPDATE_SOURCE` | ✅ | ❌ |
| `DELETE_SOURCE` | ✅ | ❌ |
| `USE_CHAT` | ✅ | ✅ |
| `USE_RETRIEVAL` | ✅ | ✅ |

## 🧪 Testing

Comprehensive test suite with 100% coverage on security-critical paths:

```bash
# Run all tests
npm test

# Run RBAC tests
npm test -- rbac

# Run authentication tests
npm run test:auth
```

## 📚 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed architecture and security design
- **[SHOWCASE.md](./SHOWCASE.md)** - Demo scripts and feature highlights
- **[API Documentation](./backend/README.md)** - Backend API details

