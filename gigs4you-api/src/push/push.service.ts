import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from '../users/user.entity';
import { Agent } from '../agents/agent.entity';
import { t } from '../common/i18n';

export interface PushPayload {
  title: string;
  body:  string;
  data?: Record<string, string>;   // deep-link data
  imageUrl?: string;
}

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  private app: any = null;   // firebase-admin app

  constructor(
    private config: ConfigService,
    @InjectRepository(User)  private userRepo:  Repository<User>,
    @InjectRepository(Agent) private agentRepo: Repository<Agent>,
  ) {
    this.initFirebase();
  }

  private initFirebase() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const admin = require('firebase-admin');
      const raw = this.config.get('FCM_SERVICE_ACCOUNT_JSON');
      if (!raw) {
        this.log.warn('FCM_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
        return;
      }
      const sa = JSON.parse(raw) as Record<string, string>;
      if (!sa.private_key || !sa.client_email || sa.project_id?.includes('dummy')) {
        this.log.warn(
          'FCM_SERVICE_ACCOUNT_JSON contains placeholder values. ' +
          'Download a real service account from Firebase Console → Project Settings → Service Accounts. ' +
          'Push notifications are DISABLED until this is fixed.'
        );
        return;
      }
      if (!admin.apps.length) {
        this.app = admin.initializeApp({ credential: admin.credential.cert(sa) });
      } else {
        this.app = admin.apps[0];
      }
      this.log.log('Firebase Admin initialised — push notifications enabled');
    } catch (e) {
      this.log.error('Firebase Admin init failed — check FCM_SERVICE_ACCOUNT_JSON format', (e as Error).message);
    }
  }

  // ── Register/update device token ─────────────────────────────────
  async registerToken(userId: string, token: string, deviceId?: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;

    // fcmTokens stored as JSON array on user
    let tokens: string[] = [];
    try { tokens = JSON.parse((user as any).fcmTokens || '[]'); } catch {}
    if (!tokens.includes(token)) {
      tokens.push(token);
      // Keep max 5 tokens per user (multiple devices)
      if (tokens.length > 5) tokens = tokens.slice(-5);
      await this.userRepo.update(userId, { fcmTokens: JSON.stringify(tokens) } as any);
    }
  }

  async removeToken(userId: string, token: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;
    let tokens: string[] = [];
    try { tokens = JSON.parse((user as any).fcmTokens || '[]'); } catch {}
    tokens = tokens.filter(t => t !== token);
    await this.userRepo.update(userId, { fcmTokens: JSON.stringify(tokens) } as any);
  }

  // ── Send to one user (all their devices) ─────────────────────────
  async sendToUser(userId: string, payload: PushPayload, lang: 'en'|'sw' = 'en'): Promise<void> {
    if (!this.app) return;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;

    let tokens: string[] = [];
    try { tokens = JSON.parse((user as any).fcmTokens || '[]'); } catch {}
    if (!tokens.length) return;

    await this.sendToTokens(tokens, payload, userId);
  }

  // ── Send to multiple users ────────────────────────────────────────
  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!this.app || !userIds.length) return;
    const users = await this.userRepo.findBy({ id: In(userIds) });

    const allTokens = users.flatMap(u => {
      try { return JSON.parse((u as any).fcmTokens || '[]') as string[]; } catch { return []; }
    });
    if (allTokens.length) await this.sendToTokens(allTokens, payload);
  }

  // ── Core send ─────────────────────────────────────────────────────
  private async sendToTokens(tokens: string[], payload: PushPayload, userId?: string): Promise<void> {
    if (!this.app || !tokens.length) return;
    try {
      const admin = require('firebase-admin');
      const messaging = admin.messaging(this.app);

      // Build data map — Flutter background handler reads these fields.
      // We send BOTH notification (for OS tray when app is killed) and data
      // (so Flutter can handle foreground display and deep-link routing).
      const dataMap: Record<string, string> = {
        title:  payload.title,
        body:   payload.body,
        ...(Object.fromEntries(
          Object.entries(payload.data || {}).map(([k, v]) => [k, String(v)])
        )),
      };

      // Send in batches of 500 (FCM limit)
      for (let i = 0; i < tokens.length; i += 500) {
        const batch = tokens.slice(i, i + 500);
        const resp = await messaging.sendEachForMulticast({
          tokens: batch,
          // notification field: OS shows this automatically when app is terminated/offline
          notification: { title: payload.title, body: payload.body },
          // data field: Flutter reads this for in-app routing and foreground popups
          data: dataMap,
          android: {
            priority: 'high',
            notification: { sound: 'default', channelId: 'gigs4you_main', clickAction: 'FLUTTER_NOTIFICATION_CLICK' },
          },
          apns: { payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } } },
        });

        // Clean up invalid tokens
        const invalidTokens: string[] = [];
        resp.responses.forEach((r: any, idx: number) => {
          if (!r.success && (
            r.error?.code === 'messaging/invalid-registration-token' ||
            r.error?.code === 'messaging/registration-token-not-registered'
          )) {
            invalidTokens.push(batch[idx]);
          }
        });
        if (invalidTokens.length && userId) {
          for (const t of invalidTokens) await this.removeToken(userId, t);
        }
        this.log.log(`Push sent: ${resp.successCount}/${batch.length} delivered`);
      }
    } catch (e) {
      this.log.error('Push send failed', (e as Error).message);
    }
  }

  // ── Typed notification helpers ─────────────────────────────────────
  async notifyTaskAssigned(userId: string, taskTitle: string, taskId: string, lang: 'en'|'sw' = 'en') {
    await this.sendToUser(userId, {
      title: '📋 New Task Assigned',
      body:  t('task.assigned', lang, { title: taskTitle }),
      data:  { type: 'task', taskId, screen: '/tasks' },
    });
  }

  async notifyJobApplication(userId: string, jobTitle: string, jobId: string, lang: 'en'|'sw' = 'en') {
    await this.sendToUser(userId, {
      title: '📬 New Job Application',
      body:  `Someone applied for your job: ${jobTitle}`,
      data:  { type: 'job', jobId, screen: '/jobs' },
    });
  }

  async notifyChatMessage(userId: string, senderName: string, preview: string, convId: string) {
    await this.sendToUser(userId, {
      title: `💬 ${senderName}`,
      body:  preview.length > 100 ? preview.slice(0, 97) + '…' : preview,
      data:  { type: 'chat', conversationId: convId, screen: '/chat' },
    });
  }

  async notifyPaymentReceived(userId: string, amount: number, lang: 'en'|'sw' = 'en') {
    await this.sendToUser(userId, {
      title: '💰 Payment Received',
      body:  t('payment.received', lang, { amount: amount.toFixed(0) }),
      data:  { type: 'payment', screen: '/wallet' },
    });
  }

  // ── Resolve agentId → userId then notify ─────────────────────────
  // Wallet service tracks records by agentId; FCM needs the user's userId.
  async notifyPaymentReceivedByAgentId(agentId: string, amount: number, lang: 'en'|'sw' = 'en') {
    const agent = await this.agentRepo.findOne({ where: { id: agentId }, relations: ['user'] });
    const userId = agent?.user?.id;
    if (!userId) {
      this.log.warn(`notifyPaymentReceivedByAgentId: no user for agentId ${agentId}`);
      return;
    }
    await this.notifyPaymentReceived(userId, amount, lang);
  }

  async notifySubscriptionExpiring(userId: string, days: number, lang: 'en'|'sw' = 'en') {
    await this.sendToUser(userId, {
      title: '⚠️ Subscription Expiring Soon',
      body:  t('sub.trial_ending', lang, { days }),
      data:  { type: 'billing', screen: '/billing' },
    });
  }

  async notifyJobStatusChange(userId: string, jobTitle: string, status: string, jobId: string) {
    await this.sendToUser(userId, {
      title: `🔔 Job Update`,
      body:  `${jobTitle} is now ${status.replace('_', ' ')}`,
      data:  { type: 'job', jobId, status, screen: '/jobs' },
    });
  }

  async notifyChurnRisk(userId: string, score: number) {
    const msg = score >= 0.85
      ? "Your streak is at risk! Log in and pick up a task to keep your momentum."
      : "It's been a while — tasks are waiting for you on Gigs4You.";
    await this.sendToUser(userId, {
      title: 'We miss you!',
      body:  msg,
      data:  { type: 'churn_risk', screen: '/tasks' },
    });
  }

  async notifyAgentChurnRisk(managerId: string, agentName: string, score: number) {
    await this.sendToUser(managerId, {
      title: 'Agent engagement alert',
      body:  `${agentName} has been inactive and may need follow-up (risk score: ${Math.round(score * 100)}%).`,
      data:  { type: 'agent_churn', screen: '/agents' },
    });
  }
}
