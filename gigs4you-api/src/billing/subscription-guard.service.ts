import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Subscription, PlanTier, PLAN_LIMITS, SubStatus } from './billing.entity';

@Injectable()
export class SubscriptionGuard {
  constructor(
    @InjectRepository(Subscription)
    private subRepo: Repository<Subscription>,
  ) {}

  /**
   * Check if org can add more agents based on subscription plan.
   */
  async checkAgentLimit(orgId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    plan: PlanTier;
  }> {
    const sub = await this.getActiveSubscription(orgId);
    const plan = sub?.plan || PlanTier.FREE;
    const limit = PLAN_LIMITS[plan].agents;
    
    return {
      allowed: limit > 0, // 0 = no agents allowed
      current: 0, // Caller should pass actual count
      limit,
      plan,
    };
  }

  /**
   * Check if org can post more jobs based on subscription plan.
   */
  async checkJobLimit(orgId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    plan: PlanTier;
  }> {
    const sub = await this.getActiveSubscription(orgId);
    const plan = sub?.plan || PlanTier.FREE;
    const limit = PLAN_LIMITS[plan].jobs;
    
    return {
      allowed: limit > 0,
      current: 0,
      limit,
      plan,
    };
  }

  /**
   * Enforce agent creation limit.
   * Call this before creating an agent.
   */
  async enforceAgentCreation(orgId: string, currentAgentCount: number): Promise<void> {
    const sub = await this.getActiveSubscription(orgId);
    const plan = sub?.plan || PlanTier.FREE;
    const limit = PLAN_LIMITS[plan].agents;
    
    if (currentAgentCount >= limit) {
      throw new ForbiddenException(
        `Agent limit reached (${currentAgentCount}/${limit}). ` +
        `Upgrade your ${plan} plan to add more agents. ` +
        `Visit Settings → Billing to upgrade.`,
      );
    }
  }

  /**
   * Enforce job posting limit.
   * Call this before posting a job.
   */
  async enforceJobCreation(orgId: string, currentJobCount: number): Promise<void> {
    const sub = await this.getActiveSubscription(orgId);
    const plan = sub?.plan || PlanTier.FREE;
    const limit = PLAN_LIMITS[plan].jobs;
    
    if (currentJobCount >= limit) {
      throw new ForbiddenException(
        `Job posting limit reached (${currentJobCount}/${limit}). ` +
        `Upgrade your ${plan} plan to post more jobs. ` +
        `Visit Settings → Billing to upgrade.`,
      );
    }
  }

  /**
   * Get active subscription for org, or default free tier.
   */
  async getActiveSubscription(orgId: string): Promise<Subscription | null> {
    const now = new Date();
    
    return this.subRepo.findOne({
      where: {
        organisationId: orgId,
        status: SubStatus.ACTIVE,
        currentPeriodEnd: MoreThan(now),
      },
    });
  }

  /**
   * Get subscription with all statuses (for admin checks).
   */
  async getSubscription(orgId: string): Promise<Subscription | null> {
    return this.subRepo.findOne({
      where: { organisationId: orgId },
    });
  }

  /**
   * Check if subscription allows AI features.
   */
  async checkAiFeatureAccess(orgId: string): Promise<boolean> {
    const sub = await this.getActiveSubscription(orgId);
    const plan = sub?.plan || PlanTier.FREE;
    
    // AI features available on GROWTH and above
    return [PlanTier.GROWTH, PlanTier.SCALE, PlanTier.ENTERPRISE].includes(plan);
  }

  /**
   * Get plan display info.
   */
  getPlanInfo(plan: PlanTier): { name: string; agents: number; jobs: number; price: string } {
    const limits = PLAN_LIMITS[plan];
    return {
      name: plan.charAt(0).toUpperCase() + plan.slice(1),
      agents: limits.agents,
      jobs: limits.jobs,
      price: limits.priceKes === 0 ? 'Free' : `KES ${limits.priceKes.toLocaleString()}/mo`,
    };
  }
}
