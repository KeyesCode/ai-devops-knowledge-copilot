import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { VectorStoreModule } from './vector-store/vector-store.module';
import { GitHubModule } from './github/github.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { LLMModule } from './llm/llm.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: false, // Use migrations instead
        migrationsRun: false, // Auto-run migrations on startup
        extra: {
          max: 5, // Limit connection pool to 5 connections to reduce memory usage
          connectionTimeoutMillis: 10000,
        },
      }),
      inject: [ConfigService],
    }),
    EmbeddingsModule,
    VectorStoreModule,
    GitHubModule,
    RetrievalModule,
    LLMModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
