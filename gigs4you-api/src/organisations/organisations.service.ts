import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Organisation } from './organisation.entity';
import { AgentsService } from '../agents/agents.service';
import { BillingService } from '../billing/billing.service';
import { UsersService } from '../users/users.service';
import { Task, TaskStatus } from '../tasks/task.entity';
import { Job, JobStatus } from '../jobs/job.entity';
import { JobApplication, ApplicationStatus } from '../applications/job-application.entity';
import {
  Invoice,
  InvoiceStatus,
  PLAN_LIMITS,
  Subscription,
  SubStatus,
} from '../billing/billing.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { WalletTransaction, TransactionType } from '../wallet/wallet.entity';
import { User } from '../users/user.entity';
import { Verification, VerificationStatus } from '../verification/verification.entity';

type HealthFlag = {
  level: 'critical' | 'warning' | 'info';
  code: string;
  title: string;
  description: string;
};

@Injectable()
export class OrganisationsService {
  private readonly logger = new Logger(OrganisationsService.name);

  constructor(
    @InjectRepository(Organisation)
    private orgRepo: Repository<Organisation>,
    @InjectRepository(Task)
    private taskRepo: Repository<Task>,
    @InjectRepository(Job)
    private jobRepo: Repository<Job>,
    @InjectRepository(JobApplication)
    private appRepo: Repository<JobApplication>,
    @InjectRepository(Subscription)
    private subRepo: Repository<Subscription>,
    @InjectRepository(Invoice)
    private invRepo: Repository<Invoice>,
    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>,
    @InjectRepository(WalletTransaction)
    private txRepo: Repository<WalletTransaction>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Verification)
    private verRepo: Repository<Verification>,
    private agentsService: AgentsService,
    private usersService: UsersService,
    @Inject(forwardRef(() => BillingService)) private billingService: BillingService,
  ) {}

  /** Produce a canonical name for deduplication: lowercase, trimmed, single-spaced. */
  private normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  async create(
    data: Partial<Organisation>,
    ownerId: string,
    linkOwner = true,
  ): Promise<Organisation> {
    if (!data.name?.trim()) {
      throw new ConflictException('Organisation name is required.');
    }

    const nameNormalized = this.normalizeName(data.name);

    const existing = await this.orgRepo.findOne({ where: { nameNormalized } });
    if (existing) {
      throw new ConflictException(
        `An organisation named "${existing.name}" already exists. ` +
        'If this is your organisation, ask the admin to add you as a member.',
      );
    }

    const org = this.orgRepo.create({ ...data, ownerId, nameNormalized });
    const saved = await this.orgRepo.save(org);
    if (linkOwner && ownerId) {
      try {
        const owner = await this.usersService.findById(ownerId);
        await this.usersService.update(ownerId, {
          organisationId: saved.id,
          isActive: true,
          ...(owner.role === 'super_admin' ? {} : { role: 'admin' as any }),
        });
        const agent = await this.agentsService.findByUserId(ownerId).catch(() => null);
        if (agent) {
          await this.agentsService.update(agent.id, {
            organisationId: saved.id,
            isConfirmed: true,
          });
        }
      } catch (_) {
        // Owner linkage should not block org creation.
      }
    }
    try {
      await this.billingService.createTrialSubscription(saved.id);
    } catch (_) {
      // Trial bootstrap should not block org creation.
    }
    return saved;
  }

  async findById(id: string): Promise<Organisation> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException(`Organisation ${id} not found`);
    return org;
  }

  async findByOwner(ownerId: string): Promise<Organisation[]> {
    return this.orgRepo.find({ where: { ownerId }, order: { createdAt: 'DESC' } });
  }

  // Return organisations accessible to the current user (owner or their own org)
  async findAccessibleForUser(user: any): Promise<Organisation[]> {
    // If the user belongs to an organisation, return that org only
    const userOrgId = user?.organisationId ?? user?.organisation?.id ?? user?.orgId;
    if (userOrgId) {
      const org = await this.findById(userOrgId).catch(() => null);
      return org ? [org] : [];
    }
    // Fallback to owner-based listing
    return this.findByOwner(user?.userId);
  }

  async findAll(): Promise<Organisation[]> {
    return this.orgRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findAllDetailed(): Promise<any[]> {
    const orgs = await this.findAll();
    return Promise.all(orgs.map(async (org) => {
      try {
        return await this.buildDirectoryItem(org);
      } catch (error: any) {
        this.logger.error(
          `Failed to build detailed organisation directory item for ${org.id}: ${error?.message || 'unknown error'}`,
        );

        const compliance = this.getComplianceSummary(org);
        const primaryAdmin = await this.getPrimaryAdmin(org).catch(() => null);

        return {
          ...org,
          primaryAdmin,
          stats: {
            totalMembers: 0,
            activeMembers: 0,
            totalAgents: 0,
            confirmedAgents: 0,
            pendingInvites: 0,
            agentsInField: 0,
            byRole: {},
          },
          subscription: null,
          billing: {
            paidKes: 0,
            outstandingKes: 0,
            agentCreditsKes: 0,
            agentWithdrawalsKes: 0,
            lastPaymentAt: null,
            recentInvoices: [],
          },
          compliance,
          health: {
            items: [
              {
                level: 'warning',
                code: 'org_directory_partial',
                title: 'Organisation analytics unavailable',
                description: 'Some deep analytics failed to load, but the organisation remains visible for super-admin operations.',
              },
            ],
            summary: {
              critical: 0,
              warning: 1,
              info: 0,
              total: 1,
            },
          },
        };
      }
    }));
  }

  async getSuperAdminOverview(): Promise<any> {
    const directory = await this.findAllDetailed();

    const summary = directory.reduce((acc, org) => {
      acc.totalOrgs += 1;
      acc.activeOrgs += org.isActive !== false ? 1 : 0;
      acc.inactiveOrgs += org.isActive === false ? 1 : 0;
      acc.totalMembers += org.stats.totalMembers || 0;
      acc.activeMembers += org.stats.activeMembers || 0;
      acc.checkedInAgents += org.stats.agentsInField || 0;
      acc.pendingInvites += org.stats.pendingInvites || 0;
      acc.pastDueOrgs += org.subscription?.status === SubStatus.PAST_DUE ? 1 : 0;
      acc.trialOrgs += org.subscription?.status === SubStatus.TRIAL ? 1 : 0;
      acc.payingOrgs += org.subscription && org.subscription.plan !== 'free' ? 1 : 0;
      acc.outstandingKes += Number(org.billing.outstandingKes || 0);
      acc.paidKes += Number(org.billing.paidKes || 0);
      acc.healthAlerts += org.health.summary.total || 0;
      return acc;
    }, {
      totalOrgs: 0,
      activeOrgs: 0,
      inactiveOrgs: 0,
      totalMembers: 0,
      activeMembers: 0,
      checkedInAgents: 0,
      pendingInvites: 0,
      pastDueOrgs: 0,
      trialOrgs: 0,
      payingOrgs: 0,
      outstandingKes: 0,
      paidKes: 0,
      healthAlerts: 0,
    });

    const byIndustry = Object.entries(
      directory.reduce((acc: Record<string, number>, org) => {
        const key = org.industry || 'Unspecified';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    )
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 6)
      .map(([label, count]) => ({ label, count }));

    const byCounty = Object.entries(
      directory.reduce((acc: Record<string, number>, org) => {
        const key = org.county || 'Unspecified';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    )
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 6)
      .map(([label, count]) => ({ label, count }));

    return {
      summary: {
        ...summary,
        outstandingKes: Number(summary.outstandingKes.toFixed(2)),
        paidKes: Number(summary.paidKes.toFixed(2)),
      },
      byIndustry,
      byCounty,
      topRiskOrgs: directory
        .filter((org) => org.health.summary.critical > 0 || org.health.summary.warning > 0)
        .sort((a, b) => b.health.summary.total - a.health.summary.total)
        .slice(0, 5)
        .map((org) => ({
          id: org.id,
          name: org.name,
          issues: org.health.summary.total,
          plan: org.subscription?.plan || 'free',
        })),
    };
  }

  async update(
    id: string,
    callerId: string,
    data: Partial<Organisation>,
    isSuperAdmin = false,
  ): Promise<Organisation> {
    const org = await this.findById(id);
    if (!isSuperAdmin && org.ownerId !== callerId) {
      throw new ForbiddenException('Not your organisation');
    }
    Object.assign(org, data);
    return this.orgRepo.save(org);
  }

  async deactivate(id: string): Promise<Organisation> {
    const org = await this.findById(id);
    org.isActive = false;
    return this.orgRepo.save(org);
  }

  async activate(id: string): Promise<Organisation> {
    const org = await this.findById(id);
    org.isActive = true;
    return this.orgRepo.save(org);
  }

  // ── Branch support ─────────────────────────────────────────────────────

  async createBranch(
    parentId: string,
    data: { branchName: string; county?: string; address?: string; description?: string },
    creatorUserId: string,
  ): Promise<Organisation> {
    const parent   = await this.findById(parentId);
    const fullName = `${parent.name} — ${data.branchName}`;
    const branch   = this.orgRepo.create({
      name:           fullName,
      nameNormalized: this.normalizeName(fullName),
      branchName:     data.branchName,
      parentId,
      industry:    parent.industry,
      county:      data.county  || parent.county,
      address:     data.address || '',
      description: data.description || '',
      ownerId:     parent.ownerId,
      isActive:    true,
    });
    const saved = await this.orgRepo.save(branch);
    // Create a trial subscription for the branch
    try { await this.billingService.createTrialSubscription(saved.id); } catch (_) {}
    return saved;
  }

  async getBranches(parentId: string): Promise<Organisation[]> {
    return this.orgRepo.find({
      where: { parentId },
      order: { createdAt: 'ASC' },
    });
  }

  async getBranchesWithStats(parentId: string): Promise<any[]> {
    const branches = await this.getBranches(parentId);
    return Promise.all(branches.map(async (b) => {
      const stats = await this.getStats(b.id).catch(() => ({ totalMembers: 0 }));
      return { ...b, stats };
    }));
  }

  async getStats(orgId: string): Promise<any> {
    const users = await this.usersService.findAll(orgId);
    const orgAgents = await this.agentsService.findAll(orgId);
    const agentsInField = orgAgents.filter((agent) => agent.status === 'checked_in').length;
    const activeMembers = users.filter((user) => user.isActive !== false).length;
    const pendingInvites = orgAgents.filter((agent) => !agent.isConfirmed).length;
    const confirmedAgents = orgAgents.filter((agent) => agent.isConfirmed).length;

    return {
      totalMembers: users.length,
      activeMembers,
      totalAgents: orgAgents.length,
      confirmedAgents,
      pendingInvites,
      agentsInField,
      byRole: users.reduce((acc: Record<string, number>, user: any) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  async getMembers(orgId: string) {
    const orgUsers = await this.usersService.findAll(orgId);
    const orgAgents = await this.agentsService.findAll(orgId);
    const agentMap = new Map(orgAgents.map((agent) => [agent.user?.id, agent]));

    const members = orgUsers.map((user: any) => {
      const agentRecord = agentMap.get(user.id);
      return {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        organisationId: user.organisationId,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        agentId: agentRecord?.id || null,
        status: agentRecord?.status || 'offline',
        isConfirmed: agentRecord?.isConfirmed ?? false,
        totalXp: agentRecord?.totalXp || 0,
        level: agentRecord?.level || 1,
        lastSeenAt: agentRecord?.lastSeenAt || null,
      };
    });

    const byRole = members.reduce((acc: Record<string, number>, member: any) => {
      acc[member.role] = (acc[member.role] || 0) + 1;
      return acc;
    }, {});

    return {
      members,
      agents: orgAgents,
      users: orgUsers,
      totalMembers: members.length,
      byRole,
    };
  }

  async searchUsers(query: string, excludeOrgId?: string): Promise<any[]> {
    const trimmed = (query || '').trim();
    if (trimmed.length < 2) return [];

    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.agent', 'agent')
      .select([
        'user.id',
        'user.name',
        'user.phone',
        'user.email',
        'user.username',
        'user.role',
        'user.isActive',
        'user.organisationId',
        'user.lastLoginAt',
        'agent.id',
        'agent.status',
        'agent.isConfirmed',
        'agent.level',
        'agent.totalXp',
      ])
      .where(
        'LOWER(user.name) LIKE :query OR LOWER(COALESCE(user.email, \'\')) LIKE :query OR LOWER(COALESCE(user.username, \'\')) LIKE :query OR user.phone LIKE :phone',
        {
          query: `%${trimmed.toLowerCase()}%`,
          phone: `%${trimmed.replace(/\s/g, '')}%`,
        },
      )
      .orderBy('user.createdAt', 'DESC')
      .take(20);

    if (excludeOrgId) {
      qb.andWhere('(user.organisationId IS NULL OR user.organisationId != :excludeOrgId)', {
        excludeOrgId,
      });
    }

    const users = await qb.getMany();
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      organisationId: user.organisationId,
      lastLoginAt: user.lastLoginAt,
      agent: user.agent ? {
        id: user.agent.id,
        status: user.agent.status,
        isConfirmed: user.agent.isConfirmed,
        level: user.agent.level,
        totalXp: user.agent.totalXp,
      } : null,
    }));
  }

  async getDashboard(orgId: string): Promise<any> {
    const org = await this.findById(orgId);
    const [stats, members, taskSummary, primaryAdmin, subscription, billing, recentActivity] = await Promise.all([
      this.getStats(orgId),
      this.getMembers(orgId),
      this.getTaskSummary(orgId),
      this.getPrimaryAdmin(org),
      this.subRepo.findOne({ where: { organisationId: orgId } }),
      this.getBillingSummary(orgId),
      this.auditRepo.find({
        where: { orgId },
        order: { createdAt: 'DESC' },
        take: 12,
      }),
    ]);

    const jobSummary = await this.getJobSummary(members.members.map((member: any) => member.id));
    const agentKyc = await this.getMemberKycStats(orgId);
    const compliance = this.getComplianceSummary(org, agentKyc);
    const health = this.buildHealthFlags(org, stats, subscription, billing, taskSummary, primaryAdmin, compliance);

    return {
      org,
      primaryAdmin,
      stats,
      people: {
        members: members.members,
        byRole: members.byRole,
        activeMembers: stats.activeMembers,
        pendingInvites: stats.pendingInvites,
      },
      work: {
        tasks: taskSummary,
        jobs: jobSummary,
      },
      billing: {
        ...billing,
        subscription: subscription ? {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          trialEndsAt: subscription.trialEndsAt,
          autoRenew: subscription.autoRenew,
          daysRemaining: subscription.daysRemaining,
          isActive: subscription.isActive,
          mpesaAccountRef: subscription.mpesaAccountRef,
          planLimit: PLAN_LIMITS[subscription.plan],
        } : null,
      },
      compliance,
      health,
      recentActivity: recentActivity.map((entry) => ({
        id: entry.id,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        userId: entry.userId,
        userRole: entry.userRole,
        details: entry.details,
        createdAt: entry.createdAt,
      })),
    };
  }

  async addUserToOrg(orgId: string, userId: string, role?: string): Promise<any> {
    const user = await this.usersService.findById(userId);
    await this.usersService.update(userId, {
      organisationId: orgId,
      ...(role ? { role: role as any } : {}),
    });
    const agent = await this.agentsService.findByUserId(userId).catch(() => null);
    if (agent) {
      await this.agentsService.update(agent.id, {
        organisationId: orgId,
        isConfirmed: true,
      });
    }
    return { message: `${user.name} added to organisation`, userId, orgId };
  }

  async assignPrimaryAdmin(orgId: string, userId: string): Promise<any> {
    const org = await this.findById(orgId);
    const user = await this.usersService.findById(userId);

    await this.usersService.update(userId, {
      organisationId: orgId,
      role: 'admin' as any,
      isActive: true,
    });

    const agent = await this.agentsService.findByUserId(userId).catch(() => null);
    if (agent) {
      await this.agentsService.update(agent.id, {
        organisationId: orgId,
        isConfirmed: true,
      });
    }

    org.ownerId = user.id;
    await this.orgRepo.save(org);

    return {
      message: `${user.name} is now the primary admin for ${org.name}`,
      orgId,
      userId,
    };
  }

  async addMember(orgId: string, agentId: string): Promise<void> {
    await this.agentsService.update(agentId, { organisationId: orgId, isConfirmed: true });
  }

  async removeMember(_orgId: string, agentId: string): Promise<void> {
    const agent = await this.agentsService.findById(agentId);
    await this.agentsService.update(agentId, { organisationId: undefined, isConfirmed: false });
    if (agent.user?.id) {
      await this.usersService.update(agent.user.id, { organisationId: undefined });
    }
  }

  async inviteMember(orgId: string, phone: string): Promise<any> {
    const user = await this.usersService.findByPhone(phone);
    if (!user) throw new NotFoundException(`No user with phone ${phone}`);
    const agent = await this.agentsService.findByUserId(user.id);
    if (!agent) throw new NotFoundException('User has no agent profile');

    await this.agentsService.update(agent.id, {
      organisationId: orgId,
      isConfirmed: false,
    });

    return { message: `Invitation sent to ${user.name}`, agentId: agent.id };
  }

  private async buildDirectoryItem(org: Organisation): Promise<any> {
    const [stats, primaryAdmin, subscription, billing, taskSummary] = await Promise.all([
      this.getStats(org.id),
      this.getPrimaryAdmin(org),
      this.subRepo.findOne({ where: { organisationId: org.id } }),
      this.getBillingSummary(org.id),
      this.getTaskSummary(org.id),
    ]);

    const compliance = this.getComplianceSummary(org);
    const health = this.buildHealthFlags(org, stats, subscription, billing, taskSummary, primaryAdmin, compliance);

    return {
      ...org,
      primaryAdmin,
      stats,
      subscription: subscription ? {
        plan: subscription.plan,
        status: subscription.status,
        daysRemaining: subscription.daysRemaining,
        isActive: subscription.isActive,
        currentPeriodEnd: subscription.currentPeriodEnd,
      } : null,
      billing,
      compliance,
      health,
    };
  }

  private async getPrimaryAdmin(org: Organisation): Promise<any | null> {
    if (!org.ownerId) return null;
    const user = await this.userRepo.findOne({
      where: { id: org.ownerId },
      select: ['id', 'name', 'phone', 'email', 'role', 'isActive', 'lastLoginAt'],
    });
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    };
  }

  private async getTaskSummary(orgId: string): Promise<any> {
    const qb = this.taskRepo
      .createQueryBuilder('task')
      .leftJoin('agents', 'agent', 'agent.id = task."agentId"')
      .where('(task."organisationId" = :orgId OR agent."organisationId" = :orgId)', { orgId })
      .orderBy('task.createdAt', 'DESC');

    const tasks = await qb.clone().orderBy('task.updatedAt', 'DESC').getMany();
    const recent = tasks.slice(0, 8);
    const now = new Date();

    return {
      total: tasks.length,
      pending: tasks.filter((task) => task.status === TaskStatus.PENDING).length,
      inProgress: tasks.filter((task) => task.status === TaskStatus.IN_PROGRESS).length,
      completed: tasks.filter((task) => task.status === TaskStatus.COMPLETED).length,
      failed: tasks.filter((task) => task.status === TaskStatus.FAILED).length,
      cancelled: tasks.filter((task) => task.status === TaskStatus.CANCELLED).length,
      overdue: tasks.filter((task) => task.dueAt && new Date(task.dueAt) < now && ![TaskStatus.COMPLETED, TaskStatus.CANCELLED].includes(task.status)).length,
      acceptanceOverdue: tasks.filter((task) => task.acceptanceOverdue).length,
      recent: recent.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueAt: task.dueAt,
        agentId: task.agentId,
        updatedAt: task.updatedAt,
      })),
    };
  }

  private async getJobSummary(userIds: string[]): Promise<any> {
    if (!userIds.length) {
      return {
        total: 0,
        open: 0,
        assigned: 0,
        inProgress: 0,
        completed: 0,
        applications: 0,
        shortlisted: 0,
        hired: 0,
        recent: [],
      };
    }

    const jobs = await this.jobRepo.find({
      where: { postedById: In(userIds) },
      order: { updatedAt: 'DESC' },
    });

    const jobIds = jobs.map((job) => job.id);
    const applications = jobIds.length
      ? await this.appRepo.find({ where: { jobId: In(jobIds) } })
      : [];

    return {
      total: jobs.length,
      open: jobs.filter((job) => job.status === JobStatus.OPEN).length,
      inProgress: jobs.filter((job) => job.status === JobStatus.IN_PROGRESS).length,
      completed: jobs.filter((job) => job.status === JobStatus.COMPLETED).length,
      cancelled: jobs.filter((job) => job.status === JobStatus.CANCELLED).length,
      applications: applications.length,
      shortlisted: applications.filter((application) => application.status === ApplicationStatus.SHORTLISTED).length,
      hired: applications.filter((application) => application.status === ApplicationStatus.ACCEPTED).length,
      recent: jobs.slice(0, 8).map((job) => ({
        id: job.id,
        title: job.title,
        status: job.status,
        category: job.category,
        county: job.county,
        applicantCount: job.applicantCount,
        deadline: job.deadline,
        updatedAt: job.updatedAt,
      })),
    };
  }

  private async getBillingSummary(orgId: string): Promise<any> {
    const invoices = await this.invRepo.find({
      where: { organisationId: orgId },
      order: { createdAt: 'DESC' },
      take: 8,
    });

    const invoiceTotals = await this.invRepo
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(CASE WHEN invoice.status = :paid THEN invoice.amountKes ELSE 0 END), 0)', 'paidKes')
      .addSelect('COALESCE(SUM(CASE WHEN invoice.status = :pending THEN invoice.amountKes ELSE 0 END), 0)', 'outstandingKes')
      .where('invoice.organisationId = :orgId', { orgId })
      .setParameters({
        paid: InvoiceStatus.PAID,
        pending: InvoiceStatus.PENDING,
      })
      .getRawOne();

    const payoutTotals = await this.txRepo
      .createQueryBuilder('tx')
      .innerJoin('wallets', 'wallet', 'wallet.id = tx."walletId"')
      .innerJoin('agents', 'agent', 'agent.id = wallet."agentId"::uuid')
      .select('COALESCE(SUM(CASE WHEN tx.type = :credit THEN tx.amount ELSE 0 END), 0)', 'credits')
      .addSelect('COALESCE(SUM(CASE WHEN tx.type = :debit THEN tx.amount ELSE 0 END), 0)', 'debits')
      .where('agent."organisationId" = :orgId', { orgId })
      .setParameters({
        credit: TransactionType.CREDIT,
        debit: TransactionType.DEBIT,
      })
      .getRawOne();

    const lastPaidInvoice = invoices.find((invoice) => invoice.status === InvoiceStatus.PAID);

    return {
      paidKes: Number(invoiceTotals?.paidKes || 0),
      outstandingKes: Number(invoiceTotals?.outstandingKes || 0),
      agentCreditsKes: Number(payoutTotals?.credits || 0),
      agentWithdrawalsKes: Number(payoutTotals?.debits || 0),
      lastPaymentAt: lastPaidInvoice?.paidAt || null,
      recentInvoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountKes: Number(invoice.amountKes),
        status: invoice.status,
        plan: invoice.plan,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        mpesaCode: invoice.mpesaCode,
        paymentMethod: invoice.paymentMethod,
      })),
    };
  }

  private async getMemberKycStats(orgId: string): Promise<{ total: number; approved: number; rate: number }> {
    const { UserRole } = await import('../users/user.entity');
    // Every platform member (except super_admin) must be verified
    const members = await this.userRepo.find({
      where: { organisationId: orgId },
      select: ['id', 'role'],
    });
    const verifiable = members.filter((m) => m.role !== UserRole.SUPER_ADMIN);
    if (verifiable.length === 0) return { total: 0, approved: 0, rate: 100 };
    const memberIds = verifiable.map((m) => m.id);
    const approved = await this.verRepo.count({
      where: { userId: In(memberIds), status: VerificationStatus.APPROVED },
    });
    return { total: verifiable.length, approved, rate: Math.round((approved / verifiable.length) * 100) };
  }

  private getComplianceSummary(org: Organisation, agentKyc?: { total: number; approved: number; rate: number }): any {
    const trackedFields = [
      { key: 'industry',        label: 'Industry' },
      { key: 'county',          label: 'County' },
      { key: 'description',     label: 'Description' },
      { key: 'address',         label: 'Physical address' },
      { key: 'billingEmail',    label: 'Billing email' },
      { key: 'billingPhone',    label: 'Billing phone' },
      { key: 'kraPin',          label: 'KRA PIN number' },
      { key: 'businessRegNo',   label: 'Business registration number' },
      { key: 'kraDocUrl',       label: 'KRA PIN certificate (upload)' },
      { key: 'businessRegDocUrl', label: 'Business registration certificate (upload)' },
      { key: 'taxComplianceDocUrl', label: 'Tax compliance certificate (upload)' },
    ] as const;

    const missingFields: string[] = trackedFields
      .filter((field) => !org[field.key])
      .map((field) => field.label);

    // KYC check: all members (except super_admin) must have approved verification
    const kycIncluded = agentKyc && agentKyc.total > 0;
    if (kycIncluded && agentKyc!.rate < 100) {
      missingFields.push(`Member identity verification (${agentKyc!.approved}/${agentKyc!.total} verified)`);
    }
    const totalFields = trackedFields.length + (kycIncluded ? 1 : 0);

    return {
      completionRate: Math.round(((totalFields - missingFields.length) / totalFields) * 100),
      missingFields,
      agentKyc: agentKyc || null,
      tax: {
        kraPin: org.kraPin || null,
        vatNumber: org.vatNumber || null,
        businessRegNo: org.businessRegNo || null,
      },
      billing: {
        billingEmail: org.billingEmail || null,
        billingPhone: org.billingPhone || null,
        address: org.address || null,
      },
    };
  }

  private buildHealthFlags(
    org: Organisation,
    stats: any,
    subscription: Subscription | null,
    billing: any,
    taskSummary: any,
    primaryAdmin: any,
    compliance: any,
  ): { items: HealthFlag[]; summary: { critical: number; warning: number; info: number; total: number } } {
    const flags: HealthFlag[] = [];

    if (org.isActive === false) {
      flags.push({
        level: 'critical',
        code: 'org_inactive',
        title: 'Organisation is inactive',
        description: 'Users in this organisation may be blocked from normal access until it is reactivated.',
      });
    }

    if (!primaryAdmin) {
      flags.push({
        level: 'critical',
        code: 'missing_primary_admin',
        title: 'No primary admin assigned',
        description: 'Assign a confirmed admin so the organisation has a clear operational owner.',
      });
    }

    if (subscription?.status === SubStatus.PAST_DUE) {
      flags.push({
        level: 'critical',
        code: 'subscription_past_due',
        title: 'Subscription is past due',
        description: 'Billing is overdue and the organisation may be at risk of suspension.',
      });
    }

    if (!subscription) {
      flags.push({
        level: 'warning',
        code: 'missing_subscription',
        title: 'No subscription record',
        description: 'This organisation is missing billing metadata and should be checked before scaling usage.',
      });
    } else if (subscription.status === SubStatus.TRIAL && subscription.daysRemaining <= 3) {
      flags.push({
        level: 'warning',
        code: 'trial_ending',
        title: 'Trial period ending soon',
        description: `Only ${subscription.daysRemaining} day(s) remain on the current trial.`,
      });
    }

    if ((billing.outstandingKes || 0) > 0) {
      flags.push({
        level: 'warning',
        code: 'outstanding_invoice',
        title: 'Outstanding invoices',
        description: `KES ${Number(billing.outstandingKes).toLocaleString()} is still unpaid.`,
      });
    }

    if ((stats.pendingInvites || 0) > 0) {
      flags.push({
        level: 'warning',
        code: 'pending_invites',
        title: 'Pending invitations',
        description: `${stats.pendingInvites} member invite(s) are still awaiting confirmation.`,
      });
    }

    if ((taskSummary.overdue || 0) > 0) {
      flags.push({
        level: 'warning',
        code: 'overdue_tasks',
        title: 'Overdue tasks detected',
        description: `${taskSummary.overdue} task(s) are overdue and need operational attention.`,
      });
    }

    if (compliance.missingFields.length > 0) {
      flags.push({
        level: 'info',
        code: 'profile_incomplete',
        title: 'Organisation profile incomplete',
        description: `${compliance.missingFields.length} profile/compliance field(s) are still missing.`,
      });
    }

    if ((stats.totalAgents || 0) > 0 && (stats.agentsInField || 0) === 0) {
      flags.push({
        level: 'info',
        code: 'no_agents_in_field',
        title: 'No agents currently in the field',
        description: 'The team has agents, but none are actively checked in right now.',
      });
    }

    const summary = flags.reduce((acc, flag) => {
      acc[flag.level] += 1;
      acc.total += 1;
      return acc;
    }, { critical: 0, warning: 0, info: 0, total: 0 });

    return { items: flags, summary };
  }
}
