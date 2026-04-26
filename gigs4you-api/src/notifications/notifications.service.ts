import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private notifRepo: Repository<Notification>,
  ) {}

  async create(
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    actionId?: string,
    actionType?: string,
    isImportant = false,
  ): Promise<Notification> {
    try {
      const remindAt = isImportant
        ? new Date(Date.now() + 15 * 60 * 1000)
        : null;
      const notif = this.notifRepo.create({
        userId, title, body, type, actionId, actionType, isImportant, remindAt,
      });
      return await this.notifRepo.save(notif);
    } catch (e) {
      this.log.error(`Failed to create notification for user ${userId}: ${(e as Error).message}`);
      throw e;
    }
  }

  /** Fire-and-forget wrapper — never throws, logs errors */
  notify(
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    actionId?: string,
    actionType?: string,
    isImportant = false,
  ): void {
    this.create(userId, title, body, type, actionId, actionType, isImportant)
      .catch(e => this.log.error(`notify failed for ${userId}: ${(e as Error).message}`));
  }

  /** Find all important unread notifications whose remindAt has passed — for the scheduler */
  async findDueReminders(): Promise<Notification[]> {
    return this.notifRepo
      .createQueryBuilder('n')
      .where('n.isImportant = true')
      .andWhere('n.isRead = false')
      .andWhere('n.remindAt <= :now', { now: new Date() })
      .getMany();
  }

  /** Bump remindAt by another 15 min after re-sending */
  async snoozeReminder(id: string): Promise<void> {
    await this.notifRepo.update(id, {
      remindAt: new Date(Date.now() + 15 * 60 * 1000),
    });
  }

  async findForUser(userId: string, limit = 30): Promise<Notification[]> {
    return this.notifRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.notifRepo.update({ id, userId }, { isRead: true, remindAt: null });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifRepo.update({ userId, isRead: false }, { isRead: true, remindAt: null });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepo.count({ where: { userId, isRead: false } });
  }

  // ── Domain notification helpers ───────────────────────────────────────────
  // Each method uses notify() so callers never need .catch() boilerplate.

  notifyJobApplication(managerId: string, applicantName: string, jobTitle: string, jobId: string) {
    this.notify(
      managerId,
      'New application received',
      `${applicantName} applied for "${jobTitle}"`,
      NotificationType.APPLICATION,
      jobId, 'job',
    );
  }

  notifyJobAssigned(agentUserId: string, jobTitle: string, jobId: string) {
    this.notify(
      agentUserId,
      'You got the job! 🎉',
      `You have been selected for "${jobTitle}". Check the app to view details.`,
      NotificationType.JOB,
      jobId, 'job',
      true, // isImportant — re-fires every 15 min until read
    );
  }

  notifyJobCompleted(agentUserId: string, jobTitle: string, jobId: string) {
    this.notify(
      agentUserId,
      'Job marked complete',
      `"${jobTitle}" has been marked as complete. Payment will be credited to your wallet.`,
      NotificationType.JOB,
      jobId, 'job',
    );
  }

  notifyJobStatusChange(userId: string, jobTitle: string, status: string, jobId: string) {
    const friendly = status.replace(/_/g, ' ');
    this.notify(
      userId,
      `Job ${friendly}`,
      `"${jobTitle}" is now ${friendly}.`,
      NotificationType.JOB,
      jobId, 'job',
    );
  }

  notifyPayment(agentUserId: string, amount: number, description: string) {
    this.notify(
      agentUserId,
      `KES ${amount.toFixed(0)} credited to your wallet`,
      description,
      NotificationType.PAYMENT,
    );
  }

  notifyRefund(agentUserId: string, amount: number, reason: string) {
    this.notify(
      agentUserId,
      `KES ${amount.toFixed(0)} refunded to your wallet`,
      reason,
      NotificationType.PAYMENT,
    );
  }

  notifyTaskAssigned(agentUserId: string, taskTitle: string, taskId: string) {
    this.notify(
      agentUserId,
      'New task assigned',
      `You have a new task: "${taskTitle}"`,
      NotificationType.TASK,
      taskId, 'task',
      true, // isImportant — re-fires every 15 min until read
    );
  }

  notifyDisputeFiled(userId: string, disputeType: string, disputeId: string) {
    this.notify(
      userId,
      'Dispute filed against you',
      `A ${disputeType} dispute has been raised. Our team will review within 72 hours.`,
      NotificationType.SYSTEM,
      disputeId, 'dispute',
      true, // isImportant
    );
  }

  notifyDisputeUnderReview(userId: string, disputeId: string) {
    this.notify(
      userId,
      'Dispute under review',
      'Your dispute is now under review. Our team will contact you within 24 hours.',
      NotificationType.SYSTEM,
      disputeId, 'dispute',
    );
  }

  notifyDisputeResolved(userId: string, resolution: string, note: string, disputeId: string) {
    const friendly = resolution.replace(/_/g, ' ');
    this.notify(
      userId,
      'Dispute resolved',
      `Resolution: ${friendly}. ${note}`,
      NotificationType.SYSTEM,
      disputeId, 'dispute',
      true, // isImportant
    );
  }

  notifyVerificationSubmitted(userId: string) {
    this.notify(
      userId,
      'Verification submitted',
      'Your identity documents have been received. We will review and notify you within 24 hours.',
      NotificationType.SYSTEM,
    );
  }

  notifyVerificationResult(userId: string, approved: boolean, note?: string | null) {
    this.notify(
      userId,
      approved ? '✅ Identity verified' : '❌ Verification rejected',
      approved
        ? 'Your identity has been verified. You now have full platform access.'
        : `Verification rejected${note ? ': ' + note : ''}. Please resubmit with clearer documents.`,
      NotificationType.SYSTEM,
      undefined, undefined,
      !approved, // rejected is important so agent re-reads it
    );
  }

  notifySubscriptionExpiring(userId: string, days: number) {
    this.notify(
      userId,
      `Subscription expiring in ${days} day${days !== 1 ? 's' : ''}`,
      `Your Gigs4You subscription expires in ${days} day${days !== 1 ? 's' : ''}. Renew now to avoid interruption.`,
      NotificationType.SYSTEM,
      undefined, undefined,
      days <= 3, // isImportant for last 3 days
    );
  }

  notifyTrialExpired(userId: string) {
    this.notify(
      userId,
      'Trial ended',
      'Your free trial has ended. Subscribe to a plan to continue using Gigs4You.',
      NotificationType.SYSTEM,
      undefined, undefined,
      true, // isImportant
    );
  }

  notifyChurnRisk(userId: string) {
    this.notify(
      userId,
      'Stay active — tasks are waiting!',
      'You have been inactive recently. Log in and pick up a task to keep your streak going.',
      NotificationType.SYSTEM,
    );
  }

  notifyAgentChurnRisk(managerId: string, agentName: string) {
    this.notify(
      managerId,
      'Agent engagement alert',
      `${agentName} has been inactive and may need a follow-up or task assignment.`,
      NotificationType.SYSTEM,
    );
  }

  /** AI-generated insight — used for billing recommendations, match alerts, etc. */
  notifyAiInsight(userId: string, title: string, body: string, actionId?: string, actionType?: string) {
    this.notify(
      userId,
      title,
      body,
      NotificationType.SYSTEM,
      actionId, actionType,
    );
  }
}
