/**
 * BillingTasksService — scheduled background jobs for billing.
 * Runs daily to expire overdue subscriptions and send expiry warnings.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Subscription, SubStatus } from './billing.entity';
import { Organisation } from '../organisations/organisation.entity';
import { User } from '../users/user.entity';
import { PushService } from '../push/push.service';
import { NotificationService } from '../notifications-gateway/notification.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BillingTasksService {
  private readonly log = new Logger(BillingTasksService.name);

  // Grace period: orgs remain accessible for 7 days after subscription lapses
  private readonly GRACE_PERIOD_DAYS = 7;

  constructor(
    @InjectRepository(Subscription) private subRepo: Repository<Subscription>,
    @InjectRepository(Organisation) private orgRepo: Repository<Organisation>,
    @InjectRepository(User)         private userRepo: Repository<User>,
    @Optional() private pushService: PushService,
    @Optional() private notificationService: NotificationService,
    @Optional() private notificationsService: NotificationsService,
  ) {}

  // ── Run every day at 8 AM Nairobi time ──────────────────────────────
  @Cron('0 8 * * *', { timeZone: 'Africa/Nairobi' })
  async dailyBillingChecks() {
    this.log.log('Running daily billing checks...');
    await this.expireOverdue();
    await this.sendExpiryWarnings();
  }

  // ── Expire subscriptions past their end date ─────────────────────────
  private async expireOverdue() {
    const now = new Date();

    // Step 1: ACTIVE → PAST_DUE when period has ended
    const lapsed = await this.subRepo.find({
      where: { status: SubStatus.ACTIVE, currentPeriodEnd: LessThan(now) },
    });
    for (const sub of lapsed) {
      sub.status = SubStatus.PAST_DUE;
      await this.subRepo.save(sub);
      this.log.warn(`Subscription past_due: org ${sub.organisationId}`);
    }

    // Step 2: PAST_DUE → EXPIRED + deactivate org after grace period
    const graceDeadline = new Date(now.getTime() - this.GRACE_PERIOD_DAYS * 86400000);
    const graceLapsed = await this.subRepo.find({
      where: { status: SubStatus.PAST_DUE, currentPeriodEnd: LessThan(graceDeadline) },
    });
    for (const sub of graceLapsed) {
      sub.status = SubStatus.EXPIRED;
      await this.subRepo.save(sub);
      await this.orgRepo.update({ id: sub.organisationId }, { isActive: false });
      this.log.warn(
        `Subscription EXPIRED after grace period — org ${sub.organisationId} deactivated`,
      );
    }

    const total = lapsed.length + graceLapsed.length;
    if (total) this.log.log(`Billing checks: ${lapsed.length} → past_due, ${graceLapsed.length} → expired+deactivated`);
  }

  // ── Warn orgs whose subscription expires in 3 or 7 days ─────────────
  private async sendExpiryWarnings() {
    const warnings = [
      { days: 7,  status: SubStatus.ACTIVE },
      { days: 3,  status: SubStatus.ACTIVE },
      { days: 1,  status: SubStatus.ACTIVE },
    ];

    for (const w of warnings) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + w.days);
      const dayBefore = new Date(cutoff);
      dayBefore.setDate(dayBefore.getDate() - 1);

      const subs = await this.subRepo
        .createQueryBuilder('s')
        .where('s.status = :status', { status: w.status })
        .andWhere('s.currentPeriodEnd <= :cutoff', { cutoff: cutoff.toISOString() })
        .andWhere('s.currentPeriodEnd > :floor', { floor: dayBefore.toISOString() })
        .getMany();

      for (const sub of subs) {
        // Find org admin
        const admin = await this.userRepo.findOne({
          where: { organisationId: sub.organisationId, role: 'admin' as any },
        });
        if (!admin) continue;

        this.log.log(`Sending ${w.days}-day expiry warning to org ${sub.organisationId}`);

        this.pushService?.notifySubscriptionExpiring(admin.id, w.days)
          .catch(e => this.log.error(`Push (subscription expiring) failed for ${admin.id}: ${(e as Error).message}`));
        this.notificationsService?.notifySubscriptionExpiring(admin.id, w.days);
        this.notificationService?.notifySubscriptionExpiring({
          phone:   admin.phone,
          email:   admin.email,
          name:    admin.name,
          days:    w.days,
          orgName: admin.companyName || '',
        }).catch(e => this.log.error(`SMS/email (subscription expiring) failed for ${admin.id}: ${(e as Error).message}`));
      }
    }
  }

  // ── Trial → expired after grace period; deactivate org ───────────────
  @Cron('30 8 * * *', { timeZone: 'Africa/Nairobi' })
  async expireTrials() {
    // Use trialEndsAt when set, fall back to createdAt + 14 days
    const now = new Date();

    const expiredTrials = await this.subRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: SubStatus.TRIAL })
      .andWhere('s.trialEndsAt IS NOT NULL AND s.trialEndsAt < :now', { now: now.toISOString() })
      .getMany();

    for (const sub of expiredTrials) {
      sub.status = SubStatus.EXPIRED;
      await this.subRepo.save(sub);
      await this.orgRepo.update({ id: sub.organisationId }, { isActive: false });
      this.log.warn(`Trial expired — org ${sub.organisationId} deactivated`);

      // Notify org admin via all channels
      const trialAdmin = await this.userRepo.findOne({
        where: { organisationId: sub.organisationId, role: 'admin' as any },
      });
      if (trialAdmin) {
        this.notificationsService?.notifyTrialExpired(trialAdmin.id);
        this.pushService?.notifySubscriptionExpiring(trialAdmin.id, 0)
          .catch(e => this.log.error(`Push (trial expired) failed for ${trialAdmin.id}: ${(e as Error).message}`));
        this.notificationService?.notifySubscriptionExpiring({
          phone:   trialAdmin.phone,
          email:   trialAdmin.email,
          name:    trialAdmin.name,
          days:    0,
          orgName: trialAdmin.companyName || '',
        }).catch(e => this.log.error(`SMS/email (trial expired) failed for ${trialAdmin.id}: ${(e as Error).message}`));
      }
    }

    if (expiredTrials.length) {
      this.log.log(`Expired ${expiredTrials.length} trials`);
    }
  }
}
