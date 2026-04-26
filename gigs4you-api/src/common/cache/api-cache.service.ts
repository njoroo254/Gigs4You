/**
 * ApiCacheService — lightweight Redis-backed response cache for read-heavy endpoints.
 *
 * Usage:
 *   const cached = await this.cache.get<MyType>('key');
 *   if (cached) return cached;
 *   const result = await expensiveQuery();
 *   await this.cache.set('key', result, 60);  // TTL in seconds
 *   return result;
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis.provider';

@Injectable()
export class ApiCacheService {
  private readonly log = new Logger(ApiCacheService.name);
  private readonly PREFIX = 'api:cache:';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(this.PREFIX + key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.log.debug(`Cache GET miss/error for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.setex(this.PREFIX + key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      this.log.debug(`Cache SET error for ${key}: ${(err as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(this.PREFIX + key);
    } catch (err) {
      this.log.debug(`Cache DEL error for ${key}: ${(err as Error).message}`);
    }
  }

  /** Invalidate all keys matching a glob pattern (e.g. 'platform:stats:*') */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(this.PREFIX + pattern);
      if (keys.length > 0) await this.redis.del(...keys);
    } catch (err) {
      this.log.debug(`Cache invalidate error for ${pattern}: ${(err as Error).message}`);
    }
  }
}
