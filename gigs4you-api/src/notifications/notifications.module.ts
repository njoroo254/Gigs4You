// ── notifications.module.ts ──────────────────────────
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ReminderScheduler } from './reminder.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  providers: [NotificationsService, ReminderScheduler],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
