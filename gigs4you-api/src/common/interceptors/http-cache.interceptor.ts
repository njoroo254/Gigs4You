import {
  Injectable, NestInterceptor, ExecutionContext,
  CallHandler, Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ApiCacheService } from '../cache/api-cache.service';
import { CACHE_TTL_KEY } from '../decorators/cached.decorator';

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  private readonly log = new Logger(HttpCacheInterceptor.name);

  constructor(
    private readonly cache:     ApiCacheService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next:    CallHandler,
  ): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();

    // Only cache GET requests
    if (req.method !== 'GET') return next.handle();

    // Only cache handlers decorated with @Cached()
    const ttl = this.reflector.get<number>(CACHE_TTL_KEY, context.getHandler());
    if (!ttl) return next.handle();

    const key = this.buildKey(req);

    try {
      const cached = await this.cache.get<unknown>(key);
      if (cached !== null) {
        this.log.debug(`Cache HIT: ${key}`);
        return of(cached);
      }
    } catch {
      // Redis miss or error — fall through to handler
    }

    return next.handle().pipe(
      tap({
        next: async (data) => {
          try {
            await this.cache.set(key, data, ttl);
            this.log.debug(`Cache SET: ${key} (TTL ${ttl}s)`);
          } catch {
            // Non-fatal — cache write failure never breaks the response
          }
        },
      }),
    );
  }

  private buildKey(req: any): string {
    const user    = req.user;
    const role    = user?.role    ?? 'anon';
    const orgId   = user?.orgId   ?? 'none';
    // Include org and role so users from different orgs never share cached data
    const queryStr = JSON.stringify(
      Object.keys(req.query ?? {}).sort().reduce((acc: any, k) => {
        acc[k] = req.query[k];
        return acc;
      }, {}),
    );
    return `${req.path}:${role}:${orgId}:${queryStr}`;
  }
}
