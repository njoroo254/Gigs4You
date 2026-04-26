import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';
import { PushService } from '../push/push.service';

/**
 * Re-sends push notifications for important unread notifications every 5 min.
 * After re-sending, remindAt is bumped +15 min so the next reminder fires
 * 15 minutes later, not 5 minutes later.
 */
@Injectable()
export class ReminderScheduler {
  private readonly log = new Logger(ReminderScheduler.name);

  constructor(
    private notifService: NotificationsService,
    private pushService: PushService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async resendImportantUnread() {
    const due = await this.notifService.findDueReminders();
    if (!due.length) return;

    this.log.log(`Resending ${due.length} important unread notification(s)`);

    for (const notif of due) {
      try {
        await this.pushService.sendToUser(notif.userId, {
          title: `🔔 Reminder: ${notif.title}`,
          body:  notif.body,
          data:  {
            type:       notif.actionType || 'system',
            actionId:   notif.actionId  || '',
            notifId:    notif.id,
            screen:     this.screenForType(notif.actionType),
          },
        });
        // Snooze: set next reminder 15 min from now
        await this.notifService.snoozeReminder(notif.id);
      } catch (e) {
        this.log.error(`Failed to resend notification ${notif.id}: ${(e as Error).message}`);
      }
    }
  }

  private screenForType(type?: string): string {
    switch (type) {
      case 'task':    return '/tasks';
      case 'job':     return '/jobs';
      case 'payment': return '/wallet';
      case 'chat':    return '/chat';
      default:        return '/dashboard';
    }
  }
}
