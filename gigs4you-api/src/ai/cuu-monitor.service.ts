import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';
import { EmailService } from '../email/email.service';
import { REDIS_CLIENT } from '../common/redis.provider';
import type { Redis } from 'ioredis';

const THRESHOLDS = [70, 90, 100] as const;
type Threshold = typeof THRESHOLDS[number];

@Injectable()
export class CuuMonitorService {
  private readonly log = new Logger(CuuMonitorService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // Run every hour at minute 5 (avoids piling up with other hourly tasks)
  @Cron('0 5 * * * *')
  async checkCuuThresholds(): Promise<void> {
    try {
      await this._run();
    } catch (err: any) {
      this.log.error(`CUU monitor run failed: ${err?.message}`);
    }
  }

  private async _run(): Promise<void> {
    // Pull current-month CUU usage per org from the AI service's shared table
    const usageRows: Array<{ orgId: string; totalCuu: number }> = await this.db
      .query(
        `SELECT "orgId", COALESCE(SUM("cuuCost"), 0)::int AS "totalCuu"
         FROM cathy_usage_logs
         WHERE DATE_TRUNC('month', "createdAt") = DATE_TRUNC('month', NOW())
           AND "orgId" IS NOT NULL
         GROUP BY "orgId"`,
      )
      .catch(() => []);

    if (!usageRows.length) return;

    // Pull monthly limits per org from subscriptions table
    const orgIds = usageRows.map((r) => r.orgId);
    const limitRows: Array<{ organisationId: string; monthlyCuuLimit: number | null }> =
      await this.db
        .query(
          `SELECT "organisationId", "monthlyCuuLimit"
           FROM subscriptions
           WHERE "organisationId" = ANY($1::uuid[])
             AND status = 'active'`,
          [orgIds],
        )
        .catch(() => []);

    const limitMap = new Map<string, number | null>(
      limitRows.map((r) => [r.organisationId, r.monthlyCuuLimit]),
    );

    for (const { orgId, totalCuu } of usageRows) {
      const limit = limitMap.get(orgId) ?? null;
      if (!limit || limit <= 0) continue; // unlimited or no subscription

      const pct = Math.min(Math.round((totalCuu / limit) * 100), 100);
      await this._notifyIfThresholdCrossed(orgId, pct, totalCuu, limit);
    }
  }

  private async _notifyIfThresholdCrossed(
    orgId:    string,
    pct:      number,
    used:     number,
    limit:    number,
  ): Promise<void> {
    const month = new Date().toISOString().slice(0, 7); // e.g. "2026-04"

    for (const threshold of THRESHOLDS) {
      if (pct < threshold) continue;

      const dedupeKey = `cuu:notified:${orgId}:${month}:${threshold}`;
      const already   = await this.redis.get(dedupeKey).catch(() => null);
      if (already) continue;

      // Mark as notified for this threshold this month (expires after 35 days)
      await this.redis.set(dedupeKey, '1', 'EX', 35 * 24 * 3600).catch(() => null);

      const { title, body } = this._message(threshold, pct, used, limit);

      // Find all admins + managers for this org, plus all super_admins
      const recipients: Array<{ id: string; email: string | null; name: string }> =
        await this.db
          .query(
            `SELECT id, email, name
             FROM users
             WHERE (("organisationId" = $1 AND role IN ('admin', 'manager'))
                    OR role = 'super_admin')
               AND "isActive" = true`,
            [orgId],
          )
          .catch(() => []);

      for (const user of recipients) {
        // In-app notification
        this.notifications.notify(
          user.id,
          title,
          body,
          NotificationType.SYSTEM,
          orgId,
          'ai_usage',
          threshold >= 90,   // mark important at 90%+ so it re-notifies if unread
        );
      }

      // Email alert at 90 % and 100 % — send to all admins of the org
      if (threshold >= 90) {
        const orgAdmins = recipients.filter((u) => u.email);
        for (const admin of orgAdmins) {
          this.email
            .sendAdminAlert(
              `AI usage ${threshold === 100 ? 'limit reached' : 'at ' + threshold + '%'} for org ${orgId}`,
              this._emailHtml(admin.name, threshold, pct, used, limit, orgId),
            )
            .catch(() => null);
        }
      }

      this.log.warn(
        `CUU monitor: org ${orgId} at ${pct}% (${used}/${limit}) — threshold ${threshold}% alert sent to ${recipients.length} recipient(s)`,
      );
    }
  }

  private _message(
    threshold: Threshold,
    pct:       number,
    used:      number,
    limit:     number,
  ): { title: string; body: string } {
    if (threshold === 100) {
      return {
        title: 'AI usage limit reached',
        body:  `Your organisation has used 100% of its monthly AI capacity (${used}/${limit} units). Upgrade your plan to continue using Cathy without interruption.`,
      };
    }
    return {
      title: `AI usage at ${threshold}%`,
      body:  `Your organisation has used ${pct}% of its monthly AI capacity (${used}/${limit} units). Consider upgrading your plan before the limit is reached.`,
    };
  }

  private _emailHtml(
    name:      string,
    threshold: Threshold,
    pct:       number,
    used:      number,
    limit:     number,
    orgId:     string,
  ): string {
    const colour  = threshold === 100 ? '#dc2626' : '#d97706';
    const heading = threshold === 100
      ? 'AI Usage Limit Reached'
      : `AI Usage Alert — ${threshold}% Threshold`;

    return `
      <div style="font-family:Arial,sans-serif;max-width:600px">
        <h2 style="color:${colour}">${heading}</h2>
        <p>Hi ${name},</p>
        <p>Your organisation's Cathy AI usage has reached <strong>${pct}%</strong> of its monthly limit.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Used this month</td>
            <td style="padding:8px;border:1px solid #e5e7eb">${used} AI units</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Monthly limit</td>
            <td style="padding:8px;border:1px solid #e5e7eb">${limit} AI units</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Organisation ID</td>
            <td style="padding:8px;border:1px solid #e5e7eb">${orgId}</td>
          </tr>
        </table>
        ${threshold === 100
          ? '<p style="color:#dc2626;font-weight:bold">AI features may be restricted until the plan is upgraded or the next billing cycle begins.</p>'
          : '<p>To avoid interruption, consider upgrading your plan in the billing dashboard.</p>'
        }
        <p style="color:#6b7280;font-size:12px;margin-top:24px">
          Generated at ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
        </p>
      </div>
    `;
  }
}
