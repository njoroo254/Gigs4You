import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DisputesService, CreateDisputeDto, ResolveDisputeDto } from './disputes.service';
import { DisputeStatus, DisputeType } from './dispute.entity';
import { UserRole } from '../users/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  // ── File a dispute (any authenticated user) ───────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: any, @Body() dto: CreateDisputeDto) {
    return this.disputesService.create(req.user.userId, dto);
  }

  // ── My disputes (both filed by me and against me) ─────────────────────────

  @Get('mine')
  mine(@Req() req: any, @Query('limit') limit?: string) {
    return this.disputesService.findForUser(req.user.userId, limit ? +limit : 20);
  }

  // ── Org disputes (admin/manager) ──────────────────────────────────────────

  @Get('org')
  orgDisputes(@Req() req: any, @Query('limit') limit?: string) {
    const orgId = req.user.orgId;
    if (!orgId) return [];
    return this.disputesService.findForOrg(orgId, limit ? +limit : 50);
  }

  // ── Single dispute ────────────────────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.disputesService.findById(id);
  }

  // ── Admin: list all disputes ──────────────────────────────────────────────

  @Get()
  findAll(
    @Req() req: any,
    @Query('status') status?: DisputeStatus,
    @Query('type')   type?: DisputeType,
    @Query('limit')  limit?: string,
  ) {
    const role: UserRole = req.user.role;
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(role)) {
      // non-admin falls through to their own disputes
      return this.disputesService.findForUser(req.user.userId, limit ? +limit : 20);
    }
    return this.disputesService.findAll({ status, type, limit: limit ? +limit : 50 });
  }

  // ── Admin: stats ──────────────────────────────────────────────────────────

  @Get('admin/stats')
  stats(@Req() req: any) {
    const role: UserRole = req.user.role;
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(role)) {
      return { error: 'Forbidden' };
    }
    return this.disputesService.getStats();
  }

  // ── Admin: take under review ──────────────────────────────────────────────

  @Patch(':id/review')
  @HttpCode(HttpStatus.OK)
  takeUnderReview(@Param('id') id: string, @Req() req: any) {
    return this.disputesService.takeUnderReview(id, req.user.userId);
  }

  // ── Admin: resolve ────────────────────────────────────────────────────────

  @Patch(':id/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(@Param('id') id: string, @Req() req: any, @Body() dto: ResolveDisputeDto) {
    return this.disputesService.resolve(id, req.user.userId, dto);
  }

  // ── Admin: close ──────────────────────────────────────────────────────────

  @Patch(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@Param('id') id: string, @Req() req: any, @Body('reason') reason: string) {
    return this.disputesService.close(id, req.user.userId, reason);
  }
}
