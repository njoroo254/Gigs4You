/**
 * MatchingLearningService — Phase 6: Learning loop for AI task matching.
 *
 * Runs a weekly cron that compares predicted aiCompletionScore against actual
 * outcomes for auto-assigned tasks. For agents with ≥5 samples it computes a
 * calibration factor: actual_completion_rate / avg_predicted_score.
 *
 * The calibration is kept in memory (Map) and exported via getCalibration().
 * TasksService calls this when scoring an agent so scores drift toward reality
 * without requiring any new database columns.
 *
 * Calibration bounds: [0.50, 1.50] — never more than ±50% adjustment.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Task, TaskStatus } from '../tasks/task.entity';

const MIN_SAMPLE_SIZE = 5;   // need at least this many auto-assigned tasks to calibrate
const CALIBRATION_FLOOR = 0.50;
const CALIBRATION_CEILING = 1.50;

@Injectable()
export class MatchingLearningService {
  private readonly log = new Logger(MatchingLearningService.name);

  // agentId → calibration factor (default 1.0 = no adjustment)
  private calibrationCache = new Map<string, number>();

  constructor(
    @InjectRepository(Task) private taskRepo: Repository<Task>,
  ) {}

  // ── Weekly rebuild of calibration factors (Sunday 02:00 Nairobi) ──────────
  @Cron('0 2 * * 0', { timeZone: 'Africa/Nairobi' })
  async rebuildCalibration(): Promise<void> {
    this.log.log('Rebuilding matching calibration from task outcomes…');
    try {
      // Fetch all tasks that were auto-assigned (have aiCompletionScore) in the last 90 days
      const since = new Date(Date.now() - 90 * 86_400_000);
      const tasks = await this.taskRepo
        .createQueryBuilder('task')
        .select(['task.agentId', 'task.status', 'task.aiCompletionScore'])
        .where('task.aiCompletionScore IS NOT NULL')
        .andWhere('task.agentId IS NOT NULL')
        .andWhere('task.createdAt >= :since', { since })
        .getMany();

      // Group by agent
      const byAgent = new Map<string, { predicted: number[]; completed: number }>();
      for (const task of tasks) {
        if (!task.agentId) continue;
        if (!byAgent.has(task.agentId)) byAgent.set(task.agentId, { predicted: [], completed: 0 });
        const entry = byAgent.get(task.agentId)!;
        entry.predicted.push(Number(task.aiCompletionScore));
        if (task.status === TaskStatus.COMPLETED) entry.completed++;
      }

      // Compute calibration
      const newCache = new Map<string, number>();
      let calibrated = 0;
      for (const [agentId, { predicted, completed }] of byAgent) {
        if (predicted.length < MIN_SAMPLE_SIZE) continue;
        const avgPredicted = predicted.reduce((a, b) => a + b, 0) / predicted.length;
        const actualRate   = completed / predicted.length;
        if (avgPredicted === 0) continue;
        const factor = Math.min(CALIBRATION_CEILING, Math.max(CALIBRATION_FLOOR, actualRate / avgPredicted));
        newCache.set(agentId, factor);
        calibrated++;
      }

      this.calibrationCache = newCache;
      this.log.log(
        `Calibration rebuilt: ${calibrated} agents calibrated from ${tasks.length} task samples. ` +
        `(${byAgent.size - calibrated} agents had <${MIN_SAMPLE_SIZE} samples — using baseline 1.0)`
      );
    } catch (err) {
      this.log.error('Calibration rebuild failed', (err as Error).message);
    }
  }

  /**
   * Return the calibration multiplier for an agent.
   * 1.0 = no adjustment (default when we have insufficient data).
   */
  getCalibration(agentId: string): number {
    return this.calibrationCache.get(agentId) ?? 1.0;
  }

  /**
   * Return the full calibration map (used for diagnostics/reporting).
   */
  getCalibrationSummary(): Record<string, number> {
    return Object.fromEntries(this.calibrationCache);
  }
}
