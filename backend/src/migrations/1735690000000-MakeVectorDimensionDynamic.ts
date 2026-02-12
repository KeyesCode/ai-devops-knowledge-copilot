import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeVectorDimensionDynamic1735690000000
  implements MigrationInterface
{
  name = 'MakeVectorDimensionDynamic1735690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Note: IVFFlat indexes require fixed dimensions, so we keep 1536
    // The application will pad smaller vectors (e.g., 768 from Ollama) to 1536
    // This migration is a no-op since we're keeping the fixed dimension
    // The padding logic is handled in the VectorStoreService
    // No database changes needed - dimension stays at 1536
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op: dimension stays at 1536
  }
}

