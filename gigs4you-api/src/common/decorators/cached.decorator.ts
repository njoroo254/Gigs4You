import { SetMetadata } from '@nestjs/common';

export const CACHE_TTL_KEY = 'http_cache_ttl';

/**
 * Mark a GET handler for Redis-backed response caching.
 * The cache key is derived from: path + query params + user role + orgId.
 *
 * @param ttlSeconds How long to keep the cached response (default 60 s).
 *
 * @example
 *   @Get('summary')
 *   @Cached(120)
 *   summary() { ... }
 */
export const Cached = (ttlSeconds = 60) => SetMetadata(CACHE_TTL_KEY, ttlSeconds);
