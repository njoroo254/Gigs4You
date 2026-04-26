import {
  Controller, Get, Patch, Post, Body, Param,
  Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsArray, IsNumber } from 'class-validator';
import { WorkersService } from './workers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AgentsService } from '../agents/agents.service';
import { ApplicationsService } from '../applications/applications.service';
import { JobsService } from '../jobs/jobs.service';

class UpdateProfileDto {
  @IsString() @IsOptional() bio?: string;
  @IsString() @IsOptional() location?: string;
  @IsString() @IsOptional() county?: string;
  @IsBoolean() @IsOptional() isAvailable?: boolean;
  @IsString() @IsOptional() availabilityNote?: string;
  @IsNumber() @IsOptional() dailyRate?: number;
  @IsNumber() @IsOptional() hourlyRate?: number;
  @IsString() @IsOptional() mpesaPhone?: string;
  @IsArray() @IsOptional() portfolioUrls?: string[];
  @IsArray() @IsOptional() certificationNames?: string[];
}

class UpdateSkillsDto {
  @IsArray() skillIds: string[];
}

@ApiTags('Workers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workers')
export class WorkersController {
  constructor(
    private workersService: WorkersService,
    private agentsService: AgentsService,
    private applicationsService: ApplicationsService,
    private jobsService: JobsService,
  ) {}

  // ── GET /workers/me — works for both agents and workers ──
  @Get('me')
  @ApiOperation({ summary: 'Get my CV/worker profile' })
  async getMyProfile(@CurrentUser() user: any) {
    // Try agent path first
    const agent = await this.agentsService.findByUserId(user.userId).catch(() => null);
    if (agent) return this.workersService.getOrCreateProfile(agent.id);
    // Fallback: worker (freelancer) with no agent record
    return this.workersService.getOrCreateProfileForUser(user.userId);
  }

  // ── PATCH /workers/me — update my profile ────────
  @Patch('me')
  @ApiOperation({ summary: 'Update my worker profile (bio, rates, availability)' })
  async updateMyProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    const agent = await this.agentsService.findByUserId(user.userId).catch(() => null);
    return agent
      ? this.workersService.updateProfile(agent.id, dto)
      : this.workersService.updateProfileForUser(user.userId, dto);
  }

  // ── POST /workers/me/avatar-upload — receive URL + update profile ──
  @Post('me/avatar-upload')
  @HttpCode(200)
  @ApiOperation({ summary: 'Upload avatar via URL (client uploads to MinIO, sends back URL)' })
  async uploadAvatar(@CurrentUser() user: any, @Body() body: any) {
    const url = body.url || body.avatarUrl;
    if (!url) return { error: 'url required' };
    const agent = await this.agentsService.findByUserId(user.userId).catch(() => null);
    if (agent) {
      await this.workersService.updateProfile(agent.id, { avatarUrl: url } as any);
    } else {
      await this.workersService.updateProfileForUser(user.userId, { avatarUrl: url } as any);
    }
    return { avatarUrl: url };
  }

  // ── POST /workers/me/avatar — update profile photo URL ─
  @Post('me/avatar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update profile photo URL' })
  async updateAvatar(@CurrentUser() user: any, @Body('avatarUrl') avatarUrl: string) {
    const agent = await this.agentsService.findByUserId(user.userId).catch(() => null);
    if (agent) {
      await this.workersService.updateProfile(agent.id, { avatarUrl } as any);
    } else {
      await this.workersService.updateProfileForUser(user.userId, { avatarUrl } as any);
    }
    return { avatarUrl };
  }

  // ── PATCH /workers/me/skills — update my skills ──
  @Patch('me/skills')
  @ApiOperation({ summary: 'Set my skills (replaces existing list)' })
  async updateMySkills(@CurrentUser() user: any, @Body() dto: UpdateSkillsDto) {
    const agent = await this.agentsService.findByUserId(user.userId).catch(() => null);
    return agent
      ? this.workersService.updateSkills(agent.id, dto.skillIds)
      : this.workersService.updateSkillsForUser(user.userId, dto.skillIds);
  }

  // ── GET /workers/search — find workers ───────────
  @Get('search')
  @ApiOperation({ summary: 'Search workers by skill, location, availability' })
  search(
    @Query('skillIds') skillIds?: string,
    @Query('category') category?: string,
    @Query('location') location?: string,
    @Query('available') available?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.workersService.searchWorkers({
      skillIds: skillIds ? skillIds.split(',') : undefined,
      category,
      location,
      isAvailable: available === 'true' ? true : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  // ── GET /workers/leaderboard ──────────────────────
  @Get('leaderboard')
  @ApiOperation({ summary: 'Top workers by completed jobs and rating' })
  leaderboard(@Query('limit') limit?: string) {
    return this.workersService.getLeaderboard(limit ? parseInt(limit) : 10);
  }

  // ── GET /workers/:agentId — public profile ───────
  @Get(':agentId([0-9a-fA-F-]{36})')
  @ApiOperation({ summary: 'Get a worker public profile by agent ID' })
  getProfile(@Param('agentId') agentId: string) {
    return this.workersService.findByAgentId(agentId);
  }

  // ── GET /workers/dashboard — worker dashboard ────
  @Get('dashboard')
  @ApiOperation({ summary: 'Worker dashboard with applications, past jobs, and stats' })
  async getDashboard(@CurrentUser() user: any) {
    // Get applications (both agent and worker applications)
    const agent = await this.agentsService.findByUserId(user.userId).catch(() => null);
    let applications: any[] = [];
    if (agent) {
      applications = await this.applicationsService.findByAgent(agent.id);
    }
    if (applications.length === 0) {
      applications = await this.applicationsService.findByApplicant(user.userId);
    }

    // Get past jobs (completed jobs assigned to this worker)
    const pastJobs = await this.jobsService.findByAssignedWorker(user.userId);

    // Get worker profile/stats
    const profile = await this.workersService.getOrCreateProfileForUser(user.userId);

    return {
      profile,
      applications: {
        total: applications.length,
        pending: applications.filter(a => a.status === 'pending').length,
        accepted: applications.filter(a => a.status === 'accepted').length,
        rejected: applications.filter(a => a.status === 'rejected').length,
        list: applications.slice(0, 10), // Recent applications
      },
      pastJobs: {
        total: pastJobs.length,
        list: pastJobs.slice(0, 5), // Recent completed jobs
      },
    };
  }

  // ── GET /workers/my-applications — worker applications ──
  @Get('my-applications')
  @ApiOperation({ summary: 'My job applications (worker view)' })
  async getMyApplications(@CurrentUser() user: any) {
    // Try agent applications first
    const agent = await this.agentsService.findByUserId(user.userId).catch(() => null);
    if (agent) {
      const agentApps = await this.applicationsService.findByAgent(agent.id);
      if (agentApps.length > 0) return agentApps;
    }

    // Fallback to applicant applications
    return this.applicationsService.findByApplicant(user.userId);
  }

  // ── GET /workers/my-past-jobs — completed jobs ──────
  @Get('my-past-jobs')
  @ApiOperation({ summary: 'Jobs I have completed' })
  async getMyPastJobs(@CurrentUser() user: any) {
    return this.jobsService.findByAssignedWorker(user.userId);
  }
}
