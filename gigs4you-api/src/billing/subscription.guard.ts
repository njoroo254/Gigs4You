import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription, SubStatus, PlanTier, PLAN_LIMITS } from './billing.entity';
import { UserRole } from '../users/user.entity';

export const PLAN_LIMIT_KEY = 'planLimit';
export const PLAN_LIMIT = (resource: 'agents' | 'jobs') =>
  (target: any, key: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(PLAN_LIMIT_KEY, resource, descriptor.value);
    return descriptor;
  };

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(Subscription) private subRepo: Repository<Subscription>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) return true;

    // Super admin bypasses all plan restrictions
    if (user.role === UserRole.SUPER_ADMIN) return true;

    // Worker/employer have no org to check
    if (!user.orgId) return true;

    const sub = await this.subRepo.findOne({ where: { organisationId: user.orgId } });
    if (!sub) return true;  // No sub record yet — allow (will be created on first action)

    // Block expired/cancelled subscriptions
    const blockedStatuses = [SubStatus.CANCELLED, SubStatus.EXPIRED];
    if (blockedStatuses.includes(sub.status)) {
      throw new ForbiddenException({
        statusCode: 402,
        message: 'Subscription expired or cancelled. Please renew at /billing.',
        plan: sub.plan,
        status: sub.status,
        upgradeUrl: '/billing',
      });
    }

    return true;
  }
}

// ── Standalone limit checker (used in services) ──────────────────────
@Injectable()
export class PlanLimitService {
  constructor(
    @InjectRepository(Subscription) private subRepo: Repository<Subscription>,
  ) {}

  async checkAgentLimit(orgId: string, currentCount: number): Promise<void> {
    const sub = await this.subRepo.findOne({ where: { organisationId: orgId } });
    const plan = sub?.plan || PlanTier.FREE;
    const limit = PLAN_LIMITS[plan].agents;
    if (currentCount >= limit) {
      throw new ForbiddenException({
        statusCode: 402,
        message: `Agent limit reached for your ${plan} plan (${limit} agents). Upgrade to add more.`,
        currentCount,
        limit,
        plan,
        upgradeUrl: '/billing',
      });
    }
  }

  async checkJobLimit(orgId: string, currentCount: number): Promise<void> {
    const sub = await this.subRepo.findOne({ where: { organisationId: orgId } });
    const plan = sub?.plan || PlanTier.FREE;
    const limit = PLAN_LIMITS[plan].jobs;
    if (currentCount >= limit) {
      throw new ForbiddenException({
        statusCode: 402,
        message: `Job posting limit reached for your ${plan} plan (${limit} jobs). Upgrade to add more.`,
        currentCount,
        limit,
        plan,
        upgradeUrl: '/billing',
      });
    }
  }

  async getPlanInfo(orgId: string) {
    const sub = await this.subRepo.findOne({ where: { organisationId: orgId } });
    const plan = sub?.plan || PlanTier.FREE;
    return { plan, limits: PLAN_LIMITS[plan], status: sub?.status };
  }
}
