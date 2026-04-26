import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Optional, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispute, DisputeType, DisputeStatus, DisputeResolution } from './dispute.entity';
import { PushService } from '../push/push.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationService } from '../notifications-gateway/notification.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../users/user.entity';

export class CreateDisputeDto {
  type: DisputeType;
  description: string;
  againstUserId: string;
  referenceId?: string;
  referenceType?: string;
  amountKes?: number;
  evidenceUrls?: string[];
  organisationId?: string;
}

export class ResolveDisputeDto {
  resolution: DisputeResolution;
  resolutionNote: string;
  refundAmountKes?: number;
}

@Injectable()
export class DisputesService {
  private readonly log = new Logger(DisputesService.name);

  constructor(
    @InjectRepository(Dispute)
    private repo: Repository<Dispute>,
    @Optional() private pushService?: PushService,
    @Optional() private notificationsService?: NotificationsService,
    @Optional() private notificationService?: NotificationService,
    @Optional() private auditService?: AuditService,
  ) {}

  // ── File a dispute ────────────────────────────────────────────────────────

  async create(raisedById: string, dto: CreateDisputeDto): Promise<Dispute> {
    if (raisedById === dto.againstUserId) {
      throw new BadRequestException('You cannot file a dispute against yourself');
    }

    // 72-hour admin response SLA
    const responseDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000);

    const dispute = this.repo.create({
      raisedById,
      againstUserId: dto.againstUserId,
      organisationId: dto.organisationId,
      referenceId: dto.referenceId,
      referenceType: dto.referenceType,
      type: dto.type,
      description: dto.description,
      amountKes: dto.amountKes,
      evidenceUrls: dto.evidenceUrls ?? [],
      status: DisputeStatus.OPEN,
      responseDeadline,
    });

    const saved = await this.repo.save(dispute);

    // In-app bell for defendant
    this.notificationsService?.notifyDisputeFiled(dto.againstUserId, dto.type, saved.id);

    // FCM push to defendant
    this.pushService?.sendToUser(dto.againstUserId, {
      title: 'Dispute filed against you',
      body: `A ${dto.type} dispute has been raised. Gigs4You will review and contact you within 72 hours.`,
      data: { type: 'dispute', screen: '/disputes' },
    }).catch(e => this.log.error(`Push (dispute filed) failed for user ${dto.againstUserId}: ${(e as Error).message}`));

    // Log it
    this.auditService?.record({
      action: 'DISPUTE_FILED',
      userId: raisedById,
      entity: 'dispute',
      entityId: saved.id,
      details: { type: dto.type, againstUserId: dto.againstUserId, referenceId: dto.referenceId },
    }).catch(() => {});

    return saved;
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  async findForUser(userId: string, limit = 20): Promise<Dispute[]> {
    return this.repo
      .createQueryBuilder('d')
      .where('d."raisedById" = :userId OR d."againstUserId" = :userId', { userId })
      .orderBy('d."createdAt"', 'DESC')
      .take(limit)
      .getMany();
  }

  async findForOrg(orgId: string, limit = 50): Promise<Dispute[]> {
    return this.repo.find({
      where: { organisationId: orgId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findAll(filters: { status?: DisputeStatus; type?: DisputeType; limit?: number } = {}): Promise<Dispute[]> {
    const qb = this.repo.createQueryBuilder('d').orderBy('d."createdAt"', 'DESC');
    if (filters.status) qb.andWhere('d.status = :status', { status: filters.status });
    if (filters.type)   qb.andWhere('d.type = :type',     { type: filters.type });
    return qb.take(filters.limit ?? 50).getMany();
  }

  async findById(id: string): Promise<Dispute> {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException('Dispute not found');
    return d;
  }

  async getStats(): Promise<any> {
    const [open, underReview, resolved, closed] = await Promise.all([
      this.repo.count({ where: { status: DisputeStatus.OPEN } }),
      this.repo.count({ where: { status: DisputeStatus.UNDER_REVIEW } }),
      this.repo.count({ where: { status: DisputeStatus.RESOLVED } }),
      this.repo.count({ where: { status: DisputeStatus.CLOSED } }),
    ]);
    const escalated = await this.repo.count({ where: { isEscalated: true } });
    return { open, underReview, resolved, closed, escalated, total: open + underReview + resolved + closed };
  }

  // ── Admin actions ─────────────────────────────────────────────────────────

  async takeUnderReview(id: string, adminId: string): Promise<Dispute> {
    const d = await this.findById(id);
    if (d.status !== DisputeStatus.OPEN) {
      throw new BadRequestException('Only open disputes can be taken under review');
    }
    d.status = DisputeStatus.UNDER_REVIEW;
    const saved = await this.repo.save(d);

    // Notify both parties — in-app bell + FCM push (previously missing)
    this.notificationsService?.notifyDisputeUnderReview(d.raisedById, d.id);
    this.notificationsService?.notifyDisputeUnderReview(d.againstUserId, d.id);
    const underReviewMsg = 'Your dispute is now under review. Our team will contact you within 24 hours.';
    this.pushService?.sendToUser(d.raisedById, {
      title: '🔍 Dispute under review', body: underReviewMsg, data: { type: 'dispute', screen: '/disputes' },
    }).catch(e => this.log.error(`Push (dispute review) failed for ${d.raisedById}: ${(e as Error).message}`));
    this.pushService?.sendToUser(d.againstUserId, {
      title: '🔍 Dispute under review', body: underReviewMsg, data: { type: 'dispute', screen: '/disputes' },
    }).catch(e => this.log.error(`Push (dispute review) failed for ${d.againstUserId}: ${(e as Error).message}`));

    this.auditService?.record({ action: 'DISPUTE_UNDER_REVIEW', userId: adminId, entity: 'dispute', entityId: id }).catch(() => {});
    return saved;
  }

  async resolve(id: string, adminId: string, dto: ResolveDisputeDto): Promise<Dispute> {
    const d = await this.findById(id);
    if (d.status === DisputeStatus.RESOLVED || d.status === DisputeStatus.CLOSED) {
      throw new BadRequestException('Dispute is already resolved or closed');
    }

    d.status        = DisputeStatus.RESOLVED;
    d.resolution    = dto.resolution;
    d.resolutionNote = dto.resolutionNote;
    d.resolvedBy    = adminId;
    d.resolvedAt    = new Date();
    if (dto.refundAmountKes) d.refundAmountKes = dto.refundAmountKes;

    const saved = await this.repo.save(d);

    // Notify both parties — in-app bell + FCM push + SMS/email
    const summary = `Resolution: ${dto.resolution.replace(/_/g, ' ')}. ${dto.resolutionNote}`;
    this.notificationsService?.notifyDisputeResolved(d.raisedById,    dto.resolution, dto.resolutionNote, d.id);
    this.notificationsService?.notifyDisputeResolved(d.againstUserId, dto.resolution, dto.resolutionNote, d.id);
    this.pushService?.sendToUser(d.raisedById,    { title: '✅ Dispute resolved', body: summary, data: { type: 'dispute', screen: '/disputes' } })
      .catch(e => this.log.error(`Push (dispute resolved) failed for ${d.raisedById}: ${(e as Error).message}`));
    this.pushService?.sendToUser(d.againstUserId, { title: '✅ Dispute resolved', body: summary, data: { type: 'dispute', screen: '/disputes' } })
      .catch(e => this.log.error(`Push (dispute resolved) failed for ${d.againstUserId}: ${(e as Error).message}`));

    this.auditService?.record({
      action: 'DISPUTE_RESOLVED',
      userId: adminId,
      entity: 'dispute',
      entityId: id,
      details: { resolution: dto.resolution, refundAmountKes: dto.refundAmountKes },
    }).catch(() => {});

    return saved;
  }

  async close(id: string, adminId: string, reason: string): Promise<Dispute> {
    const d = await this.findById(id);
    d.status         = DisputeStatus.CLOSED;
    d.resolutionNote = reason;
    d.resolvedBy     = adminId;
    d.resolvedAt     = new Date();
    const saved = await this.repo.save(d);

    this.auditService?.record({ action: 'DISPUTE_CLOSED', userId: adminId, entity: 'dispute', entityId: id, details: { reason } }).catch(() => {});
    return saved;
  }

  /** Called by a scheduler — mark disputes past 72-hour SLA as escalated */
  async escalateOverdue(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update(Dispute)
      .set({ isEscalated: true })
      .where('"responseDeadline" < :now', { now: new Date() })
      .andWhere('status IN (:...openStatuses)', { openStatuses: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] })
      .andWhere('isEscalated = false')
      .execute();
    return result.affected ?? 0;
  }
}
