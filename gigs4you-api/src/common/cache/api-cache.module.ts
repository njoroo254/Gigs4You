import { Global, Module } from '@nestjs/common';
import { RedisProvider } from '../redis.provider';
import { ApiCacheService } from './api-cache.service';

@Global()
@Module({
  providers: [RedisProvider, ApiCacheService],
  exports:   [ApiCacheService],
})
export class ApiCacheModule {}
