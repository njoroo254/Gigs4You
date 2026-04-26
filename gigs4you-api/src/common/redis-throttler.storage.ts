/**
 * RedisThrottlerStorage — Redis-backed storage for @nestjs/throttler v5.
 *
 * Replaces the default in-memory map so rate-limit counters are shared across
 * all running API instances. Uses ioredis with atomic INCR + PEXPIRE semantics.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { Redis } from 'ioredis';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly log = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: Redis) {}

  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${key}`;

    try {
      // INCR is atomic — safe under concurrent requests across multiple instances.
      // PEXPIRE sets TTL in milliseconds; only applied on first hit (when totalHits === 1)
      // to preserve the original window start time.
      const pipeline = this.redis.pipeline();
      pipeline.incr(redisKey);
      pipeline.pttl(redisKey);
      const results = await pipeline.exec();

      if (!results) throw new Error('Redis pipeline returned null');

      const [incrResult, pttlResult] = results;
      const totalHits   = (incrResult?.[1] as number)  ?? 1;
      let   timeToExpire = (pttlResult?.[1] as number) ?? -1;

      // Set TTL only on the first increment (to anchor the window start time)
      if (totalHits === 1 || timeToExpire < 0) {
        await this.redis.pexpire(redisKey, ttl);
        timeToExpire = ttl;
      }

      return {
        totalHits,
        timeToExpire: Math.max(0, timeToExpire),
      };
    } catch (err) {
      // If Redis is unavailable, fail open (don't block the request)
      this.log.warn(`Rate-limit storage error (failing open): ${(err as Error).message}`);
      return { totalHits: 1, timeToExpire: ttl };
    }
  }
}
