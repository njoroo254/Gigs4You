import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between, MoreThan } from 'typeorm';
import {
  IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean, IsArray,
} from 'class-validator';
import { Job, JobStatus, BudgetType } from './job.entity';
import { SkillsService } from '../skills/skills.service';
import { ApplicationsService } from '../applications/applications.service';
import { ApplicationStatus } from '../applications/job-application.entity';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationService } from '../notifications-gateway/notification.service';
import { PushService } from '../push/push.service';
import { WorkersService } from '../workers/workers.service';
import { AgentsService } from '../agents/agents.service';
import { User } from '../users/user.entity';

export class CreateJobDto {
  @IsString() @IsNotEmpty()
  title: string;

  @IsString() @IsNotEmpty()
  description: string;

  @IsString() @IsOptional()
  category?: string;

  @IsArray() @IsOptional()
  requiredSkillIds?: string[];

  @IsNumber() @IsOptional()
  budgetMin?: number;

  @IsNumber() @IsOptional()
  budgetMax?: number;

  @IsString() @IsOptional()
  budgetType?: string;

  @IsString() @IsNotEmpty()
  location: string;

  @IsNumber() @IsOptional()
  latitude?: number;

  @IsNumber() @IsOptional()
  longitude?: number;

  @IsString() @IsOptional()
  county?: string;

  @IsBoolean() @IsOptional()
  isUrgent?: boolean;

  @IsString() @IsOptional()
  startDate?: string;

  @IsString() @IsOptional()
  deadline?: string;

  @IsString() @IsOptional()
  companyName?: string;

  @IsNumber() @IsOptional()
  positionsAvailable?: number;
}

@Injectable()
export class JobsService {
  private readonly log = new Logger(JobsService.name);

  constructor(
    @InjectRepository(Job)
    private jobsRepo: Repository<Job>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private skillsService: SkillsService,
    private applicationsService: ApplicationsService,
    private walletService: WalletService,
    private notificationsService: NotificationsService,
    private workersService: WorkersService,
    private agentsService: AgentsService,
    @Optional() private pushService: PushService,
    @Optional() private notificationService: NotificationService,
  ) {}

  // ── Create a job ──────────────────────────────────
  async create(dto: CreateJobDto, postedById: string): Promise<Job> {
    const skills = dto.requiredSkillIds
      ? await this.skillsService.findByIds(dto.requiredSkillIds)
      : [];

    const job = this.jobsRepo.create({
      title:              dto.title,
      description:        dto.description,
      category:           dto.category,
      budgetMin:          dto.budgetMin,
      budgetMax:          dto.budgetMax,
      budgetType:         (dto.budgetType as any) ?? BudgetType.FIXED,
      location:           dto.location,
      latitude:           dto.latitude,
      longitude:          dto.longitude,
      county:             dto.county,
      isUrgent:           dto.isUrgent ?? false,
      companyName:        dto.companyName,
      positionsAvailable: dto.positionsAvailable ?? 1,
      postedById,
      requiredSkills:     skills,
      status:             JobStatus.OPEN,
      startDate:          dto.startDate ? new Date(dto.startDate) : undefined,
      deadline:           dto.deadline  ? new Date(dto.deadline)  : undefined,
    });

    return this.jobsRepo.save(job);
  }

  // ── List jobs with filters ─────────────────────────
  async findAll(filters: {
    category?: string;
    search?: string;
    status?: string;
    isUrgent?: boolean;
    county?: string;
    budgetMin?: number;
    lat?: number;
    lng?: number;
    page?: number;
    limit?: number;
    postedById?: string;
  } = {}): Promise<{ jobs: Job[]; total: number }> {
    const { page = 1, limit = 20 } = filters;

    const qb = this.jobsRepo
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.requiredSkills', 'skills')
      .select([
        'job.id',
        'job.title',
        'job.description',
        'job.category',
        'job.budgetMin',
        'job.budgetMax',
        'job.budgetType',
        'job.location',
        'job.latitude',
        'job.longitude',
        'job.county',
        'job.status',
        'job.isUrgent',
        'job.isFeatured',
        'job.startDate',
        'job.deadline',
        'job.postedById',
        'job.companyName',
        'job.companyLogoUrl',
        'job.positionsAvailable',
        'job.applicantCount',
        'job.assignedWorkerId',
        'job.viewCount',
        'job.createdAt',
        'job.updatedAt',
        'skills.id',
        'skills.name',
        'skills.category',
        'skills.iconCode',
        'skills.colorIndex',
        'skills.isActive',
        'skills.createdAt',
      ])
      .where('job.status = :status', { status: filters.status || JobStatus.OPEN });

    if (filters.postedById) {
      qb.andWhere('job.postedById = :postedById', { postedById: filters.postedById });
    }

    if (filters.category && filters.category !== 'all') {
      qb.andWhere('job.category = :category', { category: filters.category });
    }

    if (filters.search) {
      qb.andWhere(
        '(LOWER(job.title) LIKE LOWER(:s) OR LOWER(job.description) LIKE LOWER(:s) OR LOWER(job.companyName) LIKE LOWER(:s))',
        { s: `%${filters.search}%` },
      );
    }

    if (filters.isUrgent) {
      qb.andWhere('job.isUrgent = true');
    }

    if (filters.county) {
      qb.andWhere('LOWER(job.county) LIKE LOWER(:county)', { county: `%${filters.county}%` });
    }

    if (filters.budgetMin) {
      qb.andWhere('job.budgetMax >= :budgetMin', { budgetMin: filters.budgetMin });
    }

    qb.orderBy('job.isUrgent', 'DESC')
      .addOrderBy('job.isFeatured', 'DESC')
      .addOrderBy('job.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [jobs, total] = await qb.getManyAndCount();
    return { jobs, total };
  }

  async findById(id: string): Promise<Job> {
    const job = await this.jobsRepo.findOne({
      where: { id },
      relations: ['requiredSkills'],
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    await this.jobsRepo.increment({ id }, 'viewCount', 1);
    return job;
  }

  async findByPostedBy(userId: string): Promise<Job[]> {
    return this.jobsRepo.find({
      where: { postedById: userId },
      relations: ['requiredSkills'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByAssignedWorker(workerId: string): Promise<Job[]> {
    return this.jobsRepo.find({
      where: [
        { assignedWorkerId: workerId, status: JobStatus.COMPLETED },
      ],
      relations: ['requiredSkills'],
      order: { updatedAt: 'DESC' },
    });
  }

  // ── Hire external worker for job (B2C marketplace only) ──
  async assignWorker(jobId: string, workerId: string, postedById: string): Promise<Job> {
    const job = await this.findById(jobId);
    if (job.postedById !== postedById) {
      throw new ForbiddenException('Only the job poster can hire for this job');
    }

    job.assignedWorkerId = workerId;
    job.status = JobStatus.IN_PROGRESS;
    const saved = await this.jobsRepo.save(job);

    // Notify the assigned worker across all channels
    setImmediate(async () => {
      try {
        const worker = await this.userRepo.findOne({ where: { id: workerId } });
        if (!worker) return;

        // FCM push
        this.pushService?.notifyJobStatusChange(workerId, job.title, 'in_progress', jobId)
          .catch(e => this.log.error(`Push (job assigned) failed for user ${workerId}: ${(e as Error).message}`));

        // In-app bell
        this.notificationsService.notifyJobAssigned(workerId, job.title, jobId);

        // SMS + Email
        this.notificationService?.notifyJobAssigned({
          phone: worker.phone, email: worker.email, name: worker.name,
          jobTitle: job.title, jobId,
        }).catch(e => this.log.error(`SMS/email (job assigned) failed for user ${workerId}: ${(e as Error).message}`));
      } catch (e) {
        this.log.error(`Job assignment notifications failed for job ${jobId}: ${(e as Error).message}`);
      }
    });

    return saved;
  }

  // ── Mark job complete + pay worker ───────────────
  async completeJob(jobId: string, postedById: string, rating?: number): Promise<Job> {
    const job = await this.findById(jobId);
    if (job.postedById !== postedById) {
      throw new ForbiddenException('Only the job poster can complete this job');
    }

    if (!job.assignedWorkerId) {
      throw new BadRequestException('No worker has been hired for this job yet');
    }

    const amount = Number(job.budgetMax ?? job.budgetMin ?? 0);
    if (!isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Job has no valid budget set. Update budgetMin or budgetMax before marking complete.',
      );
    }

    job.status = JobStatus.COMPLETED;
    const saved = await this.jobsRepo.save(job);

    // Credit wallet — also fires push inside walletService
    try {
      await this.walletService.creditAgent(
        job.assignedWorkerId,
        amount,
        `Job payment — ${job.title}`,
        jobId,
      );
    } catch (err) {
      this.log.error(`Wallet credit failed for job ${jobId} worker ${job.assignedWorkerId}: ${(err as Error).message}`);
    }

    // Update worker profile stats
    const agent = await this.agentsService.findByUserId(job.assignedWorkerId).catch(() => null);
    const profileId = agent?.id ?? job.assignedWorkerId;
    try {
      await this.workersService.incrementCompletedJobs(profileId);
      if (rating) await this.workersService.addRating(profileId, rating);
    } catch (e) {
      this.log.error(`Worker stats update failed for profile ${profileId}: ${(e as Error).message}`);
    }

    // Notify worker that job is complete and payment is on the way
    setImmediate(async () => {
      try {
        // FCM push
        this.pushService?.notifyJobStatusChange(job.assignedWorkerId!, job.title, 'completed', jobId)
          .catch(e => this.log.error(`Push (job complete) failed: ${(e as Error).message}`));

        // In-app bell
        this.notificationsService.notifyJobCompleted(job.assignedWorkerId!, job.title, jobId);
      } catch (e) {
        this.log.error(`Job completion notifications failed for job ${jobId}: ${(e as Error).message}`);
      }
    });

    return saved;
  }

  // ── Job stats for dashboard ───────────────────────
  async getStats(): Promise<any> {
    const [total, open, inProgress, completed] = await Promise.all([
      this.jobsRepo.count(),
      this.jobsRepo.count({ where: { status: JobStatus.OPEN } }),
      this.jobsRepo.count({ where: { status: JobStatus.IN_PROGRESS } }),
      this.jobsRepo.count({ where: { status: JobStatus.COMPLETED } }),
    ]);
    return { total, open, inProgress, completed };
  }

  async getRecent(limit = 5): Promise<Job[]> {
    return this.jobsRepo.find({
      relations: ['requiredSkills'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async countByOrg(orgId: string): Promise<number> {
    return this.jobsRepo
      .createQueryBuilder('job')
      .innerJoin('job.postedBy', 'user')
      .where('user.organisationId = :orgId', { orgId })
      .getCount();
  }

  async update(id: string, data: {
    title?: string;
    description?: string;
    category?: string;
    location?: string;
    county?: string;
    budgetMin?: number;
    budgetMax?: number;
    budgetType?: string;
    isUrgent?: boolean;
    deadline?: string | Date;
    positionsAvailable?: number;
    companyName?: string;
  }): Promise<Job> {
    const job = await this.findById(id);
    if (data.deadline) data.deadline = new Date(data.deadline);
    Object.assign(job, data);
    return this.jobsRepo.save(job);
  }

  async cancel(id: string): Promise<Job> {
    const job = await this.findById(id);
    job.status = JobStatus.CANCELLED;
    return this.jobsRepo.save(job);
  }
}
