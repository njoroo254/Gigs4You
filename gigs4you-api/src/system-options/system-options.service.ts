import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemOption } from './system-option.entity';

@Injectable()
export class SystemOptionsService {
  private readonly log = new Logger(SystemOptionsService.name);
  private cache = new Map<string, { value: string; expiry: number }>();
  private readonly CACHE_TTL = 60_000;

  constructor(
    @InjectRepository(SystemOption)
    private repo: Repository<SystemOption>,
  ) {
    this.seedDefaultOptions();
  }

  private async seedDefaultOptions() {
    const defaults = [
      { type: 'platform_name', value: 'Gigs4You' },
      { type: 'support_email', value: 'support@gigs4you.co.ke' },
      { type: 'max_agents_per_org', value: '50' },
      { type: 'max_jobs_per_employer', value: '100' },
      { type: 'gps_tracking_enabled', value: 'true' },
      { type: 'gps_update_interval', value: '30' },
      { type: 'agent_checkin_required', value: 'true' },
      { type: 'auto_approve_agents', value: 'false' },
      { type: 'require_verification', value: 'true' },
      { type: 'default_commission_rate', value: '10' },
      { type: 'min_withdrawal_amount', value: '500' },
      { type: 'max_withdrawal_amount', value: '70000' },
    ];

    for (const opt of defaults) {
      try {
        const existing = await this.repo.findOne({ where: { type: opt.type } });
        if (!existing) {
          await this.repo.save(this.repo.create(opt));
        }
      } catch (e) {
        this.log.debug(`Option ${opt.type} may already exist`);
      }
    }
  }

  private getCached(type: string): string | null {
    const cached = this.cache.get(type);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }
    this.cache.delete(type);
    return null;
  }

  private setCache(type: string, value: string): void {
    this.cache.set(type, { value, expiry: Date.now() + this.CACHE_TTL });
  }

  async get(type: string): Promise<string | null> {
    const cached = this.getCached(type);
    if (cached !== null) return cached;

    const opt = await this.repo.findOne({ where: { type } });
    const value = opt?.value ?? null;
    if (value !== null) {
      this.setCache(type, value);
    }
    return value;
  }

  async getBoolean(type: string, defaultValue = false): Promise<boolean> {
    const value = await this.get(type);
    if (value === null) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  async getNumber(type: string, defaultValue = 0): Promise<number> {
    const value = await this.get(type);
    if (value === null) return defaultValue;
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
  }

  async getByType(type: string): Promise<string[]> {
    const opts = await this.repo.find({ where: { type }, order: { createdAt: 'ASC' } });
    return opts.map(o => o.value);
  }

  async addOption(type: string, value: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed) return;
    const existing = await this.repo.findOne({ where: { type, value: trimmed } });
    if (!existing) {
      await this.repo.save(this.repo.create({ type, value: trimmed }));
    }
  }

  async set(type: string, value: string): Promise<SystemOption> {
    let opt = await this.repo.findOne({ where: { type } });
    if (opt) {
      opt.value = value;
      opt = await this.repo.save(opt);
    } else {
      opt = await this.repo.save(this.repo.create({ type, value }));
    }
    this.cache.delete(type);
    return opt;
  }

  async delete(type: string): Promise<void> {
    await this.repo.delete({ type });
    this.cache.delete(type);
  }
}
