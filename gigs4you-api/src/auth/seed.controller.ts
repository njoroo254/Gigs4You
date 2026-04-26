import { Controller, Post, Body, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import * as bcrypt from 'bcryptjs';

/**
 * SeedController — ONE-TIME setup endpoints.
 * Use these to:
 *   1. Fix the PostgreSQL enum (add 'worker', 'super_admin' if missing)
 *   2. Create the first super_admin account
 *
 * These endpoints require NO auth — run them once after first deploy,
 * then consider removing or guarding with a SEED_SECRET env var.
 */
@ApiTags('Seed (Setup)')
@Controller('seed')
export class SeedController {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private dataSource: DataSource,
  ) {}

  // ── Step 1: Fix enum — run ONCE after first deploy ─────────────────
  @Post('fix-enum')
  @ApiOperation({ summary: 'Add missing values to users_role_enum (run once)' })
  async fixEnum() {
    const results: string[] = [];

    // Add each missing value safely
    for (const val of ['worker', 'super_admin', 'employer']) {
      try {
        await this.dataSource.query(
          `ALTER TYPE users_role_enum ADD VALUE IF NOT EXISTS '${val}'`
        );
        results.push(`✓ '${val}' added (or already existed)`);
      } catch (e: any) {
        results.push(`✗ '${val}': ${e.message}`);
      }
    }

    return { message: 'Enum fix complete', results };
  }

  // ── Step 2: Create super_admin ──────────────────────────────────────
  @Post('create-super-admin')
  @ApiOperation({ summary: 'Create the first super_admin account (run once)' })
  async createSuperAdmin(@Body() body: {
    name:     string;
    phone:    string;
    email?:   string;
    password: string;
    secret:   string;   // must match SEED_SECRET in .env or 'gigs4you-seed-2024'
  }) {
    const secret = process.env.SEED_SECRET || 'gigs4you-seed-2024';
    if (body.secret !== secret) {
      return { error: 'Invalid seed secret' };
    }

    const existing = await this.userRepo.findOne({
      where: { role: UserRole.SUPER_ADMIN },
    });
    if (existing) {
      return { message: 'Super admin already exists', id: existing.id, phone: existing.phone };
    }

    const password = await bcrypt.hash(body.password, 10);
    const username = body.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);

    const admin = this.userRepo.create({
      name:     body.name,
      phone:    body.phone,
      email:    body.email,
      username,
      password,
      role:     UserRole.SUPER_ADMIN,
      isActive: true,
      permissions: {},
    });

    const saved = await this.userRepo.save(admin);
    return {
      message:  '✓ Super admin created successfully',
      id:       saved.id,
      phone:    saved.phone,
      username: saved.username,
      role:     saved.role,
    };
  }

  // ── Check current state ─────────────────────────────────────────────
  @Get('status')
  @ApiOperation({ summary: 'Check seed status — are admins set up?' })
  async status() {
    const superAdmins = await this.userRepo.count({ where: { role: UserRole.SUPER_ADMIN } });
    const totalUsers  = await this.userRepo.count();

    // Check enum values
    let enumValues: string[] = [];
    try {
      const rows = await this.dataSource.query(
        `SELECT enumlabel FROM pg_enum WHERE enumtypid = 'users_role_enum'::regtype ORDER BY enumlabel`
      );
      enumValues = rows.map((r: any) => r.enumlabel);
    } catch (_) {}

    return {
      superAdmins,
      totalUsers,
      enumValues,
      needsEnumFix:       !enumValues.includes('worker') || !enumValues.includes('super_admin'),
      needsSuperAdmin:    superAdmins === 0,
    };
  }
}
