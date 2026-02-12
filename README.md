# AI DevOps Knowledge Copilot

A production-ready Retrieval-Augmented Generation (RAG) system designed to index documentation/repos and provide intelligent answers via a chat interface.

## Features

- **Indexing**: Ingests GitHub repos or internal documentation.
- **Embeddings**: Supports OpenAI and local embeddings (Ollama).
- **Vector Store**: Uses Postgres with `pgvector` for efficient similarity search.
- **Backend**: Built with NestJS, supporting streaming responses (SSE/WebSockets).
- **Security**: Role-based access control (RBAC).
- **Evaluation**: Integrated RAG evaluation metrics.

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

