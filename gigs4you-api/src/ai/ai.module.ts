import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { CuuMonitorService } from './cuu-monitor.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisProvider } from '../common/redis.provider';

@Module({
  imports: [
    HttpModule.register({ timeout: 15000, maxRedirects: 2 }),
    NotificationsModule,
  ],
  controllers: [AiController],
  providers:   [AiService, CuuMonitorService, RedisProvider],
  exports:     [AiService],
})
export class AiModule {}
