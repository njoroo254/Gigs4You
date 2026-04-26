import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NotificationService } from './notification.service';
import { NOTIFICATION_QUEUE, NotifJob, SmsJobData, EmailJobData } from './notification.queue';

@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor {
  private readonly log = new Logger(NotificationProcessor.name);

  constructor(private readonly svc: NotificationService) {}

  @Process(NotifJob.SMS)
  async handleSms(job: Job<SmsJobData>): Promise<void> {
    const { phone, message } = job.data;
    this.log.debug(`Processing SMS job ${job.id} → ${phone}`);
    await this.svc.dispatchSms(phone, message);
  }

  @Process(NotifJob.EMAIL)
  async handleEmail(job: Job<EmailJobData>): Promise<void> {
    const { to, subject } = job.data;
    this.log.debug(`Processing email job ${job.id} → ${to} [${subject}]`);
    await this.svc.dispatchEmail(job.data);
  }
}
