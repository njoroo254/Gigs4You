/**
 * MetricsService — thin wrapper around prom-client.
 *
 * Registers a default metrics collector (process CPU, memory, event loop lag)
 * plus application-specific counters and histograms used by MetricsInterceptor.
 *
 * Singleton: calling register() more than once is safe — prom-client deduplicates.
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleDestroy {
  readonly registry = new Registry();

  readonly httpRequestsTotal = new Counter({
    name:       'http_requests_total',
    help:       'Total number of HTTP requests processed',
    labelNames: ['method', 'route', 'status'] as const,
    registers:  [this.registry],
  });

  readonly httpRequestDuration = new Histogram({
    name:       'http_request_duration_seconds',
    help:       'HTTP request latency in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets:    [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers:  [this.registry],
  });

  readonly walletWithdrawalsTotal = new Counter({
    name:       'wallet_withdrawals_total',
    help:       'Total M-Pesa withdrawal attempts',
    labelNames: ['status'] as const,  // requested | completed | failed
    registers:  [this.registry],
  });

  readonly walletCreditsTotal = new Counter({
    name:       'wallet_credits_total',
    help:       'Total agent wallet credits',
    registers:  [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  onModuleDestroy() {
    this.registry.clear();
  }
}
