import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationProcessor } from './notification.processor';
import { NOTIFICATION_QUEUE } from './notification.queue';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  providers:   [NotificationService, NotificationProcessor],
  controllers: [NotificationController],
  exports:     [NotificationService],
})
export class NotificationGatewayModule {}
