/**
 * DataRetentionService — scheduled cleanup of high-volume append-only tables.
 *
 * Schedules (all run at 03:00 EAT = 00:00 UTC to avoid business hours):
 *
 *   GPS logs   — delete rows older than GPS_RETENTION_DAYS (default 90)
 *   Chat msgs  — delete rows older than CHAT_RETENTION_DAYS (default 365)
 *
 * Both jobs delete in batches of 5,000 rows to avoid long-running transactions
 * that would lock the table and stall real-time writes.
 *
 * Metrics counters are incremented so Grafana can alert if a run deletes
 * unexpectedly few or many rows (sign of a stuck cron or data flood).
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { GpsLog } from '../../gps/gps-log.entity';
import { ChatMessage } from '../../chat/chat.entity';
import { MetricsService } from '../metrics/metrics.service';
import { Counter } from 'prom-client';

const GPS_RETENTION_DAYS  = parseInt(process.env.GPS_RETENTION_DAYS  ?? '90',  10);
const CHAT_RETENTION_DAYS = parseInt(process.env.CHAT_RETENTION_DAYS ?? '365', 10);
const BATCH_SIZE          = 5_000;

@Injectable()
export class DataRetentionService {
  private readonly log = new Logger(DataRetentionService.name);

  private readonly gpsDeletedTotal: Counter<string>;
  private readonly chatDeletedTotal: Counter<string>;

  constructor(
    @InjectRepository(GpsLog)      private readonly gpsRepo:  Repository<GpsLog>,
    @InjectRepository(ChatMessage) private readonly chatRepo:  Repository<ChatMessage>,
    @Optional() private readonly metrics: MetricsService,
  ) {
    if (metrics) {
      this.gpsDeletedTotal = new Counter({
        name:      'data_retention_gps_deleted_total',
        help:      'Total GPS log rows deleted by data retention cron',
        registers: [metrics.registry],
      });
      this.chatDeletedTotal = new Counter({
        name:      'data_retention_chat_deleted_total',
        help:      'Total chat message rows deleted by data retention cron',
        registers: [metrics.registry],
      });
    }
  }

  // ── GPS log cleanup — runs daily at 00:00 UTC (03:00 EAT) ──────────────────

  @Cron('0 0 * * *', { name: 'gps-retention' })
  async purgeGpsLogs(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - GPS_RETENTION_DAYS);

    this.log.log(
      `[GPS retention] purging logs before ${cutoff.toISOString()} (${GPS_RETENTION_DAYS}d)`,
    );

    let total = 0;
    let batch: number;

    do {
      // TypeORM DeleteQueryBuilder has no .limit(); use an IN-subquery so Postgres
      // can use the index on createdAt and we avoid full table scans per batch.
      const result = await this.gpsRepo
        .createQueryBuilder()
        .delete()
        .where(`id IN (
          SELECT id FROM gps_logs
          WHERE "createdAt" < :cutoff
          LIMIT ${BATCH_SIZE}
        )`, { cutoff })
        .execute();

      batch  = result.affected ?? 0;
      total += batch;

      if (batch > 0) {
        this.log.debug(`[GPS retention] deleted batch of ${batch} rows (total so far: ${total})`);
      }
    } while (batch === BATCH_SIZE);   // keep going until a batch is smaller than the limit

    this.gpsDeletedTotal?.inc(total);
    this.log.log(`[GPS retention] complete — ${total} rows removed`);
  }

  // ── Chat message cleanup — runs daily at 00:30 UTC ─────────────────────────

  @Cron('30 0 * * *', { name: 'chat-retention' })
  async purgeChatMessages(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CHAT_RETENTION_DAYS);

    this.log.log(
      `[Chat retention] purging messages before ${cutoff.toISOString()} (${CHAT_RETENTION_DAYS}d)`,
    );

    let total = 0;
    let batch: number;

    do {
      const result = await this.chatRepo
        .createQueryBuilder()
        .delete()
        .where(`id IN (
          SELECT id FROM chat_messages
          WHERE "createdAt" < :cutoff
          LIMIT ${BATCH_SIZE}
        )`, { cutoff })
        .execute();

      batch  = result.affected ?? 0;
      total += batch;

      if (batch > 0) {
        this.log.debug(`[Chat retention] deleted batch of ${batch} rows (total so far: ${total})`);
      }
    } while (batch === BATCH_SIZE);

    this.chatDeletedTotal?.inc(total);
    this.log.log(`[Chat retention] complete — ${total} rows removed`);
  }
}
