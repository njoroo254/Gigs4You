import {
  Controller, Get, Post, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ForbiddenException, Optional,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';
import { AgentsService } from './agents.service';
import { AiService } from '../ai/ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';

class LocationDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}

@ApiTags('Agents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('agents')
export class AgentsController {
  constructor(
    private agentsService: AgentsService,
    @Optional() private aiService: AiService,
  ) {}

  // ── GET /agents — field staff only, org-scoped for non-super_admin ──
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.EMPLOYER)
  @ApiOperation({ summary: 'List agents & supervisors (org-scoped for non-super_admin)' })
  findAll(
    @CurrentUser() user: any,
    @Query('organisationId') orgFilter?: string,
  ) {
    const orgId = user.role === 'super_admin'
      ? (orgFilter || undefined)
      : user.orgId;
    return this.agentsService.findFieldStaff(orgId);
  }

  // ── GET /agents/live — real-time map data ────────
  @Get('live')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Live GPS positions of all checked-in agents' })
  getLive(
    @CurrentUser() user: any,
    @Query('organisationId') orgFilter?: string,
  ) {
    const orgId = user.role === UserRole.SUPER_ADMIN
      ? (orgFilter || undefined)
      : user.orgId;
    return this.agentsService.getLiveAgents(orgId);
  }

  // ── GET /agents/me — auto-creates agent if missing ─
  @Get('me')
  @ApiOperation({ summary: 'Get my agent profile, auto-creates if missing' })
  async getMe(@CurrentUser() user: any) {
    let agent = await this.agentsService.findByUserId(user.userId);
    if (!agent) {
      // Auto-create agent record for users registered before this fix
      agent = await this.agentsService.createForUser(user.userId, undefined, user.orgId);
    }
    return agent;
  }

  // ── POST /agents/checkin — start the day ────────
  @Post('checkin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'GPS check-in — starts the agent workday' })
  async checkIn(
    @CurrentUser() user: any,
    @Body() dto: LocationDto,
  ) {
    const agent = await this.agentsService.findByUserId(user.userId);
    if (!agent) {
      // Auto-create agent profile on first check-in
      const newAgent = await this.agentsService.createForUser(user.userId, undefined, user.orgId);
      return this.agentsService.checkIn(newAgent.id, dto.latitude, dto.longitude);
    }
    return this.agentsService.checkIn(agent.id, dto.latitude, dto.longitude);
  }

  // ── POST /agents/checkout — end the day ─────────
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'GPS check-out — ends the agent workday' })
  async checkOut(@CurrentUser() user: any) {
    const agent = await this.agentsService.findByUserId(user.userId);
    if (!agent) throw new Error('Agent not found');
    return this.agentsService.checkOut(agent.id);
  }

  // ── POST /agents/location — live ping ───────────
  @Post('location')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update live GPS location (called every 30s by app)' })
  async updateLocation(
    @CurrentUser() user: any,
    @Body() dto: LocationDto,
  ) {
    const agent = await this.agentsService.findByUserId(user.userId);
    if (!agent) throw new Error('Agent not found');
    return this.agentsService.updateLocation(agent.id, dto.latitude, dto.longitude);
  }

  // ── GET /agents/:id/narrative — AI performance summary ──
  @Get(':id/narrative')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'AI-generated 2–3 sentence performance narrative for an agent (cached 1h)' })
  async getNarrative(@Param('id') id: string, @CurrentUser() user: any) {
    const agent = await this.agentsService.findById(id);
    if (user.role !== 'super_admin' && agent.organisationId && agent.organisationId !== user.orgId) {
      throw new ForbiddenException('Access denied');
    }
    const stats = {
      name:           agent.user?.name ?? 'Agent',
      completedJobs:  agent.completedJobs ?? 0,
      currentStreak:  agent.currentStreak ?? 0,
      averageRating:  agent.averageRating ?? 0,
      level:          agent.level ?? 1,
      isAvailable:    agent.isAvailable,
    };
    const narrative = this.aiService
      ? await this.aiService.getAgentNarrative(stats, 30).catch(() => null)
      : null;
    return { agentId: id, narrative: narrative ?? 'Performance data is being compiled.' };
  }

  // ── GET /agents/:id ──────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Get agent by ID (org-scoped for non-super_admin)' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const agent = await this.agentsService.findById(id);
    // super_admin can fetch any agent; everyone else must belong to the same org
    if (user.role !== 'super_admin' && agent.organisationId && agent.organisationId !== user.orgId) {
      throw new ForbiddenException('Access denied');
    }
    return agent;
  }
}
