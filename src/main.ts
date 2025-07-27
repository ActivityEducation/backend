import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { setupSwagger } from './swagger.setup';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { LoggerService } from './shared/services/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Essential for HTTP Signature verification (signature is calculated over raw body)
    bodyParser: false, // Disable NestJS's default body parser to allow custom raw body parsing
    logger: new Logger(),
  });

  // Order of body-parsers is crucial for rawBody access:
  // 1. Capture raw body for ActivityPub specific content types.
  app.use(bodyParser.raw({ type: 'application/ld+json' }));
  app.use(bodyParser.raw({ type: 'application/activity+json' }));

  // 2. Parse JSON and URL-encoded bodies.
  app.use(bodyParser.json({ type: 'application/ld+json' }));
  app.use(bodyParser.json({ type: 'application/activity+json' }));
  app.use(bodyParser.json()); // For general JSON
  app.use(bodyParser.urlencoded({ extended: true })); // For form data

  const loggerService = await app.resolve(LoggerService);
  loggerService.setContext('Bootstrap');


  app.useGlobalFilters(new HttpExceptionFilter(loggerService));  
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, }));  
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Enable CORS for web clients
  app.enableCors({
    origin: '*', // WARNING: Restrict to trusted origins in production
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    // Expose/allow headers relevant for ActivityPub HTTP Signatures
    allowedHeaders: 'Content-Type, Accept, Authorization, Signature, Date, Digest',
    exposedHeaders: 'Signature, Date, Digest',
  });

  // Set a global prefix for API routes, excluding well-known and nodeinfo
  app.setGlobalPrefix('api', {
    exclude: ['.well-known/(.*)', 'nodeinfo/(.*)', 'ns/(.*)', 'health', 'robots.txt'],
  });
  setupSwagger(app);

  await app.listen(80);
  loggerService.log(`Application is running on: ${await app.getUrl()}`, 'Bootstrap');
}
bootstrap();