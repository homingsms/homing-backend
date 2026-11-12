import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfig } from '@/config/app-config.service';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';

export const API_PREFIX = 'api/v1';
const EXPOSED_HEADERS = ['Idempotent-Replayed', 'Retry-After'];

export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);
  if (config.get('TRUST_PROXY')) {
    app.set('trust proxy', 1);
  }
  app.useBodyParser('json', { limit: config.get('BODY_LIMIT') });
  app.use(helmet());
  app.use(cookieParser());
  const origins = config.get('CORS_ORIGINS');
  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    exposedHeaders: EXPOSED_HEADERS,
  });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
