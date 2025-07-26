// src/main.ts
// Updated to include body-parser for raw body access, global prefix, and swagger setup

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { setupSwagger } from './swagger.setup';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffers logs until a custom logger is attached
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('NestApplication'); // Use a standard Nest Logger for bootstrap phase

  // Enable raw body parsing for ActivityPub HTTP Signature verification
  // The 'rawBody' property needs to be accessible for digest calculation
  app.use(bodyParser.json({
    limit: '10mb', // Adjust limit as needed
    verify: (req: any, res, buf) => {
      // Store the raw body buffer on the request object for later use by guards/interceptors
      req.rawBody = buf;
    },
  }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

  // For specific ActivityPub content types, ensure raw body is also captured
  app.use(bodyParser.raw({
    type: 'application/activity+json',
    limit: '10mb',
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use(bodyParser.raw({
    type: 'application/ld+json',
    limit: '10mb',
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
  }));

  // Apply global validation pipe to automatically validate incoming DTOs
  app.useGlobalPipes(new ValidationPipe({
    transform: true, // Automatically transform payloads to DTO instances
    whitelist: true, // Remove properties not defined in the DTO
    forbidNonWhitelisted: true, // Throw an error if non-whitelisted properties are present
  }));

  // Set a global API prefix for most application routes.
  // Routes under .well-known, nodeinfo, ns, health, and root path (for frontend) are excluded.
  app.setGlobalPrefix('api', {
    exclude: ['.well-known/(.*)', 'nodeinfo/(.*)', 'ns/(.*)', 'health', ''], // Exclude paths for specific public endpoints
  });

  // Setup Swagger API documentation
  setupSwagger(app);

  const port = configService.get<number>('PORT') || 3000; // Get port from ConfigService
  await app.listen(port);
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
