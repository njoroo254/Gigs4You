import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createDependencyFailure } from '../common/errors/dependency-failure';
import { EncryptionService } from '../common/encryption/encryption.service';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private readonly enc: EncryptionService,
  ) {}

  /** Encrypt PII fields and compute blind-index hashes before persisting. */
  private _encryptPii(data: Partial<User>): Partial<User> {
    const out = { ...data };
    if ('phone' in data && data.phone != null) {
      out.phone     = this.enc.encrypt(data.phone)!;
      out.phoneHash = this.enc.blindIndex(data.phone) ?? undefined!;
    }
    if ('email' in data && data.email != null) {
      out.email     = this.enc.encrypt(data.email)!;
      out.emailHash = this.enc.blindIndex(data.email) ?? undefined!;
    }
    return out;
  }

  /** Decrypt PII fields on a user row before returning to callers. */
  private _decryptPii(user: User | null): User | null {
    if (!user) return null;
    return {
      ...user,
      phone: this.enc.decrypt(user.phone)!,
      email: user.email ? this.enc.decrypt(user.email)! : user.email,
    } as User;
  }

  private async withDatabase<T>(operation: string, target: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw createDependencyFailure(
        'PostgreSQL',
        `UsersService.${operation}`,
        target,
        error,
        'User data store is currently unavailable',
      );
    }
  }

  async create(data: Partial<User>): Promise<User> {
    return this.withDatabase('create', 'users', async () => {
      const user = this.usersRepo.create(this._encryptPii(data));
      const saved = await this.usersRepo.save(user);
      return this._decryptPii(saved)!;
    });
  }

  async findAll(orgId?: string): Promise<any[]> {
    const users = await this.withDatabase(
      'findAll',
      orgId ? `users?organisationId=${orgId}` : 'users',
      async () => {
        const qb = this.usersRepo
          .createQueryBuilder('user')
          .leftJoinAndSelect('user.agent', 'agent')
          .select([
            'user.id','user.name','user.phone','user.email','user.role',
            'user.isActive','user.companyName','user.county',
            'user.organisationId','user.lastLoginAt','user.createdAt',
            'agent.id','agent.level','agent.totalXp','agent.currentStreak',
            'agent.status','agent.averageRating','agent.completedJobs',
          ])
          .orderBy('user.createdAt','DESC');

        if (orgId) {
          qb.where('user.organisationId = :orgId', { orgId });
        }

        return qb.getMany();
      },
    );

    return users.map(u => ({
      id:             u.id,
      name:           u.name,
      phone:          this.enc.decrypt(u.phone),
      email:          u.email ? this.enc.decrypt(u.email) : u.email,
      role:           u.role,
      isActive:       u.isActive,
      companyName:    u.companyName,
      county:         u.county,
      organisationId: u.organisationId,
      lastLoginAt:    u.lastLoginAt,
      createdAt:      u.createdAt,
      agentData: u.agent ? {
        id:            u.agent.id,
        level:         u.agent.level,
        totalXp:       u.agent.totalXp,
        currentStreak: u.agent.currentStreak,
        status:        u.agent.status,
        averageRating: u.agent.averageRating,
        completedJobs: u.agent.completedJobs,
      } : null,
    }));
  }

  async findById(id: string): Promise<User> {
    const user = await this.withDatabase('findById', `users/${id}`, () =>
      this.usersRepo.findOne({ where: { id } }),
    );
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this._decryptPii(user)!;
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.withDatabase('findByPhone', 'users?phone=[redacted]', async () => {
      const hash = this.enc.blindIndex(phone);
      const user = hash
        ? await this.usersRepo.findOne({ where: { phoneHash: hash } })   // prod: use blind index
        : await this.usersRepo.findOne({ where: { phone } });             // dev: plaintext fallback
      return this._decryptPii(user);
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.withDatabase('findByEmail', 'users?email=[redacted]', async () => {
      const hash = this.enc.blindIndex(email);
      const user = hash
        ? await this.usersRepo.findOne({ where: { emailHash: hash } })
        : await this.usersRepo.findOne({ where: { email } });
      return this._decryptPii(user);
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.withDatabase('findByUsername', `users?username=${username}`, () =>
      this.usersRepo.findOne({ where: { username } }),
    );
  }

  async findByIdentifier(identifier: string): Promise<User | null> {
    return this.withDatabase('findByIdentifier', 'users?identifier=[redacted]', async () => {
      const trimmed = identifier.trim().toLowerCase();

      if (/^[+0-9]{7,15}$/.test(trimmed.replace(/\s/g, ''))) {
        // Phone number — try all Kenyan format variants via blind index
        const raw = trimmed.replace(/\s/g, '');
        const candidates = new Set<string>([raw]);
        if (raw.startsWith('0'))    candidates.add(`+254${raw.slice(1)}`);
        if (raw.startsWith('254'))  candidates.add(`+${raw}`);
        if (raw.startsWith('+254')) candidates.add(`0${raw.slice(4)}`);
        if (raw.startsWith('+254')) candidates.add(`254${raw.slice(4)}`);

        for (const phone of candidates) {
          const hash = this.enc.blindIndex(phone);
          const user = hash
            ? await this.usersRepo.findOne({ where: { phoneHash: hash } })
            : await this.usersRepo.findOne({ where: { phone } });
          if (user) return this._decryptPii(user);
        }
      }

      if (trimmed.includes('@')) {
        const hash = this.enc.blindIndex(trimmed);
        const byEmail = hash
          ? await this.usersRepo.findOne({ where: { emailHash: hash } })
          : await this.usersRepo.findOne({ where: { email: trimmed } });
        if (byEmail) return this._decryptPii(byEmail);
      }

      const byUsername = await this.usersRepo.findOne({ where: { username: trimmed } });
      if (byUsername) return this._decryptPii(byUsername);

      // Last fallback: plaintext phone (handles pre-migration rows where phone
      // is stored unencrypted but phoneHash was never backfilled).
      // Try all format variants so 0759... matches +254759... stored rows.
      const rawBack = trimmed.replace(/\s/g, '');
      const variantsBack = new Set<string>([rawBack]);
      if (rawBack.startsWith('0'))    variantsBack.add(`+254${rawBack.slice(1)}`);
      if (rawBack.startsWith('254'))  variantsBack.add(`+${rawBack}`);
      if (rawBack.startsWith('+254')) variantsBack.add(`0${rawBack.slice(4)}`);
      if (rawBack.startsWith('+254')) variantsBack.add(`254${rawBack.slice(4)}`);

      for (const phone of variantsBack) {
        const fallbackUser = await this.usersRepo.findOne({ where: { phone } });
        if (fallbackUser) return this._decryptPii(fallbackUser);
      }
      return null;
    });
  }

  async generateUsername(name: string): Promise<string> {
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    let candidate = base;
    let i = 1;
    while (await this.findByUsername(candidate)) {
      candidate = `${base}${i++}`;
    }
    return candidate;
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    await this.withDatabase('update', `users/${id}`, () =>
      this.usersRepo.update(id, this._encryptPii(data)),
    );
    return this.findById(id);
  }

  async deactivate(id: string): Promise<User> {
    return this.update(id, { isActive: false });
  }
}
