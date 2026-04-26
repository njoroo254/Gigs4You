import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from '../jobs/job.entity';
import { WorkerProfile } from '../workers/worker-profile.entity';
import { Agent } from '../agents/agent.entity';
import { AiService } from '../ai/ai.service';

export interface MatchScore {
  agentId:       string;
  userId:        string;
  name:          string;
  score:         number;          // 0-100
  breakdown:     MatchBreakdown;
  estimatedTime: number | null;   // minutes to complete, null if unknown
  available:     boolean;
}

interface MatchBreakdown {
  skillMatch:    number;  // 0-40 pts
  locationMatch: number;  // 0-25 pts
  performance:   number;  // 0-20 pts — avg rating × completedJobs
  availability:  number;  // 0-10 pts
  streak:        number;  // 0-5 pts
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    @InjectRepository(Job)           private jobRepo:     Repository<Job>,
    @InjectRepository(WorkerProfile) private profileRepo: Repository<WorkerProfile>,
    @InjectRepository(Agent)         private agentRepo:   Repository<Agent>,
    private readonly aiService: AiService,
  ) {}

  // ── Recommend best agents for a job ───────────────────────────────
  async recommendForJob(jobId: string, limit = 10): Promise<MatchScore[]> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId },
      relations: ['requiredSkills'],
    });
    if (!job) return [];

    try {
      // Try AI-powered matching first
      const aiMatches = await this.recommendForJobWithAI(job, limit);
      if (aiMatches && aiMatches.length > 0) {
        this.logger.log(`AI-powered matching successful for job ${jobId}`);
        return aiMatches;
      }
    } catch (error) {
      this.logger.warn(`AI matching failed for job ${jobId}, falling back to heuristic: ${(error as Error).message}`);
    }

    // Fallback to heuristic matching
    return this.recommendForJobHeuristic(job, limit);
  }

  // ── AI-powered job recommendation ───────────────────────────────
  private async recommendForJobWithAI(job: Job, limit: number): Promise<MatchScore[]> {
    const requiredSkillIds = (job.requiredSkills || []).map(s => s.id);
    const requiredSkillNames = (job.requiredSkills || []).map(s => s.name.toLowerCase());

    // Get available worker profiles with full context
    const profiles = await this.profileRepo.find({
      where: { isAvailable: true },
      relations: ['skills', 'agent', 'agent.user'],
      take: 500,
    });

    const workerPool = profiles
      .filter(p => p.agent?.isConfirmed)
      .map(profile => ({
        id: profile.agentId,
        userId: profile.userId,
        name: profile.agent?.user?.name || 'Unknown',
        skills: (profile.skills || []).map(s => ({ id: s.id, name: s.name })),
        location: profile.county,
        rating: profile.averageRating || 0,
        completedJobs: profile.completedJobs || 0,
        currentStreak: profile.agent?.currentStreak || 0,
        level: profile.agent?.level || 1,
        available: profile.isAvailable,
      }));

    const constraints = {
      required_skills: requiredSkillNames,
      location: job.county,
      category: job.category,
      urgency: job.isUrgent ? 'high' : 'normal',
    };

    const aiResult = await this.aiService.matchJobToWorkers(job.id, workerPool, constraints);

    // Convert AI results to MatchScore format
    return aiResult.matches.slice(0, limit).map(match => {
      const profile = profiles.find(p => p.agentId === match.worker_id);
      if (!profile) return null;

      // Create breakdown from AI reasoning (simplified)
      const breakdown = this.parseAIReasoning(match.reasoning);

      return {
        agentId: match.worker_id,
        userId: profile.userId,
        name: profile.agent?.user?.name || 'Unknown',
        score: Math.round(match.score),
        breakdown,
        estimatedTime: null, // Could be enhanced with AI prediction
        available: profile.isAvailable,
      };
    }).filter(Boolean) as MatchScore[];
  }

  // ── Heuristic job recommendation (fallback) ──────────────────────
  private async recommendForJobHeuristic(job: Job, limit: number): Promise<MatchScore[]> {
    const requiredSkillIds = (job.requiredSkills || []).map(s => s.id);
    const requiredSkillNames = (job.requiredSkills || []).map(s => s.name.toLowerCase());

    // Get all available profiles in the same county/location
    const profiles = await this.profileRepo.find({
      where: { isAvailable: true },
      relations: ['skills', 'agent', 'agent.user'],
      take: 500,
    });

    const scores = profiles
      .filter(p => p.agent?.isConfirmed)
      .map(p => this.scoreCandidate(p, requiredSkillIds, requiredSkillNames, job))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scores;
  }

  // ── Recommend jobs for a worker ────────────────────────────────────
  async recommendJobsForWorker(userId: string, limit = 10): Promise<any[]> {
    const profile = await this.profileRepo.findOne({
      where: { userId },
      relations: ['skills'],
    }) || await this.profileRepo
      .createQueryBuilder('wp')
      .leftJoinAndSelect('wp.skills', 'skills')
      .leftJoinAndSelect('wp.agent', 'agent')
      .leftJoinAndSelect('agent.user', 'user')
      .where('user.id = :userId', { userId })
      .getOne();

    if (!profile) return [];

    const workerSkillIds   = (profile.skills || []).map(s => s.id);
    const workerSkillNames = (profile.skills || []).map(s => s.name.toLowerCase());
    const workerCounty     = profile.county?.toLowerCase();

    const jobs = await this.jobRepo
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.requiredSkills', 'skills')
      .where('job.status = :status', { status: 'open' })
      .take(200)
      .getMany();

    return jobs
      .map(job => {
        const jobSkillIds   = (job.requiredSkills || []).map(s => s.id);
        const jobSkillNames = (job.requiredSkills || []).map(s => s.name.toLowerCase());
        const skillOverlap  = workerSkillIds.filter(id => jobSkillIds.includes(id)).length;
        const nameOverlap   = workerSkillNames.filter(n => jobSkillNames.some(jn => jn.includes(n) || n.includes(jn))).length;
        const totalMatch    = Math.max(skillOverlap, nameOverlap);
        const locationMatch = workerCounty && job.county?.toLowerCase() === workerCounty ? 20 : 0;
        const score         = Math.min(100, totalMatch * 25 + locationMatch);
        return { job, score, skillMatchCount: totalMatch };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => ({
        ...r.job,
        matchScore:      r.score,
        skillMatchCount: r.skillMatchCount,
        isRecommended:   r.score >= 50,
      }));
  }

  // ── Predict job completion time ────────────────────────────────────
  async predictCompletionTime(jobId: string, agentId?: string): Promise<{
    estimatedMinutes: number;
    confidence: 'high' | 'medium' | 'low';
    basis: string;
  }> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) return { estimatedMinutes: 60, confidence: 'low', basis: 'default' };

    // Simple heuristic model — in production replace with ML inference
    const categoryBaseTimes: Record<string, number> = {
      sales:        45,
      technician:   120,
      logistics:    30,
      finance:      60,
      research:     90,
      merchandising:40,
      general:      60,
    };

    let estimatedMinutes = categoryBaseTimes[job.category] || 60;
    let confidence: 'high'|'medium'|'low' = 'low';
    let basis = 'category average';

    if (agentId) {
      const profile = await this.profileRepo.findOne({ where: { agentId } });
      if (profile && profile.completedJobs > 5) {
        // Agents with more experience tend to be faster — simple factor
        const speedFactor = Math.max(0.7, 1 - (profile.completedJobs * 0.005));
        estimatedMinutes  = Math.round(estimatedMinutes * speedFactor);
        confidence        = profile.completedJobs > 20 ? 'high' : 'medium';
        basis             = `agent history (${profile.completedJobs} jobs)`;
      }
    }

    return { estimatedMinutes, confidence, basis };
  }

  // ── Agent efficiency analytics ─────────────────────────────────────
  async agentEfficiencyReport(orgId?: string): Promise<any[]> {
    const qb = this.agentRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'user');
    if (orgId) qb.where('a.organisationId = :orgId', { orgId });
    const agents = await qb.take(100).getMany();

    return agents.map(a => ({
      agentId:       a.id,
      name:          a.user?.name,
      level:         a.level,
      completedJobs: a.completedJobs,
      averageRating: a.averageRating,
      currentStreak: a.currentStreak,
      totalXp:       a.totalXp,
      efficiencyScore: this.calcEfficiency(a),
    })).sort((a, b) => b.efficiencyScore - a.efficiencyScore);
  }

  private calcEfficiency(agent: Agent): number {
    const ratingScore   = (agent.averageRating || 0) * 20;      // 0-100
    const volumeScore   = Math.min(30, (agent.completedJobs || 0) * 0.5);
    const streakScore   = Math.min(20, (agent.currentStreak || 0) * 2);
    const levelScore    = Math.min(30, (agent.level || 1) * 3);
    return Math.round(ratingScore * 0.4 + volumeScore * 0.3 + streakScore * 0.15 + levelScore * 0.15);
  }

  private parseAIReasoning(reasoning: string): MatchBreakdown {
    // Simple parser: if AI provides some numerical reasoning, map it; otherwise use defaults.
    const lower = reasoning?.toLowerCase() || '';

    const numeric = (key: string, max: number) => {
      const m = lower.match(new RegExp(`${key}[:=?]\\s*(\\d{1,2})`, 'i'));
      if (m && Number(m[1]) >= 0) return Math.min(max, Math.max(0, Number(m[1])));
      return Math.round(max / 2);
    };

    return {
      skillMatch: numeric('skill', 40),
      locationMatch: numeric('location', 25),
      performance: numeric('performance', 20),
      availability: numeric('availability', 10),
      streak: numeric('streak', 5),
    };
  }

  private scoreCandidate(
    profile:   WorkerProfile,
    requiredSkillIds: string[],
    requiredSkillNames: string[],
    job: Job,
  ): MatchScore {
    const workerSkills     = profile.skills || [];
    const workerSkillIds   = workerSkills.map(s => s.id);
    const workerSkillNames = workerSkills.map(s => s.name.toLowerCase());

    // Skill match (0-40)
    const idMatches   = workerSkillIds.filter(id => requiredSkillIds.includes(id)).length;
    const nameMatches = workerSkillNames.filter(n => requiredSkillNames.some(r => r.includes(n) || n.includes(r))).length;
    const overlap     = Math.max(idMatches, nameMatches);
    const skillMax    = Math.max(requiredSkillIds.length, 1);
    const skillMatch  = Math.round(Math.min(40, (overlap / skillMax) * 40));

    // Location match (0-25)
    const workerCounty = (profile.county || '').toLowerCase();
    const jobCounty    = (job.county || '').toLowerCase();
    const jobLoc       = (job.location || '').toLowerCase();
    const locationMatch = (workerCounty && jobCounty && workerCounty === jobCounty)
      ? 25
      : (workerCounty && jobLoc.includes(workerCounty) ? 15 : 0);

    // Performance (0-20)
    const rating      = Number(profile.averageRating) || 0;
    const jobs        = profile.completedJobs || 0;
    const performance = Math.round(Math.min(20, rating * 3 + Math.min(5, jobs * 0.1)));

    // Availability (0-10)
    const availability = profile.isAvailable ? 10 : 0;

    // Streak (0-5)
    const streak  = Math.min(5, (profile.agent?.currentStreak || 0));

    const total = skillMatch + locationMatch + performance + availability + streak;

    return {
      agentId:       profile.agentId || '',
      userId:        profile.userId  || profile.agent?.user?.id || '',
      name:          profile.agent?.user?.name || 'Unknown',
      score:         total,
      breakdown:     { skillMatch, locationMatch, performance, availability, streak },
      estimatedTime: null,
      available:     profile.isAvailable,
    };
  }
}
