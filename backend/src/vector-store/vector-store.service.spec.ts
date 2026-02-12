import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { VectorStoreService } from './vector-store.service';

describe('VectorStoreService', () => {
  let service: VectorStoreService;
  let dataSource: jest.Mocked<DataSource>;

  const mockDataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VectorStoreService,
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<VectorStoreService>(VectorStoreService);
    dataSource = module.get(getDataSourceToken());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('upsertChunkEmbedding', () => {
    const chunkId = '123e4567-e89b-12d3-a456-426614174000';
    const embedding = Array.from({ length: 1536 }, (_, i) => (i + 1) * 0.001);
    const model = 'text-embedding-3-small';
    const embeddingId = '456e7890-e89b-12d3-a456-426614174001';

    it('should successfully upsert a chunk embedding', async () => {
      mockDataSource.query.mockResolvedValue([{ id: embeddingId }]);

      const result = await service.upsertChunkEmbedding(chunkId, embedding, model);

      expect(result).toBe(embeddingId);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO embeddings'),
        [chunkId, expect.stringContaining('['), model],
      );
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('should throw error if chunkId is missing', async () => {
      await expect(
        service.upsertChunkEmbedding('', embedding, model),
      ).rejects.toThrow('chunkId is required');
    });

    it('should throw error if embedding is empty', async () => {
      await expect(
        service.upsertChunkEmbedding(chunkId, [], model),
      ).rejects.toThrow('embedding vector is required and cannot be empty');
    });

    it('should throw error if model is missing', async () => {
      await expect(
        service.upsertChunkEmbedding(chunkId, embedding, ''),
      ).rejects.toThrow('model name is required');
    });

    it('should throw error if database query fails', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Database error'));

      await expect(
        service.upsertChunkEmbedding(chunkId, embedding, model),
      ).rejects.toThrow('Database error');
    });

    it('should throw error if query returns no result', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await expect(
        service.upsertChunkEmbedding(chunkId, embedding, model),
      ).rejects.toThrow('Failed to upsert embedding');
    });

    it('should convert embedding array to PostgreSQL vector format', async () => {
      const smallEmbedding = [0.1, 0.2, 0.3];
      mockDataSource.query.mockResolvedValue([{ id: embeddingId }]);

      await service.upsertChunkEmbedding(chunkId, smallEmbedding, model);

      const callArgs = mockDataSource.query.mock.calls[0];
      const vectorString = callArgs[1][1];
      expect(vectorString).toBe('[0.1,0.2,0.3]');
    });
  });

  describe('similaritySearch', () => {
    const queryEmbedding = Array.from({ length: 1536 }, (_, i) => (i + 2) * 0.001);
    const orgId = '789e0123-e89b-12d3-a456-426614174002';
    const topK = 5;

    const mockSearchResults = [
      {
        embedding_id: 'emb1',
        chunk_id: 'chunk1',
        content: 'Test content 1',
        chunk_metadata: { key: 'value' },
        document_id: 'doc1',
        document_title: 'Test Document 1',
        source_id: 'source1',
        similarity: '0.95',
        distance: '0.05',
      },
      {
        embedding_id: 'emb2',
        chunk_id: 'chunk2',
        content: 'Test content 2',
        chunk_metadata: null,
        document_id: 'doc2',
        document_title: 'Test Document 2',
        source_id: 'source2',
        similarity: '0.90',
        distance: '0.10',
      },
    ];

    it('should perform similarity search and return results', async () => {
      mockDataSource.query.mockResolvedValue(mockSearchResults);

      const results = await service.similaritySearch(queryEmbedding, topK, orgId);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        chunkId: 'chunk1',
        content: 'Test content 1',
        documentId: 'doc1',
        documentTitle: 'Test Document 1',
        sourceId: 'source1',
        similarity: 0.95,
        distance: 0.05,
        metadata: { key: 'value' },
      });
      expect(results[1].metadata).toEqual({});
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM embeddings e'),
        [expect.stringContaining('['), orgId, topK],
      );
    });

    it('should use default topK of 10 if not provided', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.similaritySearch(queryEmbedding, undefined as any, orgId);

      const callArgs = mockDataSource.query.mock.calls[0];
      expect(callArgs[1][2]).toBe(10);
    });

    it('should filter by org_id in SQL query', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.similaritySearch(queryEmbedding, topK, orgId);

      const sqlQuery = mockDataSource.query.mock.calls[0][0];
      expect(sqlQuery).toContain('WHERE s.org_id = $2');
      expect(sqlQuery).toContain('INNER JOIN sources s ON s.id = d.source_id');
    });

    it('should order results by cosine distance', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.similaritySearch(queryEmbedding, topK, orgId);

      const sqlQuery = mockDataSource.query.mock.calls[0][0];
      expect(sqlQuery).toContain('ORDER BY e.vector <=> $1::vector');
    });

    it('should throw error if queryEmbedding is empty', async () => {
      await expect(
        service.similaritySearch([], topK, orgId),
      ).rejects.toThrow('queryEmbedding is required and cannot be empty');
    });

    it('should throw error if topK is zero or negative', async () => {
      await expect(
        service.similaritySearch(queryEmbedding, 0, orgId),
      ).rejects.toThrow('topK must be greater than 0');

      await expect(
        service.similaritySearch(queryEmbedding, -1, orgId),
      ).rejects.toThrow('topK must be greater than 0');
    });

    it('should throw error if orgId is missing', async () => {
      await expect(
        service.similaritySearch(queryEmbedding, topK, ''),
      ).rejects.toThrow('orgId is required for ACL filtering');
    });

    it('should throw error if database query fails', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Database error'));

      await expect(
        service.similaritySearch(queryEmbedding, topK, orgId),
      ).rejects.toThrow('Database error');
    });

    it('should return empty array when no results found', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const results = await service.similaritySearch(queryEmbedding, topK, orgId);

      expect(results).toEqual([]);
    });

    it('should convert similarity and distance to numbers', async () => {
      mockDataSource.query.mockResolvedValue([
        {
          ...mockSearchResults[0],
          similarity: '0.85',
          distance: '0.15',
        },
      ]);

      const results = await service.similaritySearch(queryEmbedding, topK, orgId);

      expect(typeof results[0].similarity).toBe('number');
      expect(typeof results[0].distance).toBe('number');
      expect(results[0].similarity).toBe(0.85);
      expect(results[0].distance).toBe(0.15);
    });
  });
});

