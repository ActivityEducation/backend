import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Sets up Swagger API documentation for the application.
 * @param app The NestJS application instance.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('EducationPub API')
    .setDescription(
      'The API documentation for this instances\' Federated Education Platform server.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT Bearer token',
        in: 'header',
      },
      'JWT-auth', // This key must match the name given in the @ApiBearerAuth decorator
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);
}