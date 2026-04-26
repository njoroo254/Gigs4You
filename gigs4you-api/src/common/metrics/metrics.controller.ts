/**
 * MetricsController — exposes /metrics for Prometheus scraping.
 *
 * Protected by a shared secret (METRICS_TOKEN env var) to prevent
 * public exposure of internal application metrics.
 * Prometheus should be configured to pass this token as a Bearer header.
 *
 * If METRICS_TOKEN is not set the endpoint is only reachable from localhost
 * (enforced by the guard below). In production METRICS_TOKEN must be set.
 */

import {
  Controller,
  Get,
  Headers,
  ForbiddenException,
  Req,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async getMetrics(
    @Headers('authorization') auth: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const token = process.env.METRICS_TOKEN;

    if (token) {
      // Token configured — require Bearer match
      if (auth !== `Bearer ${token}`) {
        throw new ForbiddenException('Invalid metrics token');
      }
    } else {
      // No token — only allow loopback requests
      const ip = req.ip || req.socket?.remoteAddress || '';
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) {
        throw new ForbiddenException('METRICS_TOKEN not configured — loopback only');
      }
    }

    const body = await this.metrics.getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(body);
  }
}
