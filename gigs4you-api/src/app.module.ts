import * as Joi from 'joi';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AgentsModule } from './agents/agents.module';
import { TasksModule } from './tasks/tasks.module';
import { GpsModule } from './gps/gps.module';
import { SkillsModule } from './skills/skills.module';
import { WorkersModule } from './workers/workers.module';
import { ApplicationsModule } from './applications/applications.module';
import { WalletModule } from './wallet/wallet.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JobsModule } from './jobs/jobs.module';
import { ReportsModule } from './reports/reports.module';
import { OrganisationsModule } from './organisations/organisations.module';
import { BillingModule } from './billing/billing.module';
import { VerificationModule } from './verification/verification.module';
import { MatchingModule } from './matching/matching.module';
import { ChatModule } from './chat/chat.module';
import { ContactModule } from './contact/contact.module';
import { EmailModule } from './email/email.module';
import { SeedModule } from './auth/seed.module';
import { UploadModule } from './upload/upload.module';
import { PushModule } from './push/push.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { Redis } from 'ioredis';
import { RedisThrottlerStorage } from './common/redis-throttler.storage';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { OrgScopeInterceptor } from './common/interceptors/org-scope.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { HttpCacheInterceptor } from './common/interceptors/http-cache.interceptor';
import { HealthController } from './health.controller';
import { NotificationGatewayModule } from './notifications-gateway/notification.module';
import { SystemOptionsModule } from './system-options/system-options.module';
import { AuditModule } from './audit/audit.module';
import { AiModule } from './ai/ai.module';
import { DisputesModule } from './disputes/disputes.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { ApiCacheModule } from './common/cache/api-cache.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { DataRetentionModule } from './common/data-retention/data-retention.module';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD,       useClass: AppThrottlerGuard },
    // Interceptors run in registration order: OrgScope → HttpCache → Audit
    { provide: APP_INTERCEPTOR, useClass: OrgScopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpCacheInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV:            Joi.string().valid('development', 'production', 'test').default('development'),
        APP_PORT:            Joi.number().default(3000),
        DB_HOST:             Joi.string().required(),
        DB_PORT:             Joi.number().default(5432),
        DB_NAME:             Joi.string().required(),
        DB_USER:             Joi.string().required(),
        DB_PASSWORD:         Joi.string().required(),
        JWT_SECRET:          Joi.string().min(32).required(),
        JWT_REFRESH_SECRET:  Joi.string().min(32).invalid(Joi.ref('JWT_SECRET')).required()
          .messages({ 'any.invalid': 'JWT_REFRESH_SECRET must be different from JWT_SECRET' }),
        JWT_EXPIRES_IN:      Joi.string().default('15m'),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),
        REDIS_HOST:          Joi.string().default('localhost'),
        REDIS_PORT:          Joi.number().default(6379),
      }),
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),

    ScheduleModule.forRoot(),

    // BullMQ — Redis-backed job queues for async notifications (SMS/email)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: +(config.get('REDIS_PORT') ?? 6379),
        },
      }),
    }),

    // Redis-backed rate limiting — counters are shared across all API instances.
    // Falls back gracefully to "fail open" when Redis is unavailable.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) => {
        let storage: RedisThrottlerStorage | undefined;
        try {
          const redisClient = new Redis({
            host:                  config.get('REDIS_HOST', 'localhost'),
            port:                  +(config.get('REDIS_PORT') ?? 6379),
            lazyConnect:           true,
            enableOfflineQueue:    false,
            connectTimeout:        2_000,
          });
          storage = new RedisThrottlerStorage(redisClient);
        } catch (_) {
          // If Redis fails to initialise, the storage is undefined and
          // @nestjs/throttler falls back to its in-memory default.
        }
        return {
          throttlers: [
            // Unauthenticated — strict; applies to login/signup probes
            { name: 'unauth', ttl: 60_000, limit:  30 },
            // Authenticated — normal usage (employers, workers, agents, etc.)
            { name: 'auth',   ttl: 60_000, limit: 300 },
            // Admin tier — dashboards, reports, bulk operations
            { name: 'admin',  ttl: 60_000, limit: 600 },
          ],
          ...(storage ? { storage } : {}),
        };
      },
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host:     config.get('DB_HOST'),
        port:     +(config.get<number>('DB_PORT') ?? 5432),
        database: config.get('DB_NAME'),
        username: config.get('DB_USER'),
        password: config.get('DB_PASSWORD'),
        synchronize: false,  // NEVER synchronize — use migrations instead
        migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
        migrationsRun: false,   // run manually: npm run migration:run
        autoLoadEntities: true,
        logging: config.get('NODE_ENV') === 'development',
        // ── Connection pool (node-postgres `pg` driver options) ──────────────
        extra: {
          max:                    parseInt(config.get('DB_POOL_SIZE')    ?? '20'),
          min:                    parseInt(config.get('DB_POOL_MIN')     ?? '2'),
          idleTimeoutMillis:      30_000,   // drop idle connections after 30 s
          connectionTimeoutMillis: 5_000,   // fail fast if DB is unreachable
          statement_timeout:      30_000,   // kill queries running > 30 s
          application_name:       'gigs4you-api',
        },
      }),
    }),

    EncryptionModule,
    ApiCacheModule,
    MetricsModule,
    DataRetentionModule,
    AuthModule,
    UsersModule,
    AgentsModule,
    TasksModule,
    GpsModule,
    SkillsModule,
    WorkersModule,
    ApplicationsModule,
    WalletModule,
    NotificationsModule,
    JobsModule,
    ReportsModule,
    OrganisationsModule,
    BillingModule,
    VerificationModule,
    MatchingModule,
    ChatModule,
    ContactModule,
    EmailModule,
    // SeedModule only available in development
    ...(process.env.NODE_ENV !== 'production' ? [SeedModule] : []),
    UploadModule,
    PushModule,
    NotificationGatewayModule,
    SystemOptionsModule,
    AuditModule,
    AiModule,
    DisputesModule,
  ],
})
export class AppModule {}
// HealthController registered directly — no separate module needed

