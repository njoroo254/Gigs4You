import {
  Injectable, NotFoundException, ForbiddenException, Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task, TaskStatus, TaskPriority, ChecklistItem } from './task.entity';
import { AgentsService } from '../agents/agents.service';
import { PushService } from '../push/push.service';
import { NotificationService } from '../notifications-gateway/notification.service';
import { WalletService } from '../wallet/wallet.service';
import { AiService } from '../ai/ai.service';
import { MatchingLearningService } from '../agents/matching-learning.service';
import { AuditService } from '../audit/audit.service';

export interface CreateTaskDto {
  title:                  string;
  description?:           string;
  priority?:              TaskPriority;
  latitude?:              number;
  longitude?:             number;
  locationName?:          string;
  dueAt?:                 string;
  xpReward?:              number;
  agentId?:               string;
  requiresPhoto?:         boolean;
  requiresSignature?:     boolean;
  checklist?:             Array<{
    label:              string;
    required?:          boolean;
    requiresPhoto?:     boolean;
    requiredPhotoCount?: number;
  }>;
  acceptanceWindowMinutes?: number;
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepo: Repository<Task>,
    private agentsService: AgentsService,
    private walletService: WalletService,
    @Optional() private pushService: PushService,
    @Optional() private notificationService: NotificationService,
    @Optional() private aiService: AiService,
    @Optional() private matchingLearning: MatchingLearningService,
    @Optional() private auditService: AuditService,
  ) {}

  // ── Helpers ──────────────────────────────────────
  private async resolveAgentId(userId: string): Promise<string | null> {
    const agent = await this.agentsService.findByUserId(userId);
    return agent?.id || null;
  }

  private buildChecklist(items: Array<{
    label: string; required?: boolean;
    requiresPhoto?: boolean; requiredPhotoCount?: number;
  }>): ChecklistItem[] {
    return items.map((item, i) => ({
      id:                 `ci_${i}_${Date.now()}`,
      label:              item.label,
      required:           item.required ?? false,
      requiresPhoto:      item.requiresPhoto ?? false,
      requiredPhotoCount: item.requiredPhotoCount ?? 1,
      checked:            false,
      checkedAt:          null,
      photoUrls:          [],
    }));
  }

  // ── Completion likelihood scoring ─────────────────
  // Returns 0–1 probability estimate based on agent's history, streak, proximity and availability.
  private async scoreAgentForTask(agentId: string, taskLat?: number, taskLng?: number): Promise<number> {
    try {
      const agent = await this.agentsService.findById(agentId).catch(() => null);
      if (!agent) return 0.5; // unknown agent → neutral

      // Completion history (0–0.40): caps at 50 completed jobs = full score
      const historyScore = Math.min(agent.completedJobs ?? 0, 50) / 50 * 0.40;

      // Streak (0–0.20): caps at 30-day streak
      const streakScore = Math.min(agent.currentStreak ?? 0, 30) / 30 * 0.20;

      // Availability (0–0.20)
      const availScore = agent.isAvailable ? 0.20 : 0;

      // Proximity (0–0.20): 0 km → 0.20, ≥10 km → 0
      let proximityScore = 0.10; // default when no coordinates
      if (taskLat && taskLng && agent.lastLatitude && agent.lastLongitude) {
        const R = 6371;
        const dLat = (taskLat - Number(agent.lastLatitude)) * Math.PI / 180;
        const dLng = (taskLng - Number(agent.lastLongitude)) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(Number(agent.lastLatitude)*Math.PI/180) *
                  Math.cos(taskLat*Math.PI/180) * Math.sin(dLng/2)**2;
        const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        proximityScore = Math.max(0, (10 - distKm) / 10) * 0.20;
      }

      const raw = historyScore + streakScore + availScore + proximityScore;
      // Apply learning-loop calibration if available (bounded to [0, 1])
      const calibration = this.matchingLearning?.getCalibration(agentId) ?? 1.0;
      return Math.min(1, Math.round(raw * calibration * 1000) / 1000);
    } catch {
      return 0.5;
    }
  }

  // ── Create ───────────────────────────────────────
  async create(dto: CreateTaskDto, assignedBy: string, organisationId?: string): Promise<Task> {
    const windowMin = dto.acceptanceWindowMinutes ?? 120;
    const deadline  = new Date();
    deadline.setMinutes(deadline.getMinutes() + windowMin);

    // ── Auto-assignment: find best available agent when none specified ──────────
    let resolvedAgentId = dto.agentId;
    if (!resolvedAgentId && organisationId) {
      try {
        const candidates = await this.agentsService.findFieldStaff(organisationId);
        const available  = candidates.filter(a => a.isAvailable);
        if (available.length) {
          // Score each candidate and pick the best
          const scored = await Promise.all(
            available.map(async a => ({
              agentId: a.id,
              score:   await this.scoreAgentForTask(a.id, dto.latitude, dto.longitude),
            })),
          );
          scored.sort((x, y) => y.score - x.score);
          // Only auto-assign if the best candidate has a meaningful score
          if (scored[0].score >= 0.30) resolvedAgentId = scored[0].agentId;
        }
      } catch (_) { /* auto-assignment failure must not block task creation */ }
    }

    // Compute AI completion likelihood before saving (non-blocking if agent not found)
    const aiCompletionScore = resolvedAgentId
      ? await this.scoreAgentForTask(resolvedAgentId, dto.latitude, dto.longitude)
      : undefined;

    const task = this.tasksRepo.create({
      title:           dto.title,
      description:     dto.description,
      priority:        dto.priority || TaskPriority.MEDIUM,
      latitude:        dto.latitude,
      longitude:       dto.longitude,
      locationName:    dto.locationName,
      dueAt:           dto.dueAt ? new Date(dto.dueAt) : undefined,
      xpReward:        dto.xpReward ?? 50,
      agentId:         resolvedAgentId,
      assignedBy,
      organisationId,
      requiresPhoto:       dto.requiresPhoto    ?? false,
      requiresSignature:   dto.requiresSignature ?? false,
      checklist:           dto.checklist?.length ? this.buildChecklist(dto.checklist) : [],
      acceptanceStatus:    'pending',
      acceptanceWindowMinutes: windowMin,
      acceptanceDeadline: deadline,
      aiCompletionScore,
      status: TaskStatus.PENDING,
    });

    const saved = await this.tasksRepo.save(task);

    // Audit: task created
    this.auditService?.record({
      userId:   assignedBy,
      orgId:    organisationId,
      action:   'TASK_CREATED',
      entity:   'Task',
      entityId: saved.id,
      details:  { title: saved.title, agentId: resolvedAgentId, priority: saved.priority },
    }).catch(() => {});

    // Fire-and-forget: notify agent of assignment
    if (resolvedAgentId) {
      setImmediate(async () => {
        try {
          const agent = await this.agentsService.findById(resolvedAgentId!).catch(() => null);
          const userId = agent?.user?.id;
          if (userId) {
            await this.pushService?.notifyTaskAssigned(userId, saved.title, saved.id);
            if (agent?.user) {
              await this.notificationService?.notifyTaskAssigned({
                phone:     agent.user.phone,
                email:     agent.user.email,
                name:      agent.user.name,
                taskTitle: saved.title,
              });
            }
          }
        } catch (_) { /* never crash task creation */ }
      });
    }
    return saved;
  }

  // ── List ─────────────────────────────────────────
  async findAll(filters: {
    status?:          string;
    agentId?:         string;
    userId?:          string;
    priority?:        string;
    organisationId?:  string;
  } = {}): Promise<Task[]> {
    const qb = this.tasksRepo.createQueryBuilder('task')
      .orderBy('task.createdAt', 'DESC');

    if (filters.status) qb.andWhere('task.status = :s', { s: filters.status });
    if (filters.priority) qb.andWhere('task.priority = :p', { p: filters.priority });
    if (filters.organisationId) qb.andWhere('task.organisationId = :orgId', { orgId: filters.organisationId });

    if (filters.userId) {
      const agentId = await this.resolveAgentId(filters.userId);
      if (agentId) qb.andWhere('task.agentId = :a', { a: agentId });
      else return [];
    } else if (filters.agentId) {
      qb.andWhere('task.agentId = :a', { a: filters.agentId });
    }

    return qb.getMany();
  }

  // ── Aliases used by tasks.controller ────────────
  async findAllForAgent(agentId: string): Promise<Task[]> {
    return this.findAll({ agentId });
  }

  async findTodayForAgent(agentId: string): Promise<Task[]> {
    // Return active/pending tasks for the agent (no strict date filter)
    return this.findAll({ agentId });
  }

  async findById(id: string): Promise<Task> {
    const task = await this.tasksRepo.findOne({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async getStats(filters: { userId?: string; organisationId?: string } = {}): Promise<any> {
    let agentId: string | null = null;
    if (filters.userId) agentId = await this.resolveAgentId(filters.userId);

    const where: any = {};
    if (agentId) {
      where.agentId = agentId;
    } else if (filters.organisationId) {
      where.organisationId = filters.organisationId;
    }

    const [total, completed, failed, inProgress] = await Promise.all([
      this.tasksRepo.count({ where }),
      this.tasksRepo.count({ where: { ...where, status: TaskStatus.COMPLETED } }),
      this.tasksRepo.count({ where: { ...where, status: TaskStatus.FAILED } }),
      this.tasksRepo.count({ where: { ...where, status: TaskStatus.IN_PROGRESS } }),
    ]);

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, failed, inProgress, pending: total - completed - failed - inProgress, completionRate };
  }

  // ── Update ───────────────────────────────────────
  async update(id: string, data: Partial<Task>): Promise<Task> {
    await this.tasksRepo.update(id, data as any);
    return this.findById(id);
  }

  // ── Acceptance ───────────────────────────────────
  async acceptTask(taskId: string, userId: string): Promise<Task> {
    const task    = await this.findById(taskId);
    const agentId = await this.resolveAgentId(userId);
    if (agentId && task.agentId && task.agentId !== agentId)
      throw new ForbiddenException('Not your task');

    task.acceptanceStatus = 'accepted';
    task.acceptedAt       = new Date();
    return this.tasksRepo.save(task);
  }

  async declineTask(taskId: string, _userId: string, reason?: string): Promise<Task> {
    const task = await this.findById(taskId);
    task.acceptanceStatus = 'declined';
    task.declineReason    = reason || 'Declined by agent';
    task.status           = TaskStatus.CANCELLED;
    return this.tasksRepo.save(task);
  }

  async checkOverdueAcceptances(): Promise<Task[]> {
    const overdue = await this.tasksRepo
      .createQueryBuilder('task')
      .where('task.acceptanceStatus = :s', { s: 'pending' })
      .andWhere('task.acceptanceDeadline < :now', { now: new Date() })
      .andWhere('task.acceptanceOverdue = false')
      .getMany();

    for (const task of overdue) {
      task.acceptanceOverdue = true;
      await this.tasksRepo.save(task);
    }
    return overdue;
  }

  // ── Lifecycle ─────────────────────────────────────
  async start(taskId: string, userId: string): Promise<Task> {
    const task    = await this.findById(taskId);
    const agentId = await this.resolveAgentId(userId);

    if (agentId && task.agentId && task.agentId !== agentId)
      throw new ForbiddenException('Not your task');
    if (task.acceptanceStatus !== 'accepted')
      throw new ForbiddenException('Accept the task first');

    const now = new Date();
    task.status    = TaskStatus.IN_PROGRESS;
    task.startedAt = now;

    // Track time from assignment to start
    if (task.createdAt) {
      task.minutesToStart = Math.round(
        (now.getTime() - new Date(task.createdAt).getTime()) / 60000
      );
    }
    return this.tasksRepo.save(task);
  }

  async complete(taskId: string, userId: string, data: {
    notes?:         string;
    photoUrls?:     string[];
    checklistState?: Array<{ id: string; checked: boolean; photoUrls?: string[] }>;
    submittedLatitude?:  number;
    submittedLongitude?: number;
  }): Promise<Task> {
    const task    = await this.findById(taskId);
    const agentId = await this.resolveAgentId(userId);

    if (agentId && task.agentId && task.agentId !== agentId)
      throw new ForbiddenException('Not your task');

    // Validate required photo
    if (task.requiresPhoto && (!data.photoUrls || data.photoUrls.length === 0))
      throw new ForbiddenException('This task requires at least one photo');

    // Validate required checklist items
    if (task.checklist?.length && data.checklistState) {
      const requiredUnchecked = task.checklist
        .filter(ci => ci.required)
        .filter(ci => {
          const update = data.checklistState!.find(u => u.id === ci.id);
          return !update?.checked;
        });
      if (requiredUnchecked.length > 0)
        throw new ForbiddenException(
          `Complete required checklist items: ${requiredUnchecked.map(c => c.label).join(', ')}`
        );

      // Validate per-item photo requirements (only for checked items)
      for (const ci of task.checklist.filter(c => c.requiresPhoto)) {
        const update = data.checklistState!.find(u => u.id === ci.id);
        if (!update?.checked) continue; // only validate when item is being checked
        const photos  = update?.photoUrls ?? [];
        const needed  = ci.requiredPhotoCount ?? 1;
        if (photos.length < needed)
          throw new ForbiddenException(
            `Checklist item "${ci.label}" requires ${needed} photo${needed > 1 ? 's' : ''}`
          );
        if (photos.length > 10)
          throw new ForbiddenException(
            `Checklist item "${ci.label}" allows a maximum of 10 photos`
          );
      }
    }

    // Apply checklist state (including per-item photos)
    if (data.checklistState && task.checklist?.length) {
      task.checklist = task.checklist.map(ci => {
        const update = data.checklistState!.find(u => u.id === ci.id);
        if (!update) return ci;
        return {
          ...ci,
          checked:   update.checked,
          checkedAt: update.checked ? new Date().toISOString() : null,
          photoUrls: update.photoUrls?.slice(0, 10) ?? ci.photoUrls ?? [],
        };
      });
    }

    // ── Geofence check ─────────────────────────────────────────────────────────
    // If the task has a target location and the agent submitted coordinates,
    // verify the submission is within 500 m. Flag (don't block) violations.
    let geoNote = '';
    if (
      task.latitude && task.longitude &&
      data.submittedLatitude && data.submittedLongitude
    ) {
      const R = 6371000; // Earth radius in metres
      const φ1 = task.latitude * Math.PI / 180;
      const φ2 = data.submittedLatitude * Math.PI / 180;
      const Δφ = (data.submittedLatitude - Number(task.latitude)) * Math.PI / 180;
      const Δλ = (data.submittedLongitude - Number(task.longitude)) * Math.PI / 180;
      const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2;
      const distanceMetres = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
      if (distanceMetres > 500) {
        geoNote = `[SYSTEM] Location flag: completion submitted ${distanceMetres} m from task location (threshold 500 m).`;
      }
    }

    const now = new Date();
    task.status       = TaskStatus.COMPLETED;
    task.completedAt  = now;
    task.notes        = [data.notes, geoNote].filter(Boolean).join('\n') || task.notes;
    task.photoUrls    = data.photoUrls ?? task.photoUrls;
    task.submittedLatitude  = data.submittedLatitude  ?? task.submittedLatitude;
    task.submittedLongitude = data.submittedLongitude ?? task.submittedLongitude;

    // Track time from start to completion
    if (task.startedAt) {
      task.minutesToComplete = Math.round(
        (now.getTime() - new Date(task.startedAt).getTime()) / 60000
      );
    }

    const saved = await this.tasksRepo.save(task);

    // Audit: task completed
    this.auditService?.record({
      userId:   userId,
      action:   'TASK_COMPLETED',
      entity:   'Task',
      entityId: saved.id,
      details:  { agentId, title: saved.title, geoFlagged: geoNote !== '' },
    }).catch(() => {});

    // Award XP
    if (agentId) {
      try { await this.agentsService.addXp(agentId, task.xpReward); } catch (_) {}
    }

    // ── Auto-approve for high-reliability agents ─────────────────────────────
    // Criteria: aiCompletionScore ≥ 0.85, agent has ≥10 completed jobs, and photo
    // proof is present when required. Manager still receives a notification.
    setImmediate(async () => {
      try {
        const agent = agentId ? await this.agentsService.findById(agentId).catch(() => null) : null;
        const score = Number(saved.aiCompletionScore ?? 0);
        const hasProof = !saved.requiresPhoto || (saved.photoUrls?.length ?? 0) > 0;
        if (agent && score >= 0.85 && (agent.completedJobs ?? 0) >= 10 && hasProof) {
          await this.approveAndPay(saved.id, 'auto_approve', undefined);
        }
      } catch (_) { /* auto-approve failures never crash task completion */ }
    });

    // ── AI photo verification (fire-and-forget) ───────────────────────────────
    // Claude Vision reviews the first proof photo against the task description.
    // Result is stored back on the task record asynchronously.
    const photoToVerify = (saved.photoUrls ?? [])[0];
    if (photoToVerify && this.aiService) {
      setImmediate(async () => {
        try {
          const result = await this.aiService!.verifyTaskPhoto(
            photoToVerify,
            saved.description ?? saved.title,
            saved.title,
          );
          if (result && result.verified !== null) {
            await this.tasksRepo.update(saved.id, {
              photoVerified: result.verified,
              photoVerificationNote: result.note,
            } as any);
          }
        } catch (_) { /* photo verification failure never affects the task record */ }
      });
    }

    return saved;
  }

  async fail(taskId: string, userId: string, reason: string): Promise<Task> {
    const task    = await this.findById(taskId);
    const agentId = await this.resolveAgentId(userId);

    if (agentId && task.agentId && task.agentId !== agentId)
      throw new ForbiddenException('Not your task');

    task.status = TaskStatus.FAILED;
    task.notes  = reason;
    return this.tasksRepo.save(task);
  }

  async cancel(id: string): Promise<Task> {
    const task = await this.findById(id);
    task.status = TaskStatus.CANCELLED;
    return this.tasksRepo.save(task);
  }

  // ── Manager: approve completed task + pay agent ──
  async approveAndPay(taskId: string, managerId: string, paymentAmount?: number): Promise<Task> {
    const task = await this.findById(taskId);
    if (task.status !== TaskStatus.COMPLETED)
      throw new ForbiddenException('Task must be completed before approval');

    task.approvedAt     = new Date();
    task.approvedBy     = managerId;
    if (paymentAmount != null) task.paymentAmount = paymentAmount;
    const saved = await this.tasksRepo.save(task);

    // Credit agent wallet if payment specified and agent exists
    if (task.agentId && task.paymentAmount) {
      try {
        await this.walletService.creditAgent(
          task.agentId,
          Number(task.paymentAmount),
          `Payment for task: ${task.title}`,
          task.id,
        );
      } catch (_) { /* wallet credit failure should not block approval */ }
    }

    return saved;
  }
}
