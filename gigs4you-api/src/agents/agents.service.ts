import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent, AgentStatus } from './agent.entity';
import { SubscriptionGuard } from '../billing/subscription-guard.service';

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(Agent)
    private agentsRepo: Repository<Agent>,
    @Inject(forwardRef(() => SubscriptionGuard))
    private subscriptionGuard: SubscriptionGuard,
  ) {}

  // ── Count agents by org (for subscription limits) ──
  async countByOrg(orgId: string): Promise<number> {
    return this.agentsRepo.count({ where: { organisationId: orgId } });
  }

  // ── Enforce agent creation limit before creating ──
  async enforceAgentCreation(orgId: string): Promise<void> {
    const currentCount = await this.countByOrg(orgId);
    await this.subscriptionGuard.enforceAgentCreation(orgId, currentCount);
  }

  // ── Field staff only (agent + supervisor roles) — for the agents page ──
  async findFieldStaff(orgId?: string): Promise<Agent[]> {
    const qb = this.agentsRepo
      .createQueryBuilder('agent')
      .leftJoinAndSelect('agent.user', 'user')
      .where('user.role IN (:...roles)', { roles: ['agent', 'supervisor'] })
      .orderBy('agent.createdAt', 'DESC');
    if (orgId) qb.andWhere('agent.organisationId = :orgId', { orgId });
    return qb.getMany();
  }

  // ── All agent records — for internal use (org service, task assignment) ──
  async findAll(orgId?: string): Promise<Agent[]> {
    const qb = this.agentsRepo
      .createQueryBuilder('agent')
      .leftJoinAndSelect('agent.user', 'user')
      .orderBy('agent.createdAt', 'DESC');
    if (orgId) qb.andWhere('agent.organisationId = :orgId', { orgId });
    return qb.getMany();
  }

  async findById(id: string): Promise<Agent> {
    const agent = await this.agentsRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!agent) throw new NotFoundException(`Agent ${id} not found`);
    return agent;
  }

  async update(agentId: string, data: Partial<Agent>): Promise<Agent> {
    await this.agentsRepo.update(agentId, data as any);
    return this.findById(agentId);
  }

  async findByUserId(userId: string): Promise<Agent | null> {
    return this.agentsRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
  }

  async createForUser(userId: string, deviceId?: string, organisationId?: string): Promise<Agent> {
    if (organisationId) {
      await this.enforceAgentCreation(organisationId);
    }
    const agent = this.agentsRepo.create({
      user: { id: userId },
      deviceId,
      organisationId,
      status: AgentStatus.OFFLINE,
    });
    return this.agentsRepo.save(agent);
  }

  // ── GPS Check-in ────────────────────────────────
  async checkIn(agentId: string, latitude: number, longitude: number): Promise<Agent> {
    const agent = await this.findById(agentId);

    agent.status = AgentStatus.CHECKED_IN;
    agent.lastLatitude = latitude;
    agent.lastLongitude = longitude;
    agent.lastSeenAt = new Date();
    agent.checkedInAt = new Date();

    return this.agentsRepo.save(agent);
  }

  // ── GPS Check-out ───────────────────────────────
  async checkOut(agentId: string): Promise<Agent> {
    const agent = await this.findById(agentId);
    agent.status = AgentStatus.CHECKED_OUT;
    agent.lastSeenAt = new Date();
    return this.agentsRepo.save(agent);
  }

  // ── Update live location (called every 30s by mobile app) ──
  async updateLocation(
    agentId: string,
    latitude: number,
    longitude: number,
  ): Promise<Agent> {
    await this.agentsRepo.update(agentId, {
      lastLatitude: latitude,
      lastLongitude: longitude,
      lastSeenAt: new Date(),
    });
    return this.findById(agentId);
  }

  // ── Add XP and auto-level-up ────────────────────
  async addXp(agentId: string, xp: number): Promise<Agent> {
    const agent = await this.findById(agentId);
    agent.totalXp += xp;

    // Level thresholds: 500, 1000, 2000, 3500, 5000 ...
    const thresholds = [0, 500, 1000, 2000, 3500, 5000, 7500, 10000];
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (agent.totalXp >= thresholds[i]) {
        agent.level = i + 1;
        break;
      }
    }

    return this.agentsRepo.save(agent);
  }

  // ── Live map — all agents with a last known location ──
  async getLiveAgents(orgId?: string): Promise<Partial<Agent>[]> {
    const qb = this.agentsRepo
      .createQueryBuilder('agent')
      .leftJoinAndSelect('agent.user', 'user')
      .where('agent.lastLatitude IS NOT NULL')
      .andWhere('agent.lastLongitude IS NOT NULL')
      .orderBy('agent.lastSeenAt', 'DESC');
    if (orgId) qb.andWhere('agent.organisationId = :orgId', { orgId });
    return qb.getMany();
  }
}
