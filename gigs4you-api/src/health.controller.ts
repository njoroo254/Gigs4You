import { Controller, Get, HttpStatus, Res, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { AiService } from './ai/ai.service';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Response } from 'express';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private readonly config: ConfigService,
    @Optional() private aiService: AiService,
  ) {}

  /** Liveness probe — always 200 if the process is running. */
  @Get()
  @ApiOperation({ summary: 'Liveness probe — 200 if process is running' })
  liveness() {
    return { status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() };
  }

  /** Readiness probe — 200 if all critical dependencies are healthy, 503 otherwise. */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — 503 if PostgreSQL or Redis is unreachable' })
  async readiness(@Res() res: Response) {
    const [dbOk, redisOk, aiHealth] = await Promise.all([
      this.dataSource.query('SELECT 1').then(() => true).catch(() => false),

      (async () => {
        try {
          const r = new Redis({
            host:               this.config.get('REDIS_HOST', 'localhost'),
            port:               +(this.config.get('REDIS_PORT') ?? 6379),
            lazyConnect:        true,
            connectTimeout:     1_500,
            enableOfflineQueue: false,
          });
          await r.ping();
          r.disconnect();
          return true;
        } catch {
          return false;
        }
      })(),

      this.aiService
        ? this.aiService.getHealthStatus().catch(() => ({ status: 'unreachable' }))
        : Promise.resolve(null),
    ]);

    const aiOnline = aiHealth != null
      && (aiHealth as any)?.status !== 'unhealthy'
      && (aiHealth as any)?.status !== 'unreachable';

    const allReady = dbOk && redisOk;
    const mem = process.memoryUsage();

    const body = {
      status:    allReady ? 'ok' : 'degraded',
      db:        dbOk    ? 'connected' : 'error',
      redis:     redisOk ? 'connected' : 'unavailable',
      ai: {
        status: aiHealth == null ? 'disabled' : aiOnline ? 'online' : 'offline',
        ...(typeof aiHealth === 'object' && aiHealth !== null ? aiHealth : {}),
      },
      memory: {
        rss_mb:        Math.round(mem.rss        / 1_048_576),
        heap_mb:       Math.round(mem.heapUsed   / 1_048_576),
        heap_total_mb: Math.round(mem.heapTotal  / 1_048_576),
      },
      uptime:    Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      version:   process.env.APP_VERSION || '1.0.0',
    };

    res.status(allReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json(body);
  }
}
