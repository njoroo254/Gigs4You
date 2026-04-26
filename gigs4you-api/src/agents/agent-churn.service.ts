/**
 * AgentChurnService — daily cron job that predicts which agents are at risk
 * of disengaging and notifies them (and their managers) proactively.
 *
 * Churn score (0–1, higher = more at risk):
 *   - Inactive ≥ 14 days since last task completion  → +0.40
 *   - Streak dropped by ≥ 50% in last 7 days         → +0.20
 *   - Task decline rate ≥ 30% in last 30 tasks       → +0.25
 *   - Not available (isAvailable = false)             → +0.15
 *
 * Actions:
 *   - score ≥ 0.70  → push notification to agent + alert to manager
 *   - score ≥ 0.50  → push notification to agent only
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Agent } from './agent.entity';
import { Task, TaskStatus } from '../tasks/task.entity';
import { User, UserRole } from '../users/user.entity';
import { PushService } from '../push/push.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AgentChurnService {
  private readonly log = new Logger(AgentChurnService.name);

  constructor(
    @InjectRepository(Agent) private agentRepo: Repository<Agent>,
    @InjectRepository(Task)  private taskRepo:  Repository<Task>,
    @InjectRepository(User)  private userRepo:  Repository<User>,
    @Optional() private pushService: PushService,
    @Optional() private notificationsService: NotificationsService,
  ) {}

  // ── Run every morning at 9 AM Nairobi time ──────────────────────────────
  @Cron('0 9 * * *', { timeZone: 'Africa/Nairobi' })
  async runChurnCheck() {
    this.log.log('Running daily agent churn check...');
    const agents = await this.agentRepo.find({ relations: ['user'] });
    let notified = 0;

    for (const agent of agents) {
      try {
        const score = await this.computeChurnScore(agent);
        if (score < 0.50) continue;

        const userId = agent.user?.id;
        if (userId) {
          // FCM push + in-app bell for agent
          this.pushService?.notifyChurnRisk(userId, score)
            .catch(e => this.log.error(`Push (churn agent) failed for ${userId}: ${(e as Error).message}`));
          this.notificationsService?.notifyChurnRisk(userId);
        }

        // High-risk: also alert the org manager
        if (score >= 0.70 && agent.organisationId) {
          const manager = await this.userRepo.findOne({
            where: { organisationId: agent.organisationId, role: UserRole.MANAGER },
          });
          if (manager?.id) {
            // FCM push + in-app bell for manager
            this.pushService?.notifyAgentChurnRisk(manager.id, agent.user?.name ?? 'An agent', score)
              .catch(e => this.log.error(`Push (churn manager) failed for ${manager.id}: ${(e as Error).message}`));
            this.notificationsService?.notifyAgentChurnRisk(manager.id, agent.user?.name ?? 'An agent');
          }
        }

        notified++;
        this.log.log(`Churn alert — agent ${agent.id} (score ${score.toFixed(2)})`);
      } catch { /* never crash the loop */ }
    }

    this.log.log(`Churn check complete. ${notified}/${agents.length} agents notified.`);
  }

  private async computeChurnScore(agent: Agent): Promise<number> {
    let score = 0;

    // Factor 1: inactivity — days since last completed task
    const since14d = new Date(Date.now() - 14 * 86_400_000);
    const recentCompleted = await this.taskRepo.count({
      where: { agentId: agent.id, status: TaskStatus.COMPLETED, completedAt: MoreThan(since14d) },
    });
    if (recentCompleted === 0) score += 0.40;

    // Factor 2: availability flag
    if (!agent.isAvailable) score += 0.15;

    // Factor 3: low streak (≤ 2 days for an established agent with ≥5 completed jobs)
    if ((agent.completedJobs ?? 0) >= 5 && (agent.currentStreak ?? 0) <= 2) score += 0.20;

    // Factor 4: decline rate — count declined tasks in last 30 tasks
    const last30 = await this.taskRepo.find({
      where: { agentId: agent.id },
      order: { createdAt: 'DESC' },
      take: 30,
      select: ['acceptanceStatus'],
    });
    if (last30.length >= 5) {
      const declined = last30.filter(t => t.acceptanceStatus === 'declined').length;
      const declineRate = declined / last30.length;
      if (declineRate >= 0.30) score += 0.25;
    }

    return Math.min(1, Math.round(score * 1000) / 1000);
  }
}
