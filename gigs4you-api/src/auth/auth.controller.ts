import {
  Controller, Post, Patch, Delete, Body, HttpCode, HttpStatus, Req,
  UseGuards, Optional,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { PushService } from '../push/push.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    @Optional() private pushService: PushService,
  ) {}

  // ── PATCH /auth/me — update non-sensitive account fields ──────────
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update own account name (email & phone require verification — use /auth/request-contact-update)' })
  async updateMe(
    @CurrentUser() user: any,
    @Body() body: { name?: string },
  ) {
    const allowed: Record<string, string> = {};
    if (body.name !== undefined) allowed.name = body.name;
    return this.usersService.update(user.userId, allowed);
  }

  // ── POST /auth/verify-contact — verify account OTP after signup ───
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('verify-contact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify phone or email OTP to activate account' })
  verifyContact(
    @Body() body: { verificationToken: string; type: 'phone' | 'email'; code: string },
  ) {
    return this.authService.verifyContact(body.verificationToken, body.type, body.code);
  }

  // ── POST /auth/resend-verification — resend account OTP ───────────
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend phone or email verification OTP' })
  resendVerification(
    @Body() body: { verificationToken: string; type: 'phone' | 'email' },
  ) {
    return this.authService.resendVerificationOtp(body.verificationToken, body.type);
  }

  // ── POST /auth/request-contact-update — initiate verified contact change ──
  @Throttle({ default: { ttl: 300_000, limit: 3 } })
  @Post('request-contact-update')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP to change email or phone — OTP sent to the new contact' })
  requestContactUpdate(
    @CurrentUser() user: any,
    @Body() body: { type: 'phone' | 'email'; newValue: string },
  ) {
    return this.authService.requestContactUpdate(user.userId, body.type, body.newValue);
  }

  // ── POST /auth/verify-contact-update — apply verified contact change ──
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('verify-contact-update')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit OTP to confirm and apply email/phone change' })
  verifyContactUpdate(
    @CurrentUser() user: any,
    @Body() body: { type: 'phone' | 'email'; code: string },
  ) {
    return this.authService.verifyAndApplyContactUpdate(user.userId, body.type, body.code);
  }

  // Public registration — worker or admin (org path) only
  @Throttle({ default: { ttl: 60_000, limit: 2 } })  // 2 per minute
  @Post('register')
  @ApiOperation({ summary: 'Public registration — worker or organisation admin' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // Login with phone, email, or username
  @Throttle({ default: { ttl: 60_000, limit: 2 } })  // 2 attempts per minute
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone, email, or username + password' })
  login(@Body() dto: LoginDto, @Req() req: any) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    return this.authService.login(dto, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a valid refresh token for a new access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout — revokes the refresh token session and denylists the access token' })
  async logout(
    @CurrentUser() user: any,
    @Body() body: { refreshToken?: string },
  ) {
    await this.authService.logout(user.userId, user.jti, body.refreshToken);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 2FA OTP code and receive full access token' })
  verifyOtp(@Body() body: { challengeToken: string; code: string }) {
    return this.authService.verifyLoginOtp(body.challengeToken, body.code);
  }

  // Admin/manager creates a user within their org
  @Post('create-org-user')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Admin creates a user within their organisation' })
  createOrgUser(@Body() dto: RegisterDto, @CurrentUser() caller: any) {
    return this.authService.createOrgUser(dto, caller.orgId, caller.role);
  }


  // ── POST /auth/forgot-password ──────────────────────────────────────
  @Throttle({ default: { ttl: 300_000, limit: 3 } })  // 3 per 5 minutes
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset — sends OTP via SMS and email' })
  forgotPassword(@Body() body: { identifier: string }) {
    return this.authService.forgotPassword(body.identifier);
  }

  // ── POST /auth/reset-password ───────────────────────────────────────
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using OTP received via SMS/email' })
  resetPassword(@Body() body: { otp: string; newPassword: string }) {
    return this.authService.resetPassword(body.otp, body.newPassword);
  }

  // ── POST /auth/fcm-token — register device push token ──────────
  @Post('fcm-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Register device FCM token for push notifications' })
  async registerFcmToken(@Body() body: { token: string; deviceId?: string }, @CurrentUser() user: any) {
    await this.pushService?.registerToken(user.userId, body.token, body.deviceId).catch(() => {});
    return { message: 'Token registered' };
  }

  @Delete('fcm-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove device FCM token (on logout)' })
  async removeFcmToken(@Body() body: { token: string }, @CurrentUser() user: any) {
    await this.pushService?.removeToken(user.userId, body.token).catch(() => {});
    return { message: 'Token removed' };
  }

  // ── Payment OTP — used by Cathy for high-value withdrawal verification ──────
  // Called from the Python AI service via the internal network.
  @Post('payment-otp/send')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send payment OTP to the authenticated user (high-value Cathy withdrawals)' })
  async sendPaymentOtp(@CurrentUser() user: any) {
    await this.authService.sendPaymentOtp(user.userId);
  }

  @Post('payment-otp/verify')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a payment OTP — returns { valid: true/false }' })
  async verifyPaymentOtp(@CurrentUser() user: any, @Body('code') code: string) {
    if (!code) return { valid: false };
    const valid = await this.authService.verifyPaymentOtp(user.userId, code);
    return { valid };
  }
}
