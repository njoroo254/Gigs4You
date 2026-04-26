import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

export interface AuditParams {
  userId?:   string;
  userRole?: string;
  orgId?:    string;
  action:    string;
  entity:    string;
  entityId?: string;
  details?:  Record<string, any>;
  ip?:       string;
}

export interface AuditQuery {
  orgId?:    string;   // undefined = all orgs (super_admin only)
  userId?:   string;
  action?:   string;
  entity?:   string;
  from?:     string;
  to?:       string;
  page?:     number;
  limit?:    number;
}

@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async record(params: AuditParams): Promise<void> {
    try {
      await this.repo.save(this.repo.create(params));
    } catch (e) {
      // Never let audit errors break the main flow
      this.log.error('Failed to write audit log', (e as Error).message);
    }
  }

  async findAll(query: AuditQuery) {
    const { orgId, userId, action, entity, from, to, page = 1, limit = 50 } = query;

    const qb = this.repo
      .createQueryBuilder('al')
      .orderBy('al.createdAt', 'DESC')
      .take(Math.min(limit, 200))
      .skip((page - 1) * Math.min(limit, 200));

    if (orgId)   qb.andWhere('al.orgId   = :orgId',   { orgId });
    if (userId)  qb.andWhere('al.userId  = :userId',  { userId });
    if (action)  qb.andWhere('al.action  = :action',  { action });
    if (entity)  qb.andWhere('al.entity  = :entity',  { entity });
    if (from)    qb.andWhere('al.createdAt >= :from',  { from: new Date(from) });
    if (to)      qb.andWhere('al.createdAt <= :to',    { to: new Date(to) });

    const [logs, total] = await qb.getManyAndCount();
    return { logs, total, page, limit };
  }

  async getStats(orgId?: string) {
    const qb = this.repo
      .createQueryBuilder('al')
      .select('al.action', 'action')
      .addSelect('al.entity', 'entity')
      .addSelect('COUNT(*)', 'count')
      .where("al.createdAt >= NOW() - INTERVAL '30 days'")
      .groupBy('al.action')
      .addGroupBy('al.entity')
      .orderBy('count', 'DESC');

    if (orgId) qb.andWhere('al.orgId = :orgId', { orgId });

    return qb.getRawMany();
  }
}
