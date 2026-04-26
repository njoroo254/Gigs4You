import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { GpsLog } from './gps-log.entity';
import { AgentsService } from '../agents/agents.service';

interface PingDto {
  agentId: string;
  latitude: number;
  longitude: number;
  speed?: number;
  accuracy?: number;
}

@Injectable()
export class GpsService {
  // Max realistic speed for a field agent on a boda (km/h)
  private readonly MAX_SPEED_KMH = 120;

  constructor(
    @InjectRepository(GpsLog)
    private gpsRepo: Repository<GpsLog>,
    private agentsService: AgentsService,
  ) {}

  // ── Save a GPS ping + basic fraud check ──────────
  async logPing(dto: PingDto): Promise<GpsLog> {
    let isFlagged = false;
    let flagReason: string | null = null;

    // Fraud check 1: speed too high
    if (dto.speed && dto.speed > this.MAX_SPEED_KMH) {
      isFlagged = true;
      flagReason = `Speed too high: ${dto.speed} km/h`;
    }

    // Fraud check 2: poor GPS accuracy (>100 m means the fix is unreliable)
    if (!isFlagged && dto.accuracy && dto.accuracy > 100) {
      isFlagged = true;
      flagReason = `Poor GPS accuracy: ${dto.accuracy} m (threshold: 100 m)`;
    }

    // Fraud check 3: same location for 3+ consecutive pings (possible fake GPS)
    if (!isFlagged) {
      const recent = await this.gpsRepo.find({
        where: { agentId: dto.agentId },
        order: { timestamp: 'DESC' },
        take: 3,
      });

      if (recent.length >= 3) {
        const allSame = recent.every(
          (log) =>
            Math.abs(Number(log.latitude) - dto.latitude) < 0.0001 &&
            Math.abs(Number(log.longitude) - dto.longitude) < 0.0001,
        );
        if (allSame) {
          isFlagged = true;
          flagReason = 'Suspicious: identical location 3+ pings in a row';
        }
      }
    }

    const log = this.gpsRepo.create({
      agentId: dto.agentId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      speed: dto.speed,
      accuracy: dto.accuracy,
      isFlagged,
      flagReason,
    });

    const saved = await this.gpsRepo.save(log);

    // Update the agent's live location
    await this.agentsService.updateLocation(dto.agentId, dto.latitude, dto.longitude);

    return saved;
  }

  // ── Trail for one agent (last N hours) ───────────
  async getTrail(agentId: string, hours = 8): Promise<GpsLog[]> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    return this.gpsRepo.find({
      where: { agentId, timestamp: MoreThan(since) },
      order: { timestamp: 'ASC' },
    });
  }

  // ── All flagged pings for fraud review ───────────
  async getFlagged(): Promise<GpsLog[]> {
    return this.gpsRepo.find({
      where: { isFlagged: true },
      order: { timestamp: 'DESC' },
      take: 100,
    });
  }
}
