import { Test, TestingModule } from '@nestjs/testing';
import { RetrievalService } from './retrieval.service';
import { EmbeddingService } from '../embeddings/embedding.service';
import {
  VectorStoreService,
  SimilaritySearchResult,
} from '../vector-store/vector-store.service';

describe('RetrievalService', () => {
  let service: RetrievalService;
  let embeddingService: jest.Mocked<EmbeddingService>;
  let vectorStoreService: jest.Mocked<VectorStoreService>;

  const mockEmbeddingService = {
    embed: jest.fn(),
  };

  const mockVectorStoreService = {
    similaritySearch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrievalService,
        {
          provide: EmbeddingService,
          useValue: mockEmbeddingService,
        },
        {
          provide: VectorStoreService,
          useValue: mockVectorStoreService,
        },
      ],
    }).compile();

    service = module.get<RetrievalService>(RetrievalService);
    embeddingService = module.get(EmbeddingService);
    vectorStoreService = module.get(VectorStoreService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('retrieve', () => {
    const query = 'How do I deploy an application?';
    const orgId = 'org-123';
    const topK = 5;
    const queryEmbedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);

    const mockSearchResults: SimilaritySearchResult[] = [
      {
        chunkId: 'chunk-1',
        content: 'To deploy an application, first build the Docker image...',
        documentId: 'doc-1',
        documentTitle: 'Deployment Guide',
        sourceId: 'source-1',
        similarity: 0.95,
        distance: 0.05,
        metadata: { chunkIndex: 0 },
      },
      {
        chunkId: 'chunk-2',
        content: 'After building, push the image to the registry...',
        documentId: 'doc-1',
        documentTitle: 'Deployment Guide',
        sourceId: 'source-1',
        similarity: 0.88,
        distance: 0.12,
        metadata: { chunkIndex: 1 },
      },
      {
        chunkId: 'chunk-3',
        content: 'Configure your environment variables...',
        documentId: 'doc-2',
        documentTitle: 'Configuration',
        sourceId: 'source-1',
        similarity: 0.82,
        distance: 0.18,
        metadata: { chunkIndex: 0 },
      },
    ];

    it('should successfully retrieve chunks and format context', async () => {
      mockEmbeddingService.embed.mockResolvedValue(queryEmbedding);
      mockVectorStoreService.similaritySearch.mockResolvedValue(
        mockSearchResults,
      );

      const result = await service.retrieve(query, orgId, topK);

      // Verify embedding was called
      expect(embeddingService.embed).toHaveBeenCalledWith(query);
      expect(embeddingService.embed).toHaveBeenCalledTimes(1);

      // Verify similarity search was called
      expect(vectorStoreService.similaritySearch).toHaveBeenCalledWith(
        queryEmbedding,
        topK,
        orgId,
      );
      expect(vectorStoreService.similaritySearch).toHaveBeenCalledTimes(1);

      // Verify result structure
      expect(result).toHaveProperty('query', query);
      expect(result).toHaveProperty('chunks');
      expect(result).toHaveProperty('context');
      expect(result).toHaveProperty('metadata');

      // Verify chunks
      expect(result.chunks).toHaveLength(3);
      expect(result.chunks[0]).toMatchObject({
        chunkId: 'chunk-1',
        content: 'To deploy an application, first build the Docker image...',
        similarity: 0.95,
        distance: 0.05,
      });

      // Verify context formatting
      expect(result.context).toContain('[Chunk 1]');
      expect(result.context).toContain('Deployment Guide');
      expect(result.context).toContain('Similarity: 0.9500');
      expect(result.context).toContain('To deploy an application');
      expect(result.context).toContain('---');

      // Verify metadata
      expect(result.metadata).toMatchObject({
        topK: 5,
        totalChunks: 3,
        avgSimilarity: expect.any(Number),
        minSimilarity: 0.82,
        maxSimilarity: 0.95,
      });
      expect(result.metadata.avgSimilarity).toBeCloseTo(0.8833, 4);
    });

    it('should handle empty query', async () => {
      await expect(service.retrieve('', orgId, topK)).rejects.toThrow(
        'Query cannot be empty',
      );
    });

    it('should handle missing orgId', async () => {
      await expect(service.retrieve(query, '', topK)).rejects.toThrow(
        'orgId is required for ACL filtering',
      );
    });

    it('should handle invalid topK', async () => {
      await expect(service.retrieve(query, orgId, 0)).rejects.toThrow(
        'topK must be greater than 0',
      );
      await expect(service.retrieve(query, orgId, -1)).rejects.toThrow(
        'topK must be greater than 0',
      );
    });

    it('should handle empty search results', async () => {
      mockEmbeddingService.embed.mockResolvedValue(queryEmbedding);
      mockVectorStoreService.similaritySearch.mockResolvedValue([]);

      const result = await service.retrieve(query, orgId, topK);

      expect(result.chunks).toHaveLength(0);
      expect(result.context).toBe('');
      expect(result.metadata).toMatchObject({
        topK: 5,
        totalChunks: 0,
        avgSimilarity: 0,
        minSimilarity: 0,
        maxSimilarity: 0,
      });
    });

    it('should use default topK when not provided', async () => {
      mockEmbeddingService.embed.mockResolvedValue(queryEmbedding);
      mockVectorStoreService.similaritySearch.mockResolvedValue(
        mockSearchResults,
      );

      await service.retrieve(query, orgId);

      expect(vectorStoreService.similaritySearch).toHaveBeenCalledWith(
        queryEmbedding,
        10, // default topK
        orgId,
      );
    });

    it('should format context with document titles', async () => {
      mockEmbeddingService.embed.mockResolvedValue(queryEmbedding);
      mockVectorStoreService.similaritySearch.mockResolvedValue(
        mockSearchResults,
      );

      const result = await service.retrieve(query, orgId, topK);

      expect(result.context).toContain('[Chunk 1] Deployment Guide');
      expect(result.context).toContain('[Chunk 2] Deployment Guide');
      expect(result.context).toContain('[Chunk 3] Configuration');
    });

    it('should format context with document ID when title is null', async () => {
      const resultsWithoutTitle: SimilaritySearchResult[] = [
        {
          ...mockSearchResults[0],
          documentTitle: null,
        },
      ];

      mockEmbeddingService.embed.mockResolvedValue(queryEmbedding);
      mockVectorStoreService.similaritySearch.mockResolvedValue(
        resultsWithoutTitle,
      );

      const result = await service.retrieve(query, orgId, topK);

      expect(result.context).toContain('[Chunk 1] Document doc-1');
    });

    it('should include all chunk metadata in result', async () => {
      mockEmbeddingService.embed.mockResolvedValue(queryEmbedding);
      mockVectorStoreService.similaritySearch.mockResolvedValue(
        mockSearchResults,
      );

      const result = await service.retrieve(query, orgId, topK);

      expect(result.chunks[0].metadata).toEqual({ chunkIndex: 0 });
      expect(result.chunks[1].metadata).toEqual({ chunkIndex: 1 });
    });

    it('should calculate correct similarity statistics', async () => {
      const resultsWithVariedSimilarity: SimilaritySearchResult[] = [
        { ...mockSearchResults[0], similarity: 0.95 },
        { ...mockSearchResults[1], similarity: 0.85 },
        { ...mockSearchResults[2], similarity: 0.75 },
      ];

      mockEmbeddingService.embed.mockResolvedValue(queryEmbedding);
      mockVectorStoreService.similaritySearch.mockResolvedValue(
        resultsWithVariedSimilarity,
      );

      const result = await service.retrieve(query, orgId, topK);

      expect(result.metadata.minSimilarity).toBe(0.75);
      expect(result.metadata.maxSimilarity).toBe(0.95);
      expect(result.metadata.avgSimilarity).toBeCloseTo(0.85, 2);
    });
  });
});

