import * as Sentry from '@sentry/node';

// ── PII scrubbing helpers ─────────────────────────────────────────────────────
// Applied in the Sentry beforeSend hook so personal data never leaves the server.
const _PII_FIELDS = new Set([
  'password', 'password_hash', 'passwordHash',
  'phone', 'mpesa_phone', 'mpesaPhone', 'phoneNumber',
  'email', 'identifier',
  'token', 'refresh_token', 'refreshToken', 'access_token', 'accessToken',
  'pin', 'otp', 'code',
  'id_number', 'idNumber', 'national_id',
]);

function _scrubObj(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (_PII_FIELDS.has(k)) {
      out[k] = '[Redacted]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = _scrubObj(v as Record<string, any>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function _scrubSentryEvent(event: Sentry.Event): Sentry.Event {
  try {
    if (event.request?.data && typeof event.request.data === 'object') {
      event.request.data = _scrubObj(event.request.data as Record<string, any>);
    }
    if (event.extra && typeof event.extra === 'object') {
      event.extra = _scrubObj(event.extra as Record<string, any>);
    }
  } catch (_) { /* never let scrubbing crash the app */ }
  return event;
}

// Initialise Sentry BEFORE anything else
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release:     process.env.APP_VERSION || '1.0.0',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
    ],
    beforeSend: _scrubSentryEvent,
  });
}

import helmet from 'helmet';
import * as express from 'express';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { MetricsInterceptor } from './common/metrics/metrics.interceptor';
import { MetricsService } from './common/metrics/metrics.service';

async function bootstrap() {
  // Disable the default body parser so we can configure size limits ourselves
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // ── Request body size limits ────────────────────────────────────────────────
  // Express defaults to 100 kB. We set a conservative 2 MB for API payloads.
  // Photo upload endpoints accept base64-encoded images so this must be at least
  // ~1.5 MB (1 MB image → ~1.33 MB base64 + headers).
  const BODY_LIMIT = process.env.BODY_SIZE_LIMIT ?? '2mb';

  // Capture the raw body buffer on every request so webhook handlers can verify
  // HMAC signatures against the exact bytes Stripe / Safaricom sent.
  // We store it as req.rawBody — the verify callback runs before JSON parsing.
  app.use(
    express.json({
      limit: BODY_LIMIT,
      verify: (req: any, _res: any, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }));

  // Security headers
  app.use(helmet({
    crossOriginEmbedderPolicy: false,  // needed for Swagger UI
    contentSecurityPolicy: false,       // configure explicitly for production
  }));

  // Global prefix — all routes become /api/v1/...
  app.setGlobalPrefix('api/v1');

  // Auto-validate all incoming request bodies
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new MetricsInterceptor(app.get(MetricsService)),
  );
  const isProduction = process.env.NODE_ENV === 'production';
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:           true,   // strip unknown fields before they reach handlers
      forbidNonWhitelisted: isProduction,  // 400 in production, lenient in dev
      transform:           true,   // auto-convert types (string "1" → number 1)
      stopAtFirstError:    false,  // return all validation errors at once
    }),
  );

  // CORS — allow Flutter app and React dashboard to connect
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [
        'https://dashboard.gigs4you.co.ke',  // Production dashboard
        'https://app.gigs4you.co.ke',        // Production mobile/web app
        'https://gigs4you.co.ke',            // Main website
      ]
    : [
        'http://localhost:3001',    // React dashboard (dev)
        'http://localhost:5173',    // Vite dashboard (dev)
        'http://localhost:8080',    // Alternative dev port
        'http://10.0.2.2:3000',     // Android emulator
        /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,  // Local network (for testing)
      ];

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,  // Allow cookies/auth headers
    maxAge: 86400,      // Cache preflight for 24 hours
  });

  // Swagger API docs — visit http://localhost:3000/docs
  const config = new DocumentBuilder()
    .setTitle('Gigs4You API')
    .setDescription('Field Agent Management System — REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);

  console.log(`\n🚀 Gigs4You API running at: http://localhost:${port}/api/v1`);
  console.log(`📖 Swagger docs at:         http://localhost:${port}/docs\n`);
}

bootstrap();
