/**
 * LoggingInterceptor — structured per-request observability.
 *
 * Records one log line per request:
 *   [reqId] METHOD /path status=200 duration=45ms user=uuid role=manager
 *
 * Also injects X-Response-Time and X-Request-Id response headers so APM
 * tools (Datadog, Grafana, New Relic) can correlate frontend traces.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly log = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx      = context.switchToHttp();
    const req      = ctx.getRequest<Request & { user?: any; id?: string }>();
    const res      = ctx.getResponse<Response>();
    const start    = Date.now();

    const requestId = String(
      req.headers['x-request-id'] || req.id || randomUUID(),
    );
    const method = req.method;
    const path   = req.originalUrl || req.url;

    // Attach request ID so the exception filter picks it up too
    (req as any).id = requestId;
    res.setHeader('X-Request-Id', requestId);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const status   = res.statusCode;
          const user     = req.user;
          const userId   = user?.userId ?? user?.sub ?? 'anon';
          const role     = user?.role   ?? '-';

          this.log.log(
            `[${requestId}] ${method} ${path} ${status} ${duration}ms user=${userId} role=${role}`,
          );
          res.setHeader('X-Response-Time', `${duration}ms`);
        },
        error: (err) => {
          const duration = Date.now() - start;
          const status   = err?.status ?? 500;
          const userId   = req.user?.userId ?? 'anon';

          this.log.warn(
            `[${requestId}] ${method} ${path} ${status} ${duration}ms user=${userId} — ${err?.message ?? 'error'}`,
          );
          res.setHeader('X-Response-Time', `${duration}ms`);
        },
      }),
    );
  }
}
