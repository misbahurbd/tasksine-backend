import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RedisStore } from 'connect-redis';
import session from 'express-session';
import * as passport from 'passport';
import { createClient } from 'redis';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Enable implicit type conversion
      },
    }),
  );

  // Configure Redis client for session store
  const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error', err);
  });

  await redisClient.connect().catch((err) => {
    console.error('Failed to connect to Redis:', err);
  });

  // Configure session middleware with Redis store
  app.use(
    session({
      store: new RedisStore({ client: redisClient, prefix: 'auth:' }),
      secret:
        process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
      resave: true,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        sameSite: 'lax',
      },
      name: 'sessionId',
    }),
  );

  // Initialize passport and session support
  app.use(passport.initialize());
  app.use(passport.session());

  // Enable CORS if needed
  app.enableCors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Enable application versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  // Configure swagger documentation
  const config = new DocumentBuilder()
    .setTitle('TaskSine API')
    .setDescription(
      `TaskSine is a comprehensive SaaS platform that combines project management and time tracking capabilities. The API enables programmatic access to tasks, projects, time entries, team management, and analytics features.`,
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
