import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Task, TaskStatus } from '../tasks/task.entity';
import { Agent } from '../agents/agent.entity';
import { User } from '../users/user.entity';
import { GpsLog } from '../gps/gps-log.entity';
import { Job, JobStatus } from '../jobs/job.entity';
import { JobApplication } from '../applications/job-application.entity';
import { WalletTransaction, TransactionType } from '../wallet/wallet.entity';
import { WorkerProfile } from '../workers/worker-profile.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Task)        private taskRepo: Repository<Task>,
    @InjectRepository(Agent)       private agentRepo: Repository<Agent>,
    @InjectRepository(User)        private userRepo: Repository<User>,
    @InjectRepository(GpsLog)      private gpsRepo: Repository<GpsLog>,
    @InjectRepository(Job)         private jobRepo: Repository<Job>,
    @InjectRepository(JobApplication) private appRepo: Repository<JobApplication>,
    @InjectRepository(WalletTransaction) private txRepo: Repository<WalletTransaction>,
    @InjectRepository(WorkerProfile) private profileRepo: Repository<WorkerProfile>,
  ) {}

  async resolveAgentId(userId: string): Promise<string | null> {
    const agent = await this.agentRepo.createQueryBuilder('a')
      .where('a.userId = :userId', { userId })
      .select(['a.id'])
      .getOne();
    return agent?.id || null;
  }

  private dateRange(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const end   = to   ? new Date(to)   : new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  // ── Task status report ────────────────────────────
  async taskReport(from?: string, to?: string, agentId?: string, orgId?: string) {
    const { start, end } = this.dateRange(from, to);
    const qb = this.taskRepo.createQueryBuilder('task')
      .where('task.createdAt BETWEEN :start AND :end', { start, end });

    if (agentId) qb.andWhere('task.agentId = :agentId', { agentId });

    const tasks = await qb.getMany();

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byAgent: Record<string, any> = {};

    tasks.forEach(t => {
      byStatus[t.status]     = (byStatus[t.status]     || 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
      if (t.agentId) {
        if (!byAgent[t.agentId]) byAgent[t.agentId] = { total: 0, completed: 0, failed: 0, pending: 0 };
        byAgent[t.agentId].total++;
        if (t.status === TaskStatus.COMPLETED)  byAgent[t.agentId].completed++;
        if (t.status === TaskStatus.FAILED)     byAgent[t.agentId].failed++;
        if (t.status === TaskStatus.PENDING)    byAgent[t.agentId].pending++;
      }
    });

    const total = tasks.length;
    const completed = tasks.filter(t => t.status === TaskStatus.COMPLETED).length;

    // Daily trend — group completed tasks by date
    const dailyMap: Record<string, { total: number; completed: number }> = {};
    tasks.forEach(t => {
      const day = t.createdAt.toISOString().slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { total: 0, completed: 0 };
      dailyMap[day].total++;
      if (t.status === TaskStatus.COMPLETED) dailyMap[day].completed++;
    });
    const dailyTrend = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return {
      period: { from: start, to: end },
      summary: { total, completed, completionRate: total ? Math.round(completed/total*100) : 0 },
      byStatus,
      byPriority,
      byAgent,
      dailyTrend,
    };
  }

  // ── Attendance / check-in report ─────────────────
  async attendanceReport(from?: string, to?: string, orgId?: string) {
    const { start, end } = this.dateRange(from, to);

    const agents = await this.agentRepo.find({
      relations: ['user'],
      where: { user: { isActive: true } },
    });

    const gpsLogs = await this.gpsRepo.find({
      where: { timestamp: Between(start, end) },
      order: { timestamp: 'ASC' },
    });

    // Group check-ins by agent by day
    const attendance: Record<string, any> = {};
    gpsLogs.forEach(log => {
      const day = log.timestamp.toISOString().split('T')[0];
      if (!attendance[log.agentId]) attendance[log.agentId] = {};
      if (!attendance[log.agentId][day]) attendance[log.agentId][day] = { pings: 0, firstSeen: log.timestamp, lastSeen: log.timestamp };
      attendance[log.agentId][day].pings++;
      if (log.timestamp > attendance[log.agentId][day].lastSeen) attendance[log.agentId][day].lastSeen = log.timestamp;
    });

    const result = agents.map(agent => {
      const agentDays = attendance[agent.id] || {};
      const daysPresent = Object.keys(agentDays).length;
      return {
        agentId:    agent.id,
        name:       agent.user?.name,
        phone:      agent.user?.phone,
        daysPresent,
        level:      agent.level,
        streak:     agent.currentStreak,
        dailyDetail: agentDays,
      };
    });

    return { period: { from: start, to: end }, attendance: result };
  }

  // ── Financial / payment report ────────────────────
  async financialReport(from?: string, to?: string, orgId?: string) {
    const { start, end } = this.dateRange(from, to);

    const txs = await this.txRepo.find({
      where: { createdAt: Between(start, end) },
      order: { createdAt: 'DESC' },
    });

    const totalPaid     = txs.filter(t => t.type === TransactionType.CREDIT).reduce((s, t) => s + Number(t.amount), 0);
    const totalWithdrawn = txs.filter(t => t.type === TransactionType.DEBIT).reduce((s, t) => s + Number(t.amount), 0);
    const pending        = txs.filter(t => t.type === TransactionType.PENDING).reduce((s, t) => s + Number(t.amount), 0);

    // Daily payment trend
    const dailyPayMap: Record<string, { credits: number; debits: number }> = {};
    txs.forEach(tx => {
      const day = tx.createdAt.toISOString().slice(0, 10);
      if (!dailyPayMap[day]) dailyPayMap[day] = { credits: 0, debits: 0 };
      if (tx.type === TransactionType.CREDIT) dailyPayMap[day].credits += Number(tx.amount);
      if (tx.type === TransactionType.DEBIT)  dailyPayMap[day].debits  += Number(tx.amount);
    });
    const paymentTrend = Object.entries(dailyPayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return {
      period:       { from: start, to: end },
      summary:      { totalPaid, totalWithdrawn, pending, netFlow: totalPaid - totalWithdrawn },
      transactions: txs,
      paymentTrend,
    };
  }

  // ── Login / access log report ─────────────────────
  async loginReport(from?: string, to?: string, orgId?: string) {
    const { start, end } = this.dateRange(from, to);

    const where: any = { lastLoginAt: Between(start, end) };
    if (orgId) where.organisationId = orgId;

    const users = await this.userRepo.find({
      where,
      order: { lastLoginAt: 'DESC' },
      select: ['id', 'name', 'phone', 'role', 'lastLoginAt', 'lastLoginIp', 'createdAt'],
    });

    const byRole: Record<string, number> = {};
    users.forEach(u => { byRole[u.role] = (byRole[u.role] || 0) + 1; });

    return {
      period:    { from: start, to: end },
      totalLogins: users.length,
      byRole,
      loginLogs: users.map(u => ({
        userId:    u.id,
        name:      u.name,
        phone:     u.phone,
        role:      u.role,
        loginAt:   u.lastLoginAt,
        ip:        u.lastLoginIp,
      })),
    };
  }

  // ── Agent performance report ──────────────────────
  async agentPerformanceReport(from?: string, to?: string, orgId?: string) {
    const { start, end } = this.dateRange(from, to);

    const qb = this.agentRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'user');
    if (orgId) qb.where('a.organisationId = :orgId', { orgId });
    const agents = await qb.getMany();

    // Batch-load all tasks for these agents in a single query (avoids N+1)
    const agentIds = agents.map(a => a.id);
    const allTasks = agentIds.length
      ? await this.taskRepo.find({ where: { agentId: In(agentIds) } })
      : [];
    const tasksByAgent = new Map<string, typeof allTasks>();
    for (const task of allTasks) {
      if (!tasksByAgent.has(task.agentId)) tasksByAgent.set(task.agentId, []);
      tasksByAgent.get(task.agentId)!.push(task);
    }

    const results = agents.map(agent => {
      const tasks     = tasksByAgent.get(agent.id) ?? [];
      const completed = tasks.filter(t => t.status === TaskStatus.COMPLETED).length;
      const total     = tasks.length;

      return {
        agentId:        agent.id,
        name:           agent.user?.name,
        phone:          agent.user?.phone,
        level:          agent.level,
        totalXp:        agent.totalXp,
        streak:         agent.currentStreak,
        tasksTotal:     total,
        tasksCompleted: completed,
        tasksFailed:    tasks.filter(t => t.status === TaskStatus.FAILED).length,
        completionRate: total ? Math.round(completed/total*100) : 0,
        averageRating:  agent.averageRating,
        completedJobs:  agent.completedJobs,
        isAvailable:    agent.isAvailable,
      };
    });

    results.sort((a, b) => b.completionRate - a.completionRate);
    return { period: { from: start, to: end }, agents: results };
  }

  // ── Dashboard summary (all key numbers) ──────────
  async dashboardSummary() {
    const [totalAgents, totalTasks, completedTasks, openJobs, totalUsers] = await Promise.all([
      this.agentRepo.count(),
      this.taskRepo.count(),
      this.taskRepo.count({ where: { status: TaskStatus.COMPLETED } }),
      this.jobRepo.count({ where: { status: JobStatus.OPEN } }),
      this.userRepo.count({ where: { isActive: true } }),
    ]);

    const activeAgents = await this.agentRepo.count({ where: { status: 'checked_in' as any } });

    return {
      totalAgents, activeAgents, totalTasks, completedTasks, openJobs, totalUsers,
      completionRate: totalTasks ? Math.round(completedTasks/totalTasks*100) : 0,
    };
  }

  // ── System usage / traffic ───────────────────────
  async systemUsageReport(period: 'hourly'|'daily'|'monthly' = 'daily') {
    // Login traffic analysis from lastLoginAt field
    const users = await this.userRepo.find({ select: ['id','role','lastLoginAt','organisationId','createdAt'] });
    const now   = new Date();

    if (period === 'hourly') {
      // Last 24h by hour
      const buckets: Record<string, number> = {};
      for (let h = 0; h < 24; h++) {
        const label = `${h.toString().padStart(2,'0')}:00`;
        buckets[label] = 0;
      }
      for (const u of users) {
        if (!u.lastLoginAt) continue;
        const d = new Date(u.lastLoginAt);
        if (now.getTime() - d.getTime() < 86400000) {
          const label = `${d.getHours().toString().padStart(2,'0')}:00`;
          buckets[label] = (buckets[label] || 0) + 1;
        }
      }
      return { period: 'hourly', buckets, totalLogins: Object.values(buckets).reduce((a,b)=>a+b,0) };
    }

    if (period === 'daily') {
      const buckets: Record<string, number> = {};
      for (const u of users) {
        if (!u.lastLoginAt) continue;
        const d = new Date(u.lastLoginAt);
        const label = d.toISOString().slice(0,10);
        if (now.getTime() - d.getTime() < 30 * 86400000)
          buckets[label] = (buckets[label] || 0) + 1;
      }
      return { period: 'daily', buckets, totalLogins: Object.values(buckets).reduce((a,b)=>a+b,0) };
    }

    // Monthly — last 12 months
    const buckets: Record<string, number> = {};
    for (const u of users) {
      if (!u.lastLoginAt) continue;
      const d = new Date(u.lastLoginAt);
      const label = d.toISOString().slice(0,7);
      if (now.getTime() - d.getTime() < 365 * 86400000)
        buckets[label] = (buckets[label] || 0) + 1;
    }
    return { period: 'monthly', buckets, totalLogins: Object.values(buckets).reduce((a,b)=>a+b,0) };
  }

  // Platform-wide overview for super admin
  async systemOverviewReport() {
    const [users, tasks, agents] = await Promise.all([
      this.userRepo.count(),
      this.taskRepo.count(),
      this.agentRepo.count(),
    ]);
    const activeUsers    = await this.userRepo.count({ where: { isActive: true } });
    const completedTasks = await this.taskRepo.count({ where: { status: 'completed' as any } });
    const registeredToday = await this.userRepo.createQueryBuilder('u')
      .where('u.createdAt >= :since', { since: new Date(new Date().setHours(0,0,0,0)) })
      .getCount();

    const byRole: Record<string,number> = {};
    const roleStats = await this.userRepo.createQueryBuilder('u')
      .select('u.role', 'role').addSelect('COUNT(*)', 'count')
      .groupBy('u.role').getRawMany();
    for (const r of roleStats) byRole[r.role] = Number(r.count);

    return {
      users: { total: users, active: activeUsers, registeredToday },
      tasks: { total: tasks, completed: completedTasks, rate: tasks > 0 ? Math.round(completedTasks/tasks*100) : 0 },
      agents: { total: agents },
      byRole,
    };
  }

  // Compare KPIs across orgs
  async orgComparisonReport() {
    const agents = await this.agentRepo.find({ relations: ['user'] });
    const tasks  = await this.taskRepo.find();
    const users  = await this.userRepo.find({ select: ['id','name','organisationId'] });

    const orgMap: Record<string, any> = {};
    for (const u of users) {
      if (!u.organisationId) continue;
      if (!orgMap[u.organisationId]) orgMap[u.organisationId] = { orgId: u.organisationId, members:0, agents:0, tasks:0, completedTasks:0 };
      orgMap[u.organisationId].members++;
    }
    for (const a of agents) {
      if (!a.organisationId) continue;
      if (!orgMap[a.organisationId]) orgMap[a.organisationId] = { orgId: a.organisationId, members:0, agents:0, tasks:0, completedTasks:0 };
      orgMap[a.organisationId].agents++;
    }
    for (const t of tasks) {
      // Tasks don't directly have orgId — we link via agent
      const agent = agents.find(a => a.id === t.agentId);
      if (!agent?.organisationId) continue;
      if (!orgMap[agent.organisationId]) continue;
      orgMap[agent.organisationId].tasks++;
      if (t.status === 'completed') orgMap[agent.organisationId].completedTasks++;
    }
    return Object.values(orgMap).map(o => ({
      ...o,
      completionRate: o.tasks > 0 ? Math.round(o.completedTasks/o.tasks*100) : 0,
    }));
  }

  // Worker pipeline: registration → profile → application → hired
  async workerPipelineReport(orgId?: string) {
    const workerCount = await this.userRepo.createQueryBuilder('u')
      .where('u.role IN (:...roles)', { roles: ['worker','agent'] })
      .getCount();
    const withProfile = await this.profileRepo.createQueryBuilder('p')
      .where('p.bio IS NOT NULL AND p.bio != :empty', { empty: '' })
      .getCount();
    const applications = await this.appRepo.count();
    const hired = await this.agentRepo.createQueryBuilder('a')
      .where('a.organisationId IS NOT NULL')
      .getCount();
    return { workerCount, applications, hired, conversionRate: workerCount > 0 ? Math.round(hired/workerCount*100) : 0 };
  }

  // ── Agent self-performance report ────────────────
  async myPerformanceReport(agentId: string) {
    const agent = await this.agentRepo.findOne({ where: { id: agentId }, relations: ['user'] });
    if (!agent) return null;

    const allTasks  = await this.taskRepo.find({ where: { agentId } });
    const now       = new Date();
    const weekStart = new Date(now.getTime() - 7  * 86400000);
    const monthStart= new Date(now.getTime() - 30 * 86400000);

    const thisWeek  = allTasks.filter(t => new Date(t.createdAt) >= weekStart);
    const thisMonth = allTasks.filter(t => new Date(t.createdAt) >= monthStart);

    const completed      = allTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
    const weekCompleted  = thisWeek.filter(t => t.status === TaskStatus.COMPLETED).length;
    const monthCompleted = thisMonth.filter(t => t.status === TaskStatus.COMPLETED).length;

    // Daily trend (last 30 days)
    const dailyMap: Record<string, { total: number; completed: number }> = {};
    allTasks.filter(t => new Date(t.createdAt) >= monthStart).forEach(t => {
      const day = new Date(t.createdAt).toISOString().slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { total: 0, completed: 0 };
      dailyMap[day].total++;
      if (t.status === TaskStatus.COMPLETED) dailyMap[day].completed++;
    });
    const dailyTrend = Object.entries(dailyMap)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    // GPS / attendance summary
    const gpsCount = await this.gpsRepo.createQueryBuilder('g')
      .where('g.agentId = :id', { id: agentId })
      .andWhere('g.createdAt >= :since', { since: monthStart })
      .getCount();

    const uniqueDays = await this.gpsRepo.createQueryBuilder('g')
      .select(`DATE(g.createdAt)`, 'day')
      .where('g.agentId = :id', { id: agentId })
      .andWhere('g.createdAt >= :since', { since: monthStart })
      .groupBy('day')
      .getRawMany();

    return {
      agentId: agent.id,
      name:    agent.user?.name,
      level:   agent.level,
      totalXp: agent.totalXp,
      streak:  agent.currentStreak,
      rating:  agent.averageRating,
      tasks: {
        total: allTasks.length,
        completed,
        completionRate: allTasks.length > 0 ? Math.round(completed / allTasks.length * 100) : 0,
        thisWeek:   { total: thisWeek.length,  completed: weekCompleted },
        thisMonth:  { total: thisMonth.length, completed: monthCompleted },
        dailyTrend,
      },
      attendance: {
        gpsLogsThisMonth: gpsCount,
        activeDaysThisMonth: uniqueDays.length,
      },
    };
  }

  // ── GPS analytics report (supervisor / admin) ─────
  async gpsAnalyticsReport(orgId?: string, from?: string, to?: string) {
    const { start, end } = this.dateRange(from, to);

    const agentQb = this.agentRepo.createQueryBuilder('a').leftJoinAndSelect('a.user', 'u');
    if (orgId) agentQb.where('a.organisationId = :orgId', { orgId });
    const agents = await agentQb.getMany();
    const agentIds = agents.map(a => a.id);

    if (!agentIds.length) return { period: { from: start, to: end }, agents: [] };

    const gpsQb = this.gpsRepo.createQueryBuilder('g')
      .where('g.agentId IN (:...ids)', { ids: agentIds })
      .andWhere('g.createdAt BETWEEN :start AND :end', { start, end });

    const allLogs = await gpsQb.getMany();

    const result = agents.map(agent => {
      const logs = allLogs.filter(l => l.agentId === agent.id);
      const flagged  = logs.filter(l => l.isFlagged).length;
      const uniqueDaysSet = new Set(logs.map(l => new Date(l.timestamp).toISOString().slice(0,10)));
      const avgSpeed = logs.length ? logs.reduce((s, l) => s + Number(l.speed || 0), 0) / logs.length : 0;
      const maxSpeed = logs.reduce((m, l) => Math.max(m, Number(l.speed || 0)), 0);

      return {
        agentId:    agent.id,
        name:       agent.user?.name,
        totalPings: logs.length,
        activeDays: uniqueDaysSet.size,
        flaggedPings: flagged,
        avgSpeed:   Math.round(avgSpeed * 10) / 10,
        maxSpeed:   Math.round(maxSpeed * 10) / 10,
        lastSeen:   agent.lastSeenAt,
        status:     agent.status,
      };
    });

    const anomalies = allLogs.filter(l => l.isFlagged);

    return {
      period:    { from: start, to: end },
      agents:    result.sort((a, b) => b.totalPings - a.totalPings),
      totalPings: allLogs.length,
      anomalies,
    };
  }

  // ── Jobs analytics report (employer / admin) ──────
  async jobsAnalyticsReport(postedById?: string, orgId?: string, from?: string, to?: string) {
    const { start, end } = this.dateRange(from, to);

    const apps = await this.appRepo.createQueryBuilder('app')
      .where('app.appliedAt BETWEEN :start AND :end', { start, end })
      .getMany();

    // Load job titles separately to avoid join issues
    const jobIds = [...new Set(apps.map(a => a.jobId).filter(Boolean))];
    const jobTitles: Record<string, string> = {};
    if (jobIds.length) {
      const jobs = await this.jobRepo.findBy({ id: In(jobIds) });
      jobs.forEach(j => { jobTitles[j.id] = j.title; });
    }

    const byStatus: Record<string,number> = {};
    const byJob: Record<string, { title: string; total: number; shortlisted: number; hired: number }> = {};

    for (const app of apps) {
      byStatus[app.status] = (byStatus[app.status] || 0) + 1;
      const jobId = app.jobId;
      if (!byJob[jobId]) byJob[jobId] = { title: (app as any).job?.title || jobId, total: 0, shortlisted: 0, hired: 0 };
      byJob[jobId].total++;
      if (app.status === 'shortlisted') byJob[jobId].shortlisted++;
      if (app.status === 'accepted')    byJob[jobId].hired++;
    }

    const funnel = [
      { stage: 'Applied',     count: apps.length },
      { stage: 'Shortlisted', count: apps.filter(a => ['shortlisted','accepted'].includes(a.status)).length },
      { stage: 'Hired',       count: apps.filter(a => a.status === 'accepted').length },
    ];

    return {
      period:  { from: start, to: end },
      total:   apps.length,
      byStatus,
      byJob:   Object.values(byJob),
      funnel,
    };
  }

  // ── Compliance / KYC report (admin / super_admin) ─
  async complianceReport(orgId?: string) {
    const verifications = await this.profileRepo.createQueryBuilder('p')
      .select(['p.id','p.isVerified','p.createdAt'])
      .getMany();

    const verified   = verifications.filter(v => v.isVerified).length;
    const unverified = verifications.length - verified;

    // Flagged GPS (potential fraud)
    const flaggedGps = await this.gpsRepo.createQueryBuilder('g')
      .where('g.isFlagged = true')
      .getCount();

    return {
      verifications: { total: verifications.length, verified, unverified },
      fraud: { flaggedGpsLogs: flaggedGps },
    };
  }

  // ── Platform financial report (super_admin) ───────
  async platformFinancialReport() {
    const allTx = await this.txRepo.find({ order: { createdAt: 'DESC' } });

    const monthlyMap: Record<string, { credits: number; debits: number }> = {};
    allTx.forEach(tx => {
      const month = new Date(tx.createdAt).toISOString().slice(0, 7);
      if (!monthlyMap[month]) monthlyMap[month] = { credits: 0, debits: 0 };
      if (tx.type === TransactionType.CREDIT) monthlyMap[month].credits += Number(tx.amount);
      if (tx.type === TransactionType.DEBIT)  monthlyMap[month].debits  += Number(tx.amount);
    });

    const monthlyTrend = Object.entries(monthlyMap)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));

    const totalCredits  = allTx.filter(t => t.type === TransactionType.CREDIT).reduce((s, t) => s + Number(t.amount), 0);
    const totalDebits   = allTx.filter(t => t.type === TransactionType.DEBIT).reduce((s, t) => s + Number(t.amount), 0);

    return {
      summary: { totalCredits, totalDebits, netFlow: totalCredits - totalDebits },
      monthlyTrend,
    };
  }

  // ── Org-scoped helpers ───────────────────────────
  async summary(orgId?: string) {
    const agentQb = this.agentRepo.createQueryBuilder('a').leftJoin('a.user','u');
    const taskQb  = this.taskRepo.createQueryBuilder('t');
    if (orgId) { agentQb.where('a.organisationId = :o', {o:orgId}); }

    const [totalAgents, activeTasks, totalTasks] = await Promise.all([
      agentQb.getCount(),
      taskQb.where('t.status = :s', {s:'in_progress'}).getCount(),
      taskQb.getCount(),
    ]);
    const completedTasks = await this.taskRepo.count({ where: { status: 'completed' as any } });
    return {
      totalAgents,
      activeAgents: 0,
      activeTasks,
      totalTasks,
      completionRate: totalTasks > 0 ? Math.round(completedTasks/totalTasks*100) : 0,
    };
  }
}
