import { randomUUID, createHash } from 'crypto';
import { Logger, HttpException, NotFoundException } from '@nestjs/common';
import {
  Injectable,
  Optional,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { AgentsService } from '../agents/agents.service';
import { PlanLimitService } from '../billing/subscription.guard';
import { NotificationService } from '../notifications-gateway/notification.service';
import { OrganisationsService } from '../organisations/organisations.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '../users/user.entity';
import { AuditService } from '../audit/audit.service';
import { REDIS_CLIENT } from '../common/redis.provider';
import type Redis from 'ioredis';

const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
  super_admin: {},
  admin: {
    canCreateJobs: true, canEditJobs: true, canDeleteJobs: true,
    canCreateTasks: true, canEditTasks: true, canDeleteTasks: true,
    canViewReports: true, canManageUsers: true, canManagePayments: true,
    canViewAgents: true, canInviteMembers: true,
  },
  manager: {
    canCreateJobs: true, canEditJobs: true, canDeleteJobs: false,
    canCreateTasks: true, canEditTasks: true, canDeleteTasks: false,
    canViewReports: true, canManageUsers: false, canManagePayments: true,
    canViewAgents: true, canInviteMembers: false,
  },
  supervisor: {
    canCreateJobs: false, canEditJobs: false, canDeleteJobs: false,
    canCreateTasks: true, canEditTasks: true, canDeleteTasks: false,
    canViewReports: true, canManageUsers: false, canManagePayments: false,
    canViewAgents: true, canInviteMembers: false,
  },
  agent: {
    canCreateJobs: false, canEditJobs: false, canDeleteJobs: false,
    canCreateTasks: false, canEditTasks: false, canDeleteTasks: false,
    canViewReports: false, canManageUsers: false, canManagePayments: false,
    canViewAgents: false, canInviteMembers: false, canViewJobs: true,
  },
  employer: {
    canCreateJobs: true, canEditJobs: true, canDeleteJobs: true,
    canCreateTasks: false, canEditTasks: false, canDeleteTasks: false,
    canViewReports: true, canManageUsers: false, canManagePayments: true,
    canViewAgents: true, canInviteMembers: true,
  },
  worker: {
    canCreateJobs: false, canEditJobs: false, canDeleteJobs: false,
    canCreateTasks: false, canEditTasks: false, canDeleteTasks: false,
    canViewReports: false, canManageUsers: false, canManagePayments: false,
    canViewAgents: false, canInviteMembers: false, canViewJobs: true,
  },
};

const PUBLIC_ROLES = new Set<string>([
  UserRole.WORKER,
  UserRole.ADMIN,
  UserRole.EMPLOYER,
]);

const FIELD_ROLES = new Set<string>([
  UserRole.AGENT,
  UserRole.MANAGER,
  UserRole.SUPERVISOR,
]);

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);
  private readonly passwordResetTtlSeconds = 15 * 60;
  private readonly refreshTokenSecret: string;
  private readonly refreshTokenExpiresIn: string;
  private readonly refreshTokenTtlSeconds: number;

  constructor(
    private usersService: UsersService,
    private agentsService: AgentsService,
    private planLimits: PlanLimitService,
    @Optional() private notificationService: NotificationService,
    private orgsService: OrganisationsService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Optional() private auditService: AuditService,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {
    this.refreshTokenSecret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.refreshTokenExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')
      || '30d';
    this.refreshTokenTtlSeconds = this.parseDurationToSeconds(
      this.refreshTokenExpiresIn,
      30 * 24 * 60 * 60,
    );
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByPhone(dto.phone);
    if (existing) throw new ConflictException('Phone number already registered');

    if (dto.email) {
      const byEmail = await this.usersService.findByEmail(dto.email);
      if (byEmail) throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const role = this.resolvePublicRole(dto.role);
    if (role === UserRole.ADMIN && !dto.companyName?.trim()) {
      throw new BadRequestException('Company name is required for organisation sign up');
    }
    const username = await this.usersService.generateUsername(dto.name);

    const user = await this.usersService.create({
      ...dto,
      role: role as UserRole,
      username,
      password: hashedPassword,
      isActive: false, // account inactive until verified
      permissions: DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.worker,
    });

    if (role === 'admin' && dto.companyName) {
      try {
        const org = await this.orgsService.create({
          name: dto.companyName,
          county: dto.county,
          ownerId: user.id,
        }, user.id);
        await this.usersService.update(user.id, { organisationId: org.id });
        user.organisationId = org.id;
      } catch (_) {}
    }

    if (this.shouldCreateAgentProfile(role)) {
      try {
        await this.agentsService.createForUser(user.id, undefined, user.organisationId || undefined);
      } catch (_) {}
    }

    const verificationToken = await this.sendAccountVerificationOtps(user);
    return {
      requiresVerification: true,
      verificationToken,
      hasPhone: true,
      hasEmail: !!user.email,
    };
  }

  async createOrgUser(dto: RegisterDto, callerOrgId: string, callerRole: string) {
    if (!['super_admin', 'admin', 'manager'].includes(callerRole)) {
      throw new ForbiddenException('Only admins and managers can create org users');
    }

    const existing = await this.usersService.findByPhone(dto.phone);
    if (existing) throw new ConflictException('Phone number already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const username = await this.usersService.generateUsername(dto.name);

    const allowedRoles: Record<string, string[]> = {
      super_admin: ['admin', 'manager', 'supervisor', 'agent', 'employer'],
      admin: ['manager', 'supervisor', 'agent', 'employer'],
      manager: ['supervisor', 'agent'],
    };
    const allowed = allowedRoles[callerRole] || [];
    if (!dto.role || !allowed.includes(dto.role as string)) {
      throw new BadRequestException(`Role must be one of: ${allowed.join(', ')}`);
    }
    const role = dto.role as UserRole;

    const organisationId = callerRole === 'super_admin' ? dto.organisationId : callerOrgId;
    if (organisationId && this.shouldCreateAgentProfile(role)) {
      const existingAgents = await this.agentsService.countByOrg(organisationId);
      await this.planLimits.checkAgentLimit(organisationId, existingAgents);
    }

    const user = await this.usersService.create({
      ...dto,
      role: role as UserRole,
      username,
      password: hashedPassword,
      organisationId,
      permissions: DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.agent,
    });

    if (this.shouldCreateAgentProfile(role)) {
      try {
        await this.agentsService.createForUser(user.id, undefined, user.organisationId || undefined);
      } catch (_) {}
    }

    return this.signToken(user);
  }

  async login(dto: LoginDto, ip?: string) {
    // ── Lockout check (before user lookup — prevents account enumeration) ──
    await this.assertNotLockedOut(dto.identifier);

    const user = await this.usersService.findByIdentifier(dto.identifier);
    if (!user) {
      await this.recordFailedAttempt(dto.identifier);
      throw new UnauthorizedException('Invalid credentials - check phone, email or username');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      await this.recordFailedAttempt(dto.identifier); // may throw 429 if threshold crossed
      throw new UnauthorizedException('Invalid credentials - check phone, email or username');
    }

    // Successful authentication — clear failure counter
    await this.clearLockout(dto.identifier);

    if (!user.isActive) {
      // Distinguish unverified accounts from admin-deactivated ones
      if (!user.isPhoneVerified || (user.email && !user.isEmailVerified)) {
        const verificationToken = await this.sendAccountVerificationOtps(user);
        return {
          requiresVerification: true,
          verificationToken,
          hasPhone: true,
          hasEmail: !!user.email,
        };
      }
      throw new UnauthorizedException('Account is deactivated. Contact your administrator.');
    }

    if (this.shouldCreateAgentProfile(user.role)) {
      const existingAgent = await this.agentsService.findByUserId(user.id);
      if (!existingAgent) {
        try {
          await this.agentsService.createForUser(user.id, undefined, user.organisationId || undefined);
        } catch (_) {}
      }
    }

    await this.usersService.update(user.id, {
      lastLoginAt: new Date(),
      lastLoginIp: ip || 'unknown',
    });

    this.auditService?.record({
      userId: user.id,
      userRole: user.role,
      orgId: user.organisationId,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      details: { identifier: dto.identifier },
      ip,
    });

    // 2FA — enforce for dashboard roles that may have email or phone
    const needs2fa = (user.email || user.phone) && [
      UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER,
      UserRole.SUPERVISOR, UserRole.EMPLOYER,
    ].includes(user.role as UserRole);

    // Optionally disable 2FA in non-production environments (helps with mobile login flows during development)
    const disable2fa = this.configService.get<string>('DISABLE_2FA')?.toLowerCase() === 'true';
    if (disable2fa) {
      // Skip OTP step for development or testing
    } else if (needs2fa) {
      const challengeToken = await this.sendLoginOtp(user);
      const via = user.phone ? 'sms' : 'email';
      return { requiresOtp: true, challengeToken, otpVia: via };
    }

    return this.signToken(user);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    if (!this.refreshTokenSecret) {
      throw new UnauthorizedException('Refresh tokens are not configured');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, { secret: this.refreshTokenSecret });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload?.type !== 'refresh' || !payload?.jti || !payload?.sub) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    const sessionKey = this.getRefreshSessionKey(payload.jti);
    const sessionUserId = await this.redis.get(sessionKey);
    if (!sessionUserId || sessionUserId !== payload.sub) {
      throw new UnauthorizedException('Refresh session is no longer valid');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user.isActive) {
      await this.redis.del(sessionKey);
      throw new UnauthorizedException('Account is deactivated');
    }

    await this.redis.del(sessionKey);
    return this.signToken(user);
  }

  // ── Account & contact verification ───────────────────────────────────────
  private readonly verifyTtlSeconds = 15 * 60;
  private readonly maxOtpAttempts   = 5;

  private getVerifyKey(type: 'phone' | 'email', userId: string) {
    return `auth:verify:${type}:${userId}`;
  }

  private getVerifyAttemptKey(type: 'phone' | 'email', userId: string) {
    return `auth:verify:attempts:${type}:${userId}`;
  }

  private getLoginOtpAttemptKey(userId: string) {
    return `auth:2fa:attempts:${userId}`;
  }

  private getPendingKey(type: 'phone' | 'email', userId: string) {
    return `auth:pending:${type}:${userId}`;
  }

  private issueVerificationToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId, purpose: 'account_verification' },
      { expiresIn: '30m' },
    );
  }

  private async sendAccountVerificationOtps(user: any): Promise<string> {
    const phoneOtp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(this.getVerifyKey('phone', user.id), phoneOtp, 'EX', this.verifyTtlSeconds);
    await this.notificationService?.sendSms(
      user.phone,
      `Your Gigs4You phone verification code is: ${phoneOtp}. Valid for 15 minutes. Do not share.`,
    ).catch(() => {});

    if (user.email) {
      const emailOtp = Math.floor(100000 + Math.random() * 900000).toString();
      await this.redis.set(this.getVerifyKey('email', user.id), emailOtp, 'EX', this.verifyTtlSeconds);
      await this.notificationService?.sendEmail({
        to: user.email,
        subject: 'Gigs4You — Verify your email address',
        text: `Your Gigs4You email verification code is: ${emailOtp}. Valid for 15 minutes. Do not share.`,
        html: `<p style="font-family:Arial,sans-serif">Your Gigs4You email verification code is:<br><strong style="font-size:32px;letter-spacing:6px;color:#1B6B3A">${emailOtp}</strong><br><small>Valid for 15 minutes. Do not share this code.</small></p>`,
      }).catch(() => {});
    }

    return this.issueVerificationToken(user.id);
  }

  async verifyContact(verificationToken: string, type: 'phone' | 'email', code: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(verificationToken);
    } catch {
      throw new UnauthorizedException('Verification session expired. Please request a new code.');
    }
    if (payload?.purpose !== 'account_verification' || !payload?.sub) {
      throw new UnauthorizedException('Invalid verification token.');
    }

    const attemptKey = this.getVerifyAttemptKey(type, payload.sub);
    const attempts   = Number(await this.redis.get(attemptKey) ?? 0);
    if (attempts >= this.maxOtpAttempts) {
      await this.redis.del(this.getVerifyKey(type, payload.sub));
      await this.redis.del(attemptKey);
      throw new UnauthorizedException('Too many incorrect attempts — request a new verification code.');
    }

    const stored = await this.redis.get(this.getVerifyKey(type, payload.sub));
    if (!stored || stored !== code.trim()) {
      const newCount = await this.redis.incr(attemptKey);
      if (newCount === 1) await this.redis.expire(attemptKey, this.verifyTtlSeconds);
      if (newCount >= this.maxOtpAttempts) {
        await this.redis.del(this.getVerifyKey(type, payload.sub));
        await this.redis.del(attemptKey);
        throw new UnauthorizedException('Too many incorrect attempts — request a new verification code.');
      }
      throw new UnauthorizedException('Invalid or expired verification code.');
    }

    await this.redis.del(this.getVerifyKey(type, payload.sub));
    await this.redis.del(attemptKey);

    const update: Partial<any> = {};
    if (type === 'phone') update.isPhoneVerified = true;
    if (type === 'email') update.isEmailVerified = true;
    await this.usersService.update(payload.sub, update);

    const user = await this.usersService.findById(payload.sub);
    const phoneOk = user.isPhoneVerified;
    const emailOk = !user.email || user.isEmailVerified;

    if (phoneOk && emailOk) {
      await this.usersService.update(user.id, { isActive: true } as any);
      user.isActive = true;
      return this.signToken(user);
    }

    // More verification required
    const remaining: string[] = [];
    if (!user.isPhoneVerified) remaining.push('phone');
    if (user.email && !user.isEmailVerified) remaining.push('email');
    return {
      requiresMoreVerification: true,
      verificationToken,
      remaining,
    };
  }

  async resendVerificationOtp(verificationToken: string, type: 'phone' | 'email') {
    let payload: any;
    try {
      payload = this.jwtService.verify(verificationToken);
    } catch {
      throw new UnauthorizedException('Verification session expired. Please register again.');
    }
    if (payload?.purpose !== 'account_verification' || !payload?.sub) {
      throw new UnauthorizedException('Invalid verification token.');
    }

    const user = await this.usersService.findById(payload.sub);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(this.getVerifyKey(type, user.id), otp, 'EX', this.verifyTtlSeconds);

    if (type === 'phone') {
      await this.notificationService?.sendSms(
        user.phone,
        `Your Gigs4You phone verification code is: ${otp}. Valid for 15 minutes. Do not share.`,
      ).catch(() => {});
    } else if (type === 'email' && user.email) {
      await this.notificationService?.sendEmail({
        to: user.email,
        subject: 'Gigs4You — Your new verification code',
        text: `Your Gigs4You email verification code is: ${otp}. Valid for 15 minutes. Do not share.`,
        html: `<p style="font-family:Arial,sans-serif">Your new verification code:<br><strong style="font-size:32px;letter-spacing:6px;color:#1B6B3A">${otp}</strong><br><small>Valid for 15 minutes.</small></p>`,
      }).catch(() => {});
    }

    return { message: 'Verification code resent.' };
  }

  async requestContactUpdate(userId: string, type: 'phone' | 'email', newValue: string) {
    if (type === 'phone') {
      const conflict = await this.usersService.findByPhone(newValue);
      if (conflict && conflict.id !== userId) {
        throw new ConflictException('This phone number is already registered to another account.');
      }
    } else {
      const conflict = await this.usersService.findByEmail(newValue);
      if (conflict && conflict.id !== userId) {
        throw new ConflictException('This email is already registered to another account.');
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(
      this.getPendingKey(type, userId),
      JSON.stringify({ otp, newValue }),
      'EX',
      this.verifyTtlSeconds,
    );

    if (type === 'phone') {
      await this.notificationService?.sendSms(
        newValue,
        `Your Gigs4You verification code is: ${otp}. Valid for 15 minutes. This confirms your phone number change.`,
      ).catch(() => {});
    } else {
      await this.notificationService?.sendEmail({
        to: newValue,
        subject: 'Gigs4You — Verify your new email address',
        text: `Your Gigs4You verification code is: ${otp}. Valid for 15 minutes.`,
        html: `<p style="font-family:Arial,sans-serif">Verification code for your new email:<br><strong style="font-size:32px;letter-spacing:6px;color:#1B6B3A">${otp}</strong><br><small>Valid for 15 minutes. If you did not request this, ignore this email.</small></p>`,
      }).catch(() => {});
    }

    return { message: `Verification code sent to your new ${type === 'phone' ? 'phone number' : 'email address'}.` };
  }

  async verifyAndApplyContactUpdate(userId: string, type: 'phone' | 'email', code: string) {
    const raw = await this.redis.get(this.getPendingKey(type, userId));
    if (!raw) throw new BadRequestException('Verification code expired. Please request a new one.');

    const { otp, newValue } = JSON.parse(raw);
    if (otp !== code.trim()) throw new UnauthorizedException('Invalid verification code.');

    await this.redis.del(this.getPendingKey(type, userId));

    const update: Partial<any> = {};
    if (type === 'phone') { update.phone = newValue; update.isPhoneVerified = true; }
    if (type === 'email') { update.email = newValue; update.isEmailVerified = true; }

    await this.usersService.update(userId, update);
    return {
      message: `${type === 'phone' ? 'Phone number' : 'Email address'} updated and verified successfully.`,
    };
  }

  async logout(userId: string, accessJti: string | undefined, refreshToken?: string): Promise<void> {
    // Revoke the refresh token session so it can't be exchanged for a new access token
    if (refreshToken) {
      try {
        const payload = this.jwtService.verify(refreshToken, { secret: this.refreshTokenSecret });
        if (payload?.jti) {
          await this.redis.del(this.getRefreshSessionKey(payload.jti));
        }
      } catch {
        // Expired or invalid — session is already dead, nothing to revoke
      }
    }

    // Denylist the access token JTI so it is rejected for its remaining lifetime
    if (accessJti) {
      const ttl = this.parseDurationToSeconds(
        this.configService.get<string>('JWT_EXPIRES_IN') || '7d',
        7 * 24 * 60 * 60,
      );
      await this.redis.set(`auth:denylist:${accessJti}`, '1', 'EX', ttl);
    }
  }

  private async signToken(user: any) {
    const accessJti = randomUUID();
    const payload = {
      sub: user.id,
      jti: accessJti,
      phone: user.phone,
      email: user.email,
      username: user.username,
      role: user.role,
      name: user.name,
      orgId: user.organisationId || null,
      permissions: user.permissions || {},
    };

    const refreshJti = randomUUID();
    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
        role: user.role,
        type: 'refresh',
        jti: refreshJti,
      },
      {
        secret: this.refreshTokenSecret,
        expiresIn: this.refreshTokenExpiresIn,
      },
    );

    await this.redis.set(
      this.getRefreshSessionKey(refreshJti),
      user.id,
      'EX',
      this.refreshTokenTtlSeconds,
    );

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: refreshToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        username: user.username,
        role: user.role,
        companyName: user.companyName,
        county: user.county,
        organisationId: user.organisationId,
        permissions: user.permissions || {},
      },
    };
  }

  // ── Account lockout (two-tier, identifier-based) ──────────────────────
  // Tier 1: 5 failures  → 15-minute lock
  // Tier 2: 10 failures → 60-minute lock
  // Key uses sha256(identifier) so check runs before user lookup,
  // eliminating account-existence enumeration via lockout response timing.
  private readonly lockoutTier1Attempts = 5;
  private readonly lockoutTier1Seconds  = 15 * 60;
  private readonly lockoutTier2Attempts = 10;
  private readonly lockoutTier2Seconds  = 60 * 60;
  private readonly lockoutCounterTtl    = 24 * 60 * 60; // counter lives 24 h

  private getLockoutKey(identifier: string): string {
    const hash = createHash('sha256').update(identifier.toLowerCase().trim()).digest('hex');
    return `auth:lockout:${hash}`;
  }

  private async assertNotLockedOut(identifier: string): Promise<void> {
    const raw = await this.redis.get(this.getLockoutKey(identifier));
    if (!raw) return;
    const state = JSON.parse(raw) as { attempts: number; lockedUntil: number };
    if (state.lockedUntil && Date.now() < state.lockedUntil) {
      const retryAfter = Math.ceil((state.lockedUntil - Date.now()) / 1000);
      throw new HttpException(
        { statusCode: 429, message: 'Too many failed login attempts. Try again later.', retryAfter },
        429,
      );
    }
  }

  private async recordFailedAttempt(identifier: string): Promise<void> {
    const key = this.getLockoutKey(identifier);
    const raw = await this.redis.get(key);
    const state: { attempts: number; lockedUntil: number } = raw
      ? JSON.parse(raw)
      : { attempts: 0, lockedUntil: 0 };

    state.attempts++;

    if (state.attempts >= this.lockoutTier2Attempts) {
      state.lockedUntil = Date.now() + this.lockoutTier2Seconds * 1000;
      await this.redis.set(key, JSON.stringify(state), 'EX', this.lockoutTier2Seconds);
      throw new HttpException(
        { statusCode: 429, message: 'Too many failed login attempts. Try again later.', retryAfter: this.lockoutTier2Seconds },
        429,
      );
    } else if (state.attempts >= this.lockoutTier1Attempts) {
      state.lockedUntil = Date.now() + this.lockoutTier1Seconds * 1000;
      await this.redis.set(key, JSON.stringify(state), 'EX', this.lockoutTier1Seconds);
      throw new HttpException(
        { statusCode: 429, message: 'Too many failed login attempts. Try again later.', retryAfter: this.lockoutTier1Seconds },
        429,
      );
    } else {
      state.lockedUntil = 0;
      await this.redis.set(key, JSON.stringify(state), 'EX', this.lockoutCounterTtl);
    }
  }

  private async clearLockout(identifier: string): Promise<void> {
    await this.redis.del(this.getLockoutKey(identifier));
  }

  // ── 2FA OTP (login challenge) ─────────────────────────────────────────
  private readonly otpTtlSeconds = 10 * 60; // 10 minutes

  private getLoginOtpKey(userId: string) {
    return `auth:2fa:${userId}`;
  }

  private async sendLoginOtp(user: any): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(this.getLoginOtpKey(user.id), code, 'EX', this.otpTtlSeconds);

    // Issue a short-lived challenge token so the client can identify the pending session
    const challengeToken = this.jwtService.sign(
      { sub: user.id, purpose: 'otp_challenge' },
      { expiresIn: '10m' },
    );
    // Additionally, send OTP via SMS if a phone number is available (improves mobile UX)
    if (user?.phone) {
      try {
        await this.notificationService?.sendSms(
          user.phone,
          `Your Gigs4You login verification code is: ${code}. Valid for 10 minutes. Do not share this code.`,
        );
      } catch {
        // Ignore SMS failures in OTP flow; email fallback remains
      }
    }

    const now = new Date();
    const dateStr = now.toLocaleString('en-KE', { dateStyle: 'long', timeStyle: 'short' });
    await this.notificationService?.sendEmail({
      to: user.email,
      subject: 'Gigs4You — Your login verification code',
      text: `Your Gigs4You 2FA code is: ${code}. Valid for 10 minutes. Do not share this code.`,
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:#1B6B3A;padding:28px 32px;text-align:center">
            <table cellpadding="0" cellspacing="0" style="display:inline-table">
              <tr>
                <td style="background:#fff;border-radius:50%;width:44px;height:44px;text-align:center;vertical-align:middle;font-size:22px;line-height:44px">📍</td>
                <td style="padding-left:12px;vertical-align:middle"><span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">Gigs4You</span></td>
              </tr>
            </table>
            <p style="color:rgba(255,255,255,0.8);font-size:12px;margin:10px 0 0">Connecting talent with opportunity across Kenya</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px">
            <h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700">Your login verification code</h2>
            <p style="margin:0 0 28px;color:#4B5563;font-size:14px;line-height:1.6">
              Use the code below to complete your sign-in. It expires in <strong>10 minutes</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
              <tr>
                <td align="center" style="background:#F0FDF4;border:2px dashed #4ADE80;border-radius:12px;padding:24px">
                  <span style="font-size:42px;font-weight:900;letter-spacing:12px;color:#166534;font-family:monospace">${code}</span>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.6">
              Request time: <strong>${dateStr}</strong><br>
              If you did not attempt to sign in, your account may be compromised — contact support immediately.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:20px 32px;text-align:center">
            <p style="margin:0;color:#9CA3AF;font-size:11px">
              © ${now.getFullYear()} Gigs4You · Nairobi, Kenya<br>
              <span style="color:#D1D5DB">Never share this code with anyone.</span>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    }).catch(() => {});

    return challengeToken;
  }

  async verifyLoginOtp(challengeToken: string, code: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(challengeToken);
    } catch {
      throw new UnauthorizedException('Challenge token expired. Please log in again.');
    }
    if (payload?.purpose !== 'otp_challenge' || !payload?.sub) {
      throw new UnauthorizedException('Invalid challenge token.');
    }

    const attemptKey = this.getLoginOtpAttemptKey(payload.sub);
    const attempts   = Number(await this.redis.get(attemptKey) ?? 0);
    if (attempts >= this.maxOtpAttempts) {
      await this.redis.del(this.getLoginOtpKey(payload.sub));
      await this.redis.del(attemptKey);
      throw new UnauthorizedException('Too many incorrect attempts — log in again to receive a new code.');
    }

    const stored = await this.redis.get(this.getLoginOtpKey(payload.sub));
    if (!stored || stored !== code.trim()) {
      const newCount = await this.redis.incr(attemptKey);
      if (newCount === 1) await this.redis.expire(attemptKey, this.otpTtlSeconds);
      if (newCount >= this.maxOtpAttempts) {
        await this.redis.del(this.getLoginOtpKey(payload.sub));
        await this.redis.del(attemptKey);
        throw new UnauthorizedException('Too many incorrect attempts — log in again to receive a new code.');
      }
      throw new UnauthorizedException('Invalid or expired verification code.');
    }

    await this.redis.del(this.getLoginOtpKey(payload.sub));
    await this.redis.del(attemptKey);
    const user = await this.usersService.findById(payload.sub);
    return this.signToken(user);
  }

  private getPasswordResetCodeKey(otp: string) {
    return `auth:otp:code:${otp}`;
  }

  private resolvePublicRole(role?: string): UserRole {
    if (!role) return UserRole.WORKER;
    if (!PUBLIC_ROLES.has(role)) {
      throw new BadRequestException(
        `Public registration role must be one of: ${Array.from(PUBLIC_ROLES).join(', ')}`,
      );
    }
    return role as UserRole;
  }

  private shouldCreateAgentProfile(role?: string): boolean {
    return !!role && FIELD_ROLES.has(role);
  }

  private getPasswordResetUserKey(userId: string) {
    return `auth:otp:user:${userId}`;
  }

  private getRefreshSessionKey(jti: string) {
    return `auth:refresh:${jti}`;
  }

  private parseDurationToSeconds(value: string, fallback: number) {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }

    const match = trimmed.match(/^(\d+)([smhd])$/i);
    if (!match) {
      return fallback;
    }

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    }[unit];

    return multiplier ? amount * multiplier : fallback;
  }

  async forgotPassword(identifier: string): Promise<{ message: string }> {
    const user = await this.usersService.findByIdentifier(identifier);
    if (!user || !user.isActive) {
      return { message: 'If that account exists, a reset code has been sent.' };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const existingOtp = await this.redis.get(this.getPasswordResetUserKey(user.id));
    if (existingOtp) {
      await this.redis.del(this.getPasswordResetCodeKey(existingOtp));
    }

    await this.redis.set(
      this.getPasswordResetCodeKey(otp),
      user.id,
      'EX',
      this.passwordResetTtlSeconds,
    );
    await this.redis.set(
      this.getPasswordResetUserKey(user.id),
      otp,
      'EX',
      this.passwordResetTtlSeconds,
    );

    const message = `Your Gigs4You password reset code is: ${otp}. Valid for 15 minutes. Do not share.`;

    await this.notificationService?.sendSms(user.phone, message).catch(() => {});
    if (user.email) {
      await this.notificationService?.sendEmail({
        to: user.email,
        subject: 'Gigs4You - Password Reset Code',
        text: message,
        html: `<p>Your password reset code is: <strong style="font-size:24px">${otp}</strong></p><p>Valid for 15 minutes. If you did not request this, ignore this email.</p>`,
      }).catch(() => {});
    }

    return { message: 'If that account exists, a reset code has been sent.' };
  }

  async resetPassword(otp: string, newPassword: string): Promise<{ message: string }> {
    const userId = await this.redis.get(this.getPasswordResetCodeKey(otp));
    if (!userId) {
      throw new BadRequestException('Reset code has expired. Please request a new one.');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.usersService.update(userId, { password: hashed } as any);
    await this.redis.del(this.getPasswordResetCodeKey(otp));
    await this.redis.del(this.getPasswordResetUserKey(userId));

    return { message: 'Password reset successfully. You can now log in.' };
  }

  // ── Payment OTP (high-value Cathy withdrawals) ───────────────────────────────

  private getPaymentOtpKey(userId: string) { return `pay_otp:${userId}`; }

  async sendPaymentOtp(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(this.getPaymentOtpKey(userId), code, 'EX', 600); // 10 min TTL

    const message =
      `Your Gigs4You payment verification code is: ${code}. ` +
      `Valid for 10 minutes. Do not share this code.`;

    if (user.phone) {
      await this.notificationService?.sendSms(user.phone, message).catch(() => {});
    }
    await this.notificationService?.sendEmail({
      to: user.email,
      subject: 'Gigs4You — Payment verification code',
      text: message,
      html: `<p>${message}</p>`,
    }).catch(() => {});
  }

  async verifyPaymentOtp(userId: string, code: string): Promise<boolean> {
    const stored = await this.redis.get(this.getPaymentOtpKey(userId));
    if (!stored || stored !== code.trim()) return false;
    await this.redis.del(this.getPaymentOtpKey(userId)); // single use
    return true;
  }
}
