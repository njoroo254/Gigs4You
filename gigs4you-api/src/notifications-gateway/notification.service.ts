/**
 * NotificationService — unified dispatcher for SMS, Email, and Push.
 *
 * All typed helpers (notifyXxx) enqueue jobs to BullMQ so they never
 * block HTTP request threads. The NotificationProcessor picks up the
 * jobs and calls dispatchSms / dispatchEmail with exponential backoff.
 *
 * Priority order per channel:
 *   PUSH  → task assignments, chat messages (real-time)
 *   SMS   → payments, critical alerts (high reach, no app required)
 *   EMAIL → invoices, welcome, KYC results (formatted content)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { t } from '../common/i18n';
import {
  NOTIFICATION_QUEUE, NotifJob,
  SmsJobData, EmailJobData,
} from './notification.queue';

export type EmailPayload = EmailJobData;

const BULL_DEFAULTS = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: 100,
  removeOnFail: 200,
};

@Injectable()
export class NotificationService {
  private readonly log = new Logger(NotificationService.name);
  private atClient: any = null;
  private mailer: any   = null;

  constructor(
    private config: ConfigService,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue,
  ) {
    this.initAfricasTalking();
    this.initMailer();
  }

  // ── Africa's Talking SMS ─────────────────────────────────────────────
  private initAfricasTalking() {
    try {
      const apiKey   = this.config.get('AT_API_KEY');
      const username = this.config.get('AT_USERNAME') || 'sandbox';
      if (!apiKey) {
        this.log.warn('AT_API_KEY not set — SMS notifications disabled');
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AT = require('africastalking');
      this.atClient = AT({ apiKey, username }).SMS;
      this.log.log(
        `Africa's Talking SMS initialised — username: "${username}", key prefix: "${apiKey.slice(0, 8)}..."`,
      );
    } catch (e) {
      this.log.error("Africa's Talking init failed", (e as Error).message);
    }
  }

  /** Called by NotificationProcessor only — sends SMS directly (no queue hop). */
  async dispatchSms(to: string, message: string): Promise<void> {
    if (!this.atClient) {
      this.log.debug(`[SMS MOCK] To: ${to} | Msg: ${message.slice(0, 60)}`);
      return;
    }
    const phone    = to.startsWith('+') ? to : `+254${to.replace(/^0/, '')}`;
    const senderId = (this.config.get('AT_SENDER_ID') || '').trim() || undefined;
    const payload: any = { to: [phone], message };
    if (senderId) payload.from = senderId;
    await this.atClient.send(payload);
    this.log.log(`SMS sent to ${phone}`);
  }

  async sendSmsToMany(phones: string[], message: string): Promise<void> {
    if (!phones.length) return;
    if (!this.atClient) {
      this.log.debug(`[SMS MOCK] Batch ${phones.length} | Msg: ${message.slice(0, 60)}`);
      return;
    }
    const formatted = phones.map(p => p.startsWith('+') ? p : `+254${p.replace(/^0/, '')}`);
    await this.atClient.send({
      to:      formatted,
      message,
      from:    this.config.get('AT_SENDER_ID') || 'Gigs4You',
    });
    this.log.log(`SMS batch sent to ${phones.length} recipients`);
  }

  // ── Email (nodemailer) ───────────────────────────────────────────────
  private initMailer() {
    try {
      const host = this.config.get('SMTP_HOST');
      if (!host) {
        this.log.warn('SMTP_HOST not set — email notifications disabled');
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer');
      this.mailer = nodemailer.createTransport({
        host,
        port:   parseInt(this.config.get('SMTP_PORT') || '587'),
        secure: this.config.get('SMTP_SECURE') === 'true',
        auth: {
          user: this.config.get('SMTP_USER'),
          pass: this.config.get('SMTP_PASS'),
        },
      });
      this.log.log(`Email mailer initialised (host: ${host})`);
      this.mailer.verify((err: any) => {
        if (err) {
          this.log.error(
            `SMTP verify FAILED — emails will not send. ` +
            `Gmail requires an App Password (not your account password). ` +
            `Generate one at myaccount.google.com → Security → App Passwords. ` +
            `Error: ${err.message}`,
          );
        } else {
          this.log.log('SMTP connection verified — emails are ready');
        }
      });
    } catch (e) {
      this.log.error('Mailer init failed', (e as Error).message);
    }
  }

  /** Called by NotificationProcessor only — sends email directly (no queue hop). */
  async dispatchEmail(payload: EmailPayload): Promise<void> {
    if (!this.mailer) {
      this.log.debug(`[EMAIL MOCK] To: ${payload.to} | Subject: ${payload.subject}`);
      return;
    }
    await this.mailer.sendMail({
      from:    `"Gigs4You" <${this.config.get('SMTP_FROM') || 'noreply@gigs4you.app'}>`,
      to:      payload.to,
      subject: payload.subject,
      text:    payload.text,
      html:    payload.html || payload.text,
    });
    this.log.log(`Email sent to ${payload.to}: ${payload.subject}`);
  }

  // ── Queue helpers (public for callers that build their own payloads) ──

  async sendSms(phone: string, message: string): Promise<void> {
    await this.queue.add(NotifJob.SMS, { phone, message } satisfies SmsJobData, BULL_DEFAULTS);
  }

  async sendEmail(payload: EmailPayload): Promise<void> {
    await this.queue.add(NotifJob.EMAIL, payload satisfies EmailJobData, BULL_DEFAULTS);
  }

  private async enqueueSms(phone: string, message: string): Promise<void> {
    return this.sendSms(phone, message);
  }

  private async enqueueEmail(payload: EmailPayload): Promise<void> {
    return this.sendEmail(payload);
  }

  // ── Typed notification helpers (enqueue, never block) ────────────────

  async notifyTaskAssigned(params: {
    phone?: string; email?: string; name: string;
    taskTitle: string; lang?: 'en'|'sw';
  }) {
    const { lang = 'en' } = params;
    const msg = t('task.assigned', lang, { title: params.taskTitle });
    if (params.phone) await this.enqueueSms(params.phone, msg);
    if (params.email) {
      await this.enqueueEmail({
        to: params.email, subject: '📋 New Task Assigned',
        text: `Hi ${params.name},\n\n${msg}\n\nOpen the Gigs4You app to view and accept your task.`,
        html: `<p>Hi <strong>${params.name}</strong>,</p><p>${msg}</p><p>Open the Gigs4You app to view and accept your task.</p>`,
      });
    }
  }

  async notifyPaymentSent(params: {
    phone?: string; email?: string; amount: number; lang?: 'en'|'sw';
  }) {
    const { lang = 'en' } = params;
    const msg = t('payment.received', lang, { amount: params.amount });
    if (params.phone) await this.enqueueSms(params.phone, msg);
    if (params.email) {
      await this.enqueueEmail({
        to: params.email, subject: '💰 Payment Received',
        text: msg,
        html: `<p>${msg}</p>`,
      });
    }
  }

  async notifyKycResult(params: {
    phone?: string; email?: string; name: string;
    approved: boolean; note?: string; lang?: 'en'|'sw';
  }) {
    const { lang = 'en', approved } = params;
    const key   = approved ? 'verify.approved' : 'verify.rejected';
    const msg   = t(key, lang);
    const emoji = approved ? '✅' : '❌';
    if (params.phone) await this.enqueueSms(params.phone, msg);
    if (params.email) {
      await this.enqueueEmail({
        to: params.email,
        subject: `${emoji} KYC Verification ${approved ? 'Approved' : 'Rejected'}`,
        text: `Hi ${params.name},\n\n${msg}${params.note ? `\n\nNote: ${params.note}` : ''}`,
        html: `<p>Hi <strong>${params.name}</strong>,</p><p>${msg}</p>${params.note ? `<p><em>${params.note}</em></p>` : ''}`,
      });
    }
  }

  async notifySubscriptionExpiring(params: {
    phone?: string; email?: string; name: string;
    days: number; orgName: string; lang?: 'en'|'sw';
  }) {
    const { lang = 'en' } = params;
    const msg = t('sub.trial_ending', lang, { days: params.days });
    if (params.phone) await this.enqueueSms(params.phone, msg);
    if (params.email) {
      await this.enqueueEmail({
        to: params.email, subject: '⚠️ Subscription Expiring Soon',
        text: `Hi ${params.name},\n\n${msg}\n\nRenew at: https://app.gigs4you.app/billing`,
        html: `<p>Hi <strong>${params.name}</strong>,</p><p>${msg}</p><p><a href="https://app.gigs4you.app/billing">Renew your subscription</a></p>`,
      });
    }
  }

  async notifyVerificationSubmitted(params: {
    phone?: string; email?: string; name: string; lang?: 'en'|'sw';
  }) {
    const msg = `Hi ${params.name}, your identity documents have been received on Gigs4You. We will review and notify you within 24 hours.`;
    if (params.phone) await this.enqueueSms(params.phone, msg);
    if (params.email) {
      await this.enqueueEmail({
        to: params.email,
        subject: '📋 Verification documents received',
        text: msg,
        html: `<p>Hi <strong>${params.name}</strong>,</p><p>Thank you! Your identity documents have been received and are now under review.</p><p>We will notify you within <strong>24 hours</strong> once the review is complete.</p>`,
      });
    }
  }

  async notifyApplicationConfirmed(params: {
    phone?: string; email?: string; name: string;
    jobTitle: string; jobId: string; lang?: 'en'|'sw';
  }) {
    const msg = `Hi ${params.name}, your application for "${params.jobTitle}" has been received. We'll notify you when there is an update.`;
    if (params.phone) await this.enqueueSms(params.phone, msg);
    if (params.email) {
      await this.enqueueEmail({
        to: params.email,
        subject: `📋 Application received — ${params.jobTitle}`,
        text: msg,
        html: `<p>Hi <strong>${params.name}</strong>,</p><p>Thank you for applying! Your application for <strong>"${params.jobTitle}"</strong> has been received.</p><p>We will notify you by SMS and email when there is an update.</p>`,
      });
    }
  }

  async notifyJobAssigned(params: {
    phone?: string; email?: string; name: string;
    jobTitle: string; jobId: string; lang?: 'en'|'sw';
  }) {
    const msg = `Hi ${params.name}, you have been selected for "${params.jobTitle}" on Gigs4You. Open the app to view details and get started.`;
    if (params.phone) await this.enqueueSms(params.phone, msg);
    if (params.email) {
      await this.enqueueEmail({
        to: params.email,
        subject: '🎉 You got the job!',
        text: msg,
        html: `<p>Hi <strong>${params.name}</strong>,</p><p>Congratulations! You have been selected for <strong>"${params.jobTitle}"</strong>.</p><p>Open the Gigs4You app to view job details and confirm your start.</p>`,
      });
    }
  }

  async notifyDisputeUpdate(params: {
    phone?: string; email?: string; name: string;
    action: 'filed' | 'under_review' | 'resolved'; disputeId: string;
    resolution?: string; note?: string; lang?: 'en'|'sw';
  }) {
    const messages: Record<string, string> = {
      filed:        `A dispute has been filed against you on Gigs4You. Our team will review within 72 hours.`,
      under_review: `Your dispute is now under review. Our team will contact you within 24 hours with an update.`,
      resolved:     `Your Gigs4You dispute has been resolved. Resolution: ${params.resolution?.replace(/_/g, ' ') ?? ''}. ${params.note ?? ''}`,
    };
    const subjects: Record<string, string> = {
      filed:        '⚠️ Dispute filed against you',
      under_review: '🔍 Dispute under review',
      resolved:     '✅ Dispute resolved',
    };
    const msg = messages[params.action] ?? '';
    if (params.phone) await this.enqueueSms(params.phone, msg);
    if (params.email) {
      await this.enqueueEmail({
        to: params.email,
        subject: subjects[params.action] ?? 'Dispute update',
        text: `Hi ${params.name},\n\n${msg}`,
        html: `<p>Hi <strong>${params.name}</strong>,</p><p>${msg}</p>`,
      });
    }
  }

  async notifyPaymentReceived(params: {
    phone?: string; email?: string; name: string;
    amount: number; description: string; lang?: 'en'|'sw';
  }) {
    const msg = `KES ${params.amount.toFixed(0)} has been credited to your Gigs4You wallet. ${params.description}`;
    if (params.phone) await this.enqueueSms(params.phone, msg);
    if (params.email) {
      await this.enqueueEmail({
        to: params.email,
        subject: `💰 KES ${params.amount.toFixed(0)} received`,
        text: `Hi ${params.name},\n\n${msg}`,
        html: `<p>Hi <strong>${params.name}</strong>,</p><p>${msg}</p>`,
      });
    }
  }

  async sendWelcomeEmail(params: { email: string; name: string; role: string; lang?: 'en'|'sw' }) {
    const { lang = 'en' } = params;
    await this.enqueueEmail({
      to: params.email,
      subject: lang === 'sw' ? 'Karibu Gigs4You!' : 'Welcome to Gigs4You!',
      text: t('auth.welcome', lang) + `\n\nHi ${params.name}, your ${params.role} account is ready.`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
          <div style="background:#1B6B3A;padding:24px;text-align:center;border-radius:8px 8px 0 0">
            <h1 style="color:white;margin:0;font-size:22px">Gigs4You</h1>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #E5E7EB;border-top:none">
            <p>Hi <strong>${params.name}</strong>,</p>
            <p>${t('auth.welcome', lang)}</p>
            <p>Your <strong>${params.role}</strong> account has been created. You can now log in and get started.</p>
          </div>
        </div>`,
    });
  }
}
