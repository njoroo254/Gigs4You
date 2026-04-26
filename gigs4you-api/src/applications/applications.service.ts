import {
  Injectable, NotFoundException,
  ConflictException, ForbiddenException, Optional, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JobApplication, ApplicationStatus } from './job-application.entity';
import { Job } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { WorkersService } from '../workers/workers.service';
import { AiService } from '../ai/ai.service';
import { PushService } from '../push/push.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationService } from '../notifications-gateway/notification.service';

type ApplicationScore = {
  score: number;
  reasoning: string;
};

@Injectable()
export class ApplicationsService {
  private readonly log = new Logger(ApplicationsService.name);

  constructor(
    @InjectRepository(JobApplication)
    private appRepo: Repository<JobApplication>,
    @InjectRepository(Job)
    private jobRepo: Repository<Job>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private workersService: WorkersService,
    @Optional() private aiService?: AiService,
    @Optional() private pushService?: PushService,
    @Optional() private notificationsService?: NotificationsService,
    @Optional() private notificationService?: NotificationService,
  ) {}

  async apply(
    jobId: string,
    applicantId: string,
    coverNote?: string,
    agentId?: string,
  ): Promise<JobApplication> {
    const existing = await this.appRepo.findOne({
      where: { jobId, applicantId },
    });
    if (existing) {
      throw new ConflictException('You have already applied for this job');
    }

    const application = this.appRepo.create({
      jobId,
      agentId: agentId || undefined,
      applicantId,
      coverNote,
      status: ApplicationStatus.PENDING,
    });

    const saved = await this.appRepo.save(application);
    await this.syncApplicantCount(jobId);

    // Notify the job poster that a new application was received
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (job?.postedById) {
      const applicantUser = await this.userRepo.findOne({ where: { id: applicantId } }).catch(() => null);
      const applicantName = applicantUser?.name ?? 'A worker';
      // Notify poster
      this.notificationsService?.notifyJobApplication(job.postedById, applicantName, job.title, jobId);
      this.pushService?.sendToUser(job.postedById, {
        title: 'New job application',
        body: `${applicantName} applied for "${job.title}"`,
        data: { type: 'application', screen: '/jobs' },
      }).catch(e => this.log.error(`Push (job application) failed for ${job.postedById}: ${(e as Error).message}`));

      // Confirm to applicant via SMS/Email
      if (applicantUser) {
        this.notificationService?.notifyApplicationConfirmed({
          phone: applicantUser.phone, email: applicantUser.email, name: applicantUser.name,
          jobTitle: job.title, jobId,
        }).catch(e => this.log.error(`SMS/email (application confirm) failed: ${(e as Error).message}`));
      }
      this.notificationsService?.notify(
        applicantId,
        '📋 Application submitted',
        `Your application for "${job.title}" has been received. We'll notify you when there's an update.`,
        'application' as any,
        jobId, 'job',
      );
    }

    return saved;
  }

  async findById(applicationId: string): Promise<JobApplication> {
    const app = await this.appRepo.findOne({
      where: { id: applicationId },
      relations: ['agent', 'agent.user', 'job', 'job.requiredSkills'],
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  async findByJob(jobId: string): Promise<any[]> {
    const apps = await this.appRepo.find({
      where: { jobId },
      relations: ['agent', 'agent.user', 'job', 'job.requiredSkills'],
      order: { appliedAt: 'DESC' },
    });
    const job = apps[0]?.job || await this.jobRepo.findOne({
      where: { id: jobId },
      relations: ['requiredSkills'],
    });
    return this.decorateApplications(apps, job || undefined);
  }

  async findByAgent(agentId: string): Promise<any[]> {
    const apps = await this.appRepo.find({
      where: { agentId },
      relations: ['job', 'job.requiredSkills', 'agent', 'agent.user'],
      order: { appliedAt: 'DESC' },
    });
    return this.decorateApplications(apps);
  }

  async findByApplicant(applicantId: string): Promise<any[]> {
    const apps = await this.appRepo.find({
      where: { applicantId },
      relations: ['job', 'job.requiredSkills', 'agent', 'agent.user'],
      order: { appliedAt: 'DESC' },
    });
    return this.decorateApplications(apps);
  }

  async withdrawApplication(applicationId: string, applicantId: string): Promise<void> {
    const app = await this.appRepo.findOne({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('Application not found');

    if (app.agentId !== applicantId && app.applicantId !== applicantId) {
      throw new ForbiddenException('You can only withdraw your own applications');
    }

    if (app.status !== ApplicationStatus.PENDING) {
      throw new ConflictException('Cannot withdraw application that has been reviewed');
    }

    app.status = ApplicationStatus.WITHDRAWN;
    await this.appRepo.save(app);
    await this.syncApplicantCount(app.jobId);
  }

  async updateApplication(
    applicationId: string,
    applicantId: string,
    updates: { coverNote?: string }
  ): Promise<JobApplication> {
    const app = await this.appRepo.findOne({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('Application not found');

    if (app.agentId !== applicantId && app.applicantId !== applicantId) {
      throw new ForbiddenException('You can only update your own applications');
    }

    if (app.status !== ApplicationStatus.PENDING) {
      throw new ConflictException('Cannot update application that has been reviewed');
    }

    if (updates.coverNote !== undefined) app.coverNote = updates.coverNote;

    return this.appRepo.save(app);
  }

  async shortlist(applicationId: string): Promise<JobApplication> {
    await this.appRepo.update(applicationId, {
      status: ApplicationStatus.SHORTLISTED,
    });
    const updated = await this.appRepo.findOne({
      where: { id: applicationId },
      relations: ['agent', 'agent.user'],
    });
    if (!updated) throw new NotFoundException('Application not found');
    return updated;
  }

  async accept(applicationId: string): Promise<JobApplication> {
    const app = await this.appRepo.findOne({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('Application not found');
    app.status = ApplicationStatus.ACCEPTED;
    const saved = await this.appRepo.save(app);

    // Notify the applicant they were accepted — fetch job title for context
    setImmediate(async () => {
      try {
        const job = await this.jobRepo.findOne({ where: { id: app.jobId } });
        if (!job) return;
        const recipientId = app.applicantId;

        // FCM push
        this.pushService?.sendToUser(recipientId, {
          title: '🎉 Application accepted!',
          body: `You have been selected for "${job.title}". Open the app for details.`,
          data: { type: 'application', jobId: job.id, screen: '/jobs' },
        }).catch(e => this.log.error(`Push (application accepted) failed for ${recipientId}: ${(e as Error).message}`));

        // In-app bell
        this.notificationsService?.notifyJobAssigned(recipientId, job.title, job.id);

        // SMS + email
        const user = await this.userRepo.findOne({ where: { id: recipientId } });
        if (user) {
          this.notificationService?.notifyJobAssigned({
            phone: user.phone, email: user.email, name: user.name,
            jobTitle: job.title, jobId: job.id,
          }).catch(e => this.log.error(`SMS/email (application accepted) failed for ${recipientId}: ${(e as Error).message}`));
        }
      } catch (e) {
        this.log.error(`Accept notifications failed for application ${applicationId}: ${(e as Error).message}`);
      }
    });

    return saved;
  }

  async reject(applicationId: string, _reason?: string): Promise<JobApplication> {
    await this.appRepo.update(applicationId, {
      status: ApplicationStatus.REJECTED,
    });
    const updated = await this.appRepo.findOne({ where: { id: applicationId } });
    if (!updated) throw new NotFoundException('Application not found');
    return updated;
  }

  async withdraw(applicationId: string, agentId: string): Promise<JobApplication> {
    const app = await this.appRepo.findOne({ where: { id: applicationId, agentId } });
    if (!app) throw new NotFoundException('Application not found');
    app.status = ApplicationStatus.WITHDRAWN;
    const saved = await this.appRepo.save(app);
    await this.syncApplicantCount(app.jobId);
    return saved;
  }

  async countForJob(jobId: string): Promise<number> {
    return this.appRepo.count({
      where: {
        jobId,
        status: In([
          ApplicationStatus.PENDING,
          ApplicationStatus.SHORTLISTED,
          ApplicationStatus.ACCEPTED,
        ]) as any,
      },
    });
  }

  async hasApplied(jobId: string, applicantId: string): Promise<boolean> {
    const app = await this.appRepo.findOne({ where: { jobId, applicantId } });
    return !!app;
  }

  async findByJobAndApplicant(jobId: string, applicantId: string): Promise<JobApplication | null> {
    return this.appRepo.findOne({ where: { jobId, applicantId } });
  }

  async getStats(): Promise<any> {
    const [total, pending, accepted, rejected] = await Promise.all([
      this.appRepo.count(),
      this.appRepo.count({ where: { status: ApplicationStatus.PENDING } }),
      this.appRepo.count({ where: { status: ApplicationStatus.ACCEPTED } }),
      this.appRepo.count({ where: { status: ApplicationStatus.REJECTED } }),
    ]);
    return { total, pending, accepted, rejected };
  }

  private async syncApplicantCount(jobId: string): Promise<void> {
    const count = await this.countForJob(jobId);
    await this.jobRepo.update(jobId, { applicantCount: count });
  }

  private async decorateApplications(apps: JobApplication[], job?: Job): Promise<any[]> {
    if (!apps.length) return [];

    const applicantIds = Array.from(new Set(apps.map((app) => app.applicantId).filter(Boolean)));
    const users = applicantIds.length
      ? await this.userRepo.findBy({ id: In(applicantIds) })
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    const scores = job
      ? await this.scoreApplications(job, apps, usersById)
      : new Map<string, ApplicationScore>();

    return apps
      .map((app) => {
        const user = app.applicantId ? usersById.get(app.applicantId) : undefined;
        const applicantName = app.agent?.user?.name || user?.name || 'Worker';
        const score = scores.get(app.id);

        return {
          ...app,
          workerId: app.applicantId,
          applicantName,
          applicantType: app.agentId ? 'agent' : 'worker',
          worker: {
            id: app.applicantId,
            name: applicantName,
          },
          matchScore: score?.score ?? null,
          matchReasoning: score?.reasoning ?? null,
        };
      })
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0) || new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
  }

  private async scoreApplications(
    job: Job,
    apps: JobApplication[],
    usersById: Map<string, User>,
  ): Promise<Map<string, ApplicationScore>> {
    const requiredSkills = (job.requiredSkills || []).map((skill) => skill.name);

    const candidateContexts = await Promise.all(apps.map(async (app) => {
      const profile = app.agentId
        ? await this.workersService.findByAgentId(app.agentId).catch(() => null)
        : await this.workersService.findByUserId(app.applicantId).catch(() => null);
      const user = app.applicantId ? usersById.get(app.applicantId) : undefined;

      return {
        app,
        candidate: {
          id: app.id,
          name: app.agent?.user?.name || user?.name || 'Worker',
          skills: (profile?.skills || []).map((skill) => ({ id: skill.id, name: skill.name })),
          location: profile?.county || profile?.location || user?.county || '',
          rating: Number(profile?.averageRating ?? app.agent?.averageRating ?? 0),
          completedJobs: Number(profile?.completedJobs ?? app.agent?.completedJobs ?? 0),
          currentStreak: Number(app.agent?.currentStreak ?? 0),
          available: profile?.isAvailable !== false,
        },
      };
    }));

    const constraints = {
      required_skills: requiredSkills,
      location: job.county || job.location,
      category: job.category,
      urgency: job.isUrgent ? 'high' : 'normal',
    };

    try {
      if (this.aiService) {
        const aiResult = await this.aiService.matchJobToWorkers(
          job.id,
          candidateContexts.map((entry) => entry.candidate),
          constraints,
        );

        if (Array.isArray(aiResult?.matches) && aiResult.matches.length) {
          return new Map(aiResult.matches.map((match) => [
            match.worker_id,
            {
              score: Math.round(match.score),
              reasoning: match.reasoning || 'AI-ranked applicant fit',
            },
          ]));
        }
      }
    } catch (_) {}

    return new Map(candidateContexts.map((entry) => {
      const workerSkills = new Set(
        (entry.candidate.skills || [])
          .map((skill: any) => String(skill?.name || '').trim().toLowerCase())
          .filter(Boolean),
      );
      const normalizedRequired = requiredSkills
        .map((skill) => String(skill || '').trim().toLowerCase())
        .filter(Boolean);
      const matchedSkills = normalizedRequired.filter((skill) => workerSkills.has(skill)).length;
      const skillScore = normalizedRequired.length
        ? Math.round((matchedSkills / normalizedRequired.length) * 55)
        : 25;
      const locationScore = entry.candidate.location
        && job.county
        && String(entry.candidate.location).toLowerCase().includes(job.county.toLowerCase()) ? 20 : 0;
      const ratingScore = Math.min(15, Math.round(entry.candidate.rating * 3));
      const historyScore = Math.min(10, entry.candidate.completedJobs);
      const availabilityScore = entry.candidate.available ? 5 : 0;
      const score = Math.min(100, skillScore + locationScore + ratingScore + historyScore + availabilityScore);

      return [
        entry.app.id,
        {
          score,
          reasoning: `skills ${matchedSkills}/${normalizedRequired.length || 0}, rating ${entry.candidate.rating || 0}, completed ${entry.candidate.completedJobs || 0}`,
        },
      ];
    }));
  }
}
