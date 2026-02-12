# AI DevOps Knowledge Copilot

A production-ready Retrieval-Augmented Generation (RAG) system designed to index documentation/repos and provide intelligent answers via a chat interface.

## Features

- **Indexing**: Ingests GitHub repos or internal documentation.
- **Embeddings**: Provider-agnostic embedding service with OpenAI and Ollama support.
- **Vector Store**: Uses Postgres with `pgvector` for efficient similarity search.
- **Backend**: Built with NestJS, supporting streaming responses (SSE/WebSockets).
- **Security**: Role-based access control (RBAC).
- **Evaluation**: Integrated RAG evaluation metrics.
- **Caching**: Redis-based embedding cache to reduce API calls.

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

