import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkerProfile } from './worker-profile.entity';
import { SkillsService } from '../skills/skills.service';
import { AgentsService } from '../agents/agents.service';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(WorkerProfile)
    private profileRepo: Repository<WorkerProfile>,
    private skillsService: SkillsService,
    private agentsService: AgentsService,
  ) {}

  // For agents who do have an Agent record
  async getOrCreateProfile(agentId: string): Promise<WorkerProfile> {
    let profile = await this.profileRepo.findOne({
      where: { agentId },
      relations: ['skills', 'agent', 'agent.user'],
    });
    if (!profile) {
      const agent = await this.agentsService.findById(agentId);
      profile = this.profileRepo.create({ agentId, agent, skills: [] });
      profile = await this.profileRepo.save(profile);
    }
    return profile;
  }

  // Get or create a profile tied to a userId (for workers without Agent records)
  async getOrCreateProfileForUser(userId: string): Promise<WorkerProfile | null> {
    // First check if they have an agent
    const agent = await this.agentsService.findByUserId(userId).catch(() => null);
    if (agent) return this.getOrCreateProfile(agent.id);

    // Check if standalone worker profile exists
    const existing = await this.profileRepo
      .createQueryBuilder('wp')
      .leftJoinAndSelect('wp.skills', 'skills')
      .where('wp.userId = :userId', { userId })
      .getOne();

    if (existing) return existing;

    // Create new profile for freelancer worker
    const created = this.profileRepo.create({ userId, skills: [] } as any);
    const saved = await this.profileRepo.save(created as any);
    return saved as any as WorkerProfile;
  }

  async findByAgentId(agentId: string): Promise<WorkerProfile | null> {
    return this.profileRepo.findOne({
      where: { agentId },
      relations: ['skills', 'agent', 'agent.user'],
    });
  }

  async findByUserId(userId: string): Promise<WorkerProfile | null> {
    // Try agent-linked profile first
    const agentProfile = await this.profileRepo
      .createQueryBuilder('wp')
      .leftJoinAndSelect('wp.skills', 'skills')
      .leftJoinAndSelect('wp.agent', 'agent')
      .leftJoinAndSelect('agent.user', 'user')
      .where('user.id = :userId', { userId })
      .getOne();
    if (agentProfile) return agentProfile;

    // Fall back to userId column (worker freelancers)
    return this.profileRepo.findOne({
      where: { userId } as any,
      relations: ['skills'],
    });
  }

  // Search workers — returns both agent-linked and standalone worker profiles
  async searchWorkers(filters: {
    skillIds?:    string[];
    category?:    string;
    location?:    string;
    search?:      string;
    isAvailable?: boolean;
    page?:        number;
    limit?:       number;
  }): Promise<{ workers: any[]; total: number }> {
    const { page = 1, limit = 20 } = filters;

    const qb = this.profileRepo
      .createQueryBuilder('wp')
      .leftJoinAndSelect('wp.skills', 'skills')
      .leftJoinAndSelect('wp.agent', 'agent')
      .leftJoinAndSelect('agent.user', 'user')
      // No role filter — any profile can appear in directory
      // isActive check uses IS NULL fallback for profiles with no linked user
      .where('(user.id IS NULL OR user.isActive = true)');

    if (filters.isAvailable !== undefined)
      qb.andWhere('wp.isAvailable = :a', { a: filters.isAvailable });

    if (filters.location)
      qb.andWhere('LOWER(wp.location) LIKE LOWER(:loc)', { loc: `%${filters.location}%` });

    if (filters.search)
      qb.andWhere(
        '(LOWER(wp.bio) LIKE LOWER(:q) OR LOWER(user.name) LIKE LOWER(:q) OR LOWER(wp.location) LIKE LOWER(:q))',
        { q: `%${filters.search}%` },
      );

    if (filters.skillIds?.length)
      qb.andWhere('skills.id IN (:...ids)', { ids: filters.skillIds });

    if (filters.category)
      qb.andWhere('skills.category = :cat', { cat: filters.category });

    qb.orderBy('wp.averageRating', 'DESC')
      .addOrderBy('wp.completedJobs', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rawWorkers, total] = await qb.getManyAndCount();

    // Normalise output — flatten agent.user into the profile object
    const workers = rawWorkers.map(w => ({
      id:           w.id,
      agentId:      w.agentId,
      isAvailable:  w.isAvailable,
      location:     w.location,
      county:       w.county,
      bio:          w.bio,
      dailyRate:    w.dailyRate,
      hourlyRate:   w.hourlyRate,
      averageRating:w.averageRating,
      completedJobs:w.completedJobs,
      mpesaPhone:   w.mpesaPhone,
      avatarUrl:    w.avatarUrl,
      skills:       w.skills,
      workExperience:  (w as any).workExperience || [],
      education:       (w as any).education || [],
      certifications:  (w as any).certifications || [],
      languages:       (w as any).languages || [],
      dateOfBirth:     (w as any).dateOfBirth,
      agent:        w.agent ? {
        id:           w.agent.id,
        level:        w.agent.level,
        totalXp:      w.agent.totalXp,
        currentStreak:w.agent.currentStreak,
        status:       w.agent.status,
        user: w.agent.user ? {
          name:  w.agent.user.name,
          phone: w.agent.user.phone,
          role:  w.agent.user.role,
          email: w.agent.user.email,
        } : null,
      } : null,
    }));

    return { workers, total };
  }

  async updateProfile(agentId: string, data: Partial<WorkerProfile>): Promise<WorkerProfile> {
    const profile = await this.getOrCreateProfile(agentId);
    Object.assign(profile, data);
    return this.profileRepo.save(profile);
  }

  async incrementCompletedJobs(identity: string): Promise<void> {
    const profile = await this.resolveProfile(identity);
    if (!profile) return;
    profile.completedJobs = (profile.completedJobs || 0) + 1;
    await this.profileRepo.save(profile);
  }

  async addRating(identity: string, rating: number): Promise<void> {
    const profile = await this.resolveProfile(identity);
    if (!profile) return;
    const totalRatings   = (profile.totalRatings || 0) + 1;
    const averageRating  = ((profile.averageRating || 0) * profile.totalRatings + rating) / totalRatings;
    profile.totalRatings  = totalRatings;
    profile.averageRating = Math.round(averageRating * 100) / 100;
    await this.profileRepo.save(profile);
  }

  async updateProfileForUser(userId: string, data: Partial<WorkerProfile>): Promise<any> {
    const profile = await this.getOrCreateProfileForUser(userId);
    if (!profile) return null;
    Object.assign(profile, data);
    return this.profileRepo.save(profile);
  }

  async updateSkillsForUser(userId: string, skillIds: string[]): Promise<WorkerProfile | null> {
    const profile = await this.getOrCreateProfileForUser(userId);
    if (!profile) return null;
    profile.skills = await this.skillsService.findByIds(skillIds);
    return this.profileRepo.save(profile);
  }

  async updateSkills(agentId: string, skillIds: string[]): Promise<WorkerProfile> {
    const profile = await this.getOrCreateProfile(agentId);
    const skills  = await this.skillsService.findByIds(skillIds);
    profile.skills = skills;
    return this.profileRepo.save(profile);
  }

  // Find jobs matching worker's skills
  async getMatchingSkillIds(agentId: string): Promise<string[]> {
    const profile = await this.findByAgentId(agentId);
    return (profile?.skills || []).map(s => s.id);
  }

  private async resolveProfile(identity: string): Promise<WorkerProfile | null> {
    const byAgent = await this.findByAgentId(identity).catch(() => null);
    if (byAgent) return byAgent;
    return this.findByUserId(identity).catch(() => null);
  }

  async getLeaderboard(limit = 10): Promise<WorkerProfile[]> {
    return this.profileRepo.find({
      relations: ['skills', 'agent', 'agent.user'],
      order: { completedJobs: 'DESC', averageRating: 'DESC' },
      take: limit,
    });
  }
}
