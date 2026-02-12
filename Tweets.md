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