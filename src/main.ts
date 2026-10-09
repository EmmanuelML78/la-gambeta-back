import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

export function getCorsOptions(frontendUrl: string) {
  return {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      frontendUrl,
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  };
}

async function bootstrap() {
  // rawBody: los webhooks de Polar (Standard Webhooks) firman los bytes
  // originales del body — re-serializar el JSON parseado rompe la firma.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Security middleware
  app.use(helmet());

  // Enable CORS
  app.enableCors(
    getCorsOptions(
      configService.get('FRONTEND_URL', 'http://localhost:3000'),
    ),
  );

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('La Gambeta API')
    .setDescription('API para la plataforma de reservas de canchas La Gambeta')
    .setVersion('1.0')
    .addTag(
      'Authentication',
      'Endpoints para autenticación y manejo de usuarios',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'La Gambeta API Documentation',
    customfavIcon: '🎾',
    customCssUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });

  const port = configService.get<number>('PORT', 3001);
  await app.listen(port);

  logger.log(`🚀 La Gambeta API running on: http://localhost:${port}/api/v1`);
  logger.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
  logger.log('🎾 La Gambeta - Sistema de reservas de canchas');
}

if (require.main === module) {
  void bootstrap();
}
