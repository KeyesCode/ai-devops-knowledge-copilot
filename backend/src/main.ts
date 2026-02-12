import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  // Log memory limit on startup
  const v8 = require('v8');
  const heapStats = v8.getHeapStatistics();
  const heapLimitMB = (heapStats.heap_size_limit / 1024 / 1024).toFixed(2);
  logger.log(`Node.js heap size limit: ${heapLimitMB}MB`);
  
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
