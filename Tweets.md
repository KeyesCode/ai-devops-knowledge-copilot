# Post 1: What I Learned Building a RAG System

## Twitter Thread

**Tweet 1/9** 🧵
Built a RAG system from scratch and learned a lot about vector search, multi-tenancy, and embedding architectures. Here's what I discovered:

[Attach screenshot: frontend/public/ai-devops-knowledge-copilot.png]

---

**Tweet 2/9**
**Learning #1: pgvector is powerful**

You don't need a separate vector DB. Postgres with pgvector can handle similarity search natively using cosine distance.

The `<=>` operator makes queries clean:

```sql
SELECT 1 - (e.vector <=> $1::vector) as similarity
FROM embeddings e
WHERE s.org_id = $2
ORDER BY e.vector <=> $1::vector
LIMIT 5;
```

[Attach screenshot: pgvector extension enabled + example query]

The IVFFlat index makes it fast even at scale.

---

**Tweet 3/9**
**Learning #2: Dimension normalization is tricky**

OpenAI embeddings = 1536 dims
Ollama embeddings = 768 dims

I learned you can't mix dimensions in the same vector column. Solution: pad smaller vectors with zeros to match the target dimension (1536).

This lets you switch providers without rebuilding your entire vector store.

[Attach screenshot: Code showing padding logic]

Trade-off: slightly less semantic precision, but enables provider flexibility.

---

**Tweet 4/9**
**Learning #3: Multi-tenant isolation at the DB layer**

Instead of filtering in application code, I filter by `org_id` directly in the SQL query:

```sql
WHERE s.org_id = $2
```

The join path: embeddings → chunks → documents → sources

[Attach screenshot: Query showing top 5 chunks with scores + org filtering]

This ensures data isolation even if application logic has bugs. Security by design, not by convention.

---

**Tweet 5/9**
**Learning #4: Embedding caching is a game-changer**

Redis cache with SHA-256 hashed keys reduced API calls by ~80%. Same text = same hash = cache hit.

[Attach screenshot: Redis keys showing cached embeddings]

The strategy pattern lets me swap between OpenAI and Ollama with zero code changes—just an env var.

[Attach screenshot: Toggle between providers]

Learned: abstract early, optimize later.

---

**Tweet 6/9**
**Learning #5: Streaming RAG responses**

SSE (Server-Sent Events) for token streaming + citations at the end.

The flow:
1. Query → embed → vector search
2. Stream LLM response token by token
3. Emit citations after streaming completes

[Attach screen recording: Question → live streaming → citations]

Users see answers immediately, citations follow. Better UX than waiting for everything.

---

**Tweet 7/9**
**Learning #6: Architecture patterns that worked**

✅ Strategy pattern for embedding providers (OpenAI/Ollama)
✅ Service layer abstraction (VectorStoreService)
✅ Database-level filtering for security
✅ Redis as a caching layer (not required, but recommended)
✅ SSE for streaming (simpler than WebSockets for one-way)

Each decision had trade-offs. Understanding when to abstract vs. when to keep it simple was key.

---

**Tweet 8/9**
**What surprised me:**

1. pgvector performance is excellent—no need for Pinecone/Weaviate for many use cases
2. Dimension padding works better than expected for similarity search
3. Redis caching had bigger impact than I thought (~80% reduction)
4. Multi-tenant filtering in SQL is cleaner than app-level checks
5. SSE is perfect for streaming—no WebSocket complexity needed

Sometimes the simpler solution is the right one.

---

**Tweet 9/9**
**The stack I learned:**

- NestJS (dependency injection, modules)
- PostgreSQL + pgvector (native vector ops)
- Redis (caching layer)
- React + SSE (streaming UI)
- Strategy pattern (provider abstraction)

---

## Screenshots/Recordings Needed:

1. **pgvector extension enabled** - Show PostgreSQL with vector extension active
2. **Example cosine similarity query** - SQL query with results showing similarity scores
3. **Redis keys** - Screenshot of Redis keys showing cached embeddings (format: `embedding:${hash}`)
4. **Toggle between OpenAI + Ollama** - Show env var or UI toggle switching providers
5. **Query → Top 5 chunks with scores** - Show similarity search results with org_id filtering
6. **Screen recording** - Question input → live token streaming → citations appearing at end
7. **Main screenshot** - frontend/public/ai-devops-knowledge-copilot.png (already available)

## The Post:

https://x.com/Keyes_Tanner/status/2021831062976872502?s=20

---

# Post 2: Leveling Up RAG with Cross-Encoder Reranking & Conversation Management

## Twitter Thread

**Tweet 1/10** 🧵
Just shipped two major features that dramatically improved my RAG system:
1. Cross-encoder reranking for better retrieval accuracy
2. Full conversation management with context window optimization

Here's what I learned building them:

[Attach screenshot: frontend/public/ai-devops-knowledge-copilot.png]

---

**Tweet 2/10**
**Feature #1: Cross-Encoder Reranking**

Bi-encoders (like embeddings) are fast but miss nuance. Cross-encoders see query + document together, giving more accurate relevance scores.

The pipeline:
1. Vector search gets top 80 candidates
2. Cross-encoder reranks them
3. Return top 20 most relevant

[Attach screenshot: Before/after reranking comparison showing score improvements]

Result: ~30% better retrieval accuracy on complex queries.

---

**Tweet 3/10**
**Cross-Encoder Implementation Details**

Using `@xenova/transformers` with ONNX models (runs in Node.js, no Python needed).

Key config:
- Model: `Xenova/ms-marco-MiniLM-L-6-v2` (lightweight, fast)
- Backend: WASM (cross-platform) or Node (faster if supported)
- Quantization: Auto (tries quantized first, falls back if needed)

[Attach screenshot: Reranker config in env.example]

The model processes query-document pairs in batches of 16 for memory efficiency.

---

**Tweet 4/10**
**Reranking Integration**

The RetrievalService pipeline:
1. Hybrid search (BM25 + Vector) → 80 candidates
2. Metadata boosting
3. **Cross-encoder reranking** ← new step
4. Return top K results

```typescript
const reranked = await this.rerankerService.rerank(
  query,
  initialResults,
  topK
);
```

[Attach screenshot: RetrievalService code showing reranking integration]

Graceful degradation: if reranker fails, returns original results.

---

**Tweet 5/10**
**Feature #2: Conversation Management**

Users need context across multiple messages. Built a full conversation system:

- Conversations table (title, token count, message count)
- Messages table (role, content, token count)
- Conversation sidebar for navigation
- Auto-title generation from first message

[Attach screenshot: Frontend showing conversation sidebar with multiple conversations]

Each conversation maintains its own history and context.

---

**Tweet 6/10**
**Context Window Optimization**

LLMs have token limits. Can't just send all messages.

Solution: Smart history selection:
1. Always keep last 5 messages (recent context)
2. Fill remaining budget with older messages (newest → oldest)
3. Use token estimation (~4 chars/token)

[Attach screenshot: Code showing getOptimizedHistory logic]

Default: 32k token window, 4k reserved for system prompt + new query.

---

**Tweet 7/10**
**Token Estimation Strategy**

Simple but effective: `Math.ceil(text.length / 4)`

Why it works:
- Conservative estimate (better to under-estimate)
- Fast (no API calls needed)
- Good enough for context window management

[Attach screenshot: TokenEstimator utility code]

Stored token counts in DB for faster lookups on subsequent requests.

---

**Tweet 8/10**
**Conversation Flow**

1. User sends message → Create conversation if new
2. Save user message to DB
3. Get optimized history (fits in context window)
4. Retrieve context via RAG (with reranking!)
5. Stream LLM response
6. Save assistant message
7. Update conversation metadata

[Attach screen recording: Full conversation flow showing history persistence]

Users can switch conversations and pick up where they left off.

---

**Tweet 9/10**
**What I Learned:**

1. Cross-encoders are worth the latency cost (~100-200ms) for accuracy gains
2. ONNX models in Node.js are powerful—no Python dependency needed
3. Context window management is critical for long conversations
4. Token estimation doesn't need to be perfect, just conservative
5. Conversation persistence improves UX dramatically

Both features work together: better retrieval + better context = better answers.

---

**Tweet 10/10**
**The Stack Additions:**

- `@xenova/transformers` (ONNX model runtime)
- Cross-encoder models (Xenova/* repos)
- TypeORM entities (Conversation, Message)
- Token estimation utility
- Context window optimization logic

Next up: Adding conversation search and better title generation.

---

## Screenshots/Recordings Needed:

1. **Before/after reranking comparison** - Show retrieval results with/without reranking, highlighting score improvements
2. **Reranker config** - Screenshot of env.example showing RERANKER_* variables
3. **RetrievalService code** - Code snippet showing reranking integration in the pipeline
4. **Conversation sidebar** - Frontend showing sidebar with multiple conversations listed
5. **getOptimizedHistory code** - Code showing the context window optimization logic
6. **TokenEstimator utility** - Code showing the token estimation implementation
7. **Full conversation flow** - Screen recording showing: create conversation → send messages → switch conversations → see history
8. **Main screenshot** - frontend/public/ai-devops-knowledge-copilot.png (already available)

## The Post:

https://x.com/Keyes_Tanner/status/2022172117626994806?s=20