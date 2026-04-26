/**
 * MetricsInterceptor — records per-request HTTP metrics into Prometheus.
 *
 * Captures:
 *   - http_requests_total{method, route, status}
 *   - http_request_duration_seconds{method, route, status}
 *
 * Route normalisation strips UUIDs and numeric IDs so high-cardinality paths
 * like /jobs/uuid-here don't explode the label space:
 *   /jobs/3f2a...  → /jobs/:id
 *   /users/42      → /users/:id
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

const UUID_RE   = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUM_SEG_RE = /\/\d+(?=\/|$)/g;

function normaliseRoute(url: string): string {
  return url
    .split('?')[0]                    // strip query string
    .replace(UUID_RE,    ':id')
    .replace(NUM_SEG_RE, '/:id');
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req    = context.switchToHttp().getRequest<Request>();
    const res    = context.switchToHttp().getResponse<Response>();
    const method = req.method;
    const route  = normaliseRoute(req.originalUrl || req.url);
    const end    = this.metrics.httpRequestDuration.startTimer({ method, route });

    return next.handle().pipe(
      tap({
        next: () => {
          const status = String(res.statusCode);
          end({ status });
          this.metrics.httpRequestsTotal.inc({ method, route, status });
        },
        error: (err) => {
          const status = String(err?.status ?? 500);
          end({ status });
          this.metrics.httpRequestsTotal.inc({ method, route, status });
        },
      }),
    );
  }
}
