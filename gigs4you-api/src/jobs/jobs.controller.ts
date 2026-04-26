import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional,
         IsBoolean, IsArray, IsEnum } from 'class-validator';
import { JobsService, CreateJobDto } from './jobs.service';
import { ApplicationsService } from '../applications/applications.service';
import { AiService } from '../ai/ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { AgentsService } from '../agents/agents.service';
import { SubscriptionGuard } from '../billing/subscription-guard.service';

class ApplyJobDto {
  @IsString() @IsOptional() coverNote?: string;
}

class CompleteJobDto {
  @IsNumber() @IsOptional() rating?: number;
}

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('jobs')
export class JobsController {
  constructor(
    private jobsService: JobsService,
    private applicationsService: ApplicationsService,
    private agentsService: AgentsService,
    private aiService: AiService,
    private subscriptionGuard: SubscriptionGuard,
  ) {}

  // ── POST /jobs — create a job (manager/admin) ────
  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Post a new job listing' })
  async create(@Body() dto: CreateJobDto, @CurrentUser() user: any) {
    const orgId = user.orgId;
    if (orgId) {
      const currentCount = await this.jobsService.countByOrg(orgId);
      await this.subscriptionGuard.enforceJobCreation(orgId, currentCount);
    }
    return this.jobsService.create(dto, user.userId);
  }

  // ── GET /jobs — browse jobs (agents browse) ──────
  @Get()
  @ApiOperation({ summary: 'Browse open jobs with filters' })
  findAll(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('urgent') urgent?: string,
    @Query('county') county?: string,
    @Query('budgetMin') budgetMin?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('mine') mine?: string,
    @CurrentUser() user?: any,
  ) {
    return this.jobsService.findAll({
      category,
      search,
      isUrgent: urgent === 'true' ? true : undefined,
      county,
      budgetMin: budgetMin ? Number(budgetMin) : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      postedById: mine === 'true' ? user?.userId : undefined,
    });
  }

  // ── POST /jobs/parse-intent — AI-extract fields from a description ──
  @Post('parse-intent')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI: parse a free-text job description into structured fields (non-blocking suggestion)' })
  async parseJobIntent(
    @Body('description') description: string,
    @Body('county') county?: string,
  ) {
    if (!description || description.length < 10) {
      return { suggestedTitle: null, skills: [], budgetMin: null, budgetMax: null,
               county: null, isUrgent: false, deadline: null, confidence: 0 };
    }
    const result = await this.aiService.parseJobIntent(description, county ? { county } : undefined);
    return result ?? { suggestedTitle: null, skills: [], budgetMin: null, budgetMax: null,
                       county: null, isUrgent: false, deadline: null, confidence: 0 };
  }

  // ── POST /jobs/suggest-pricing — AI budget suggestion ──
  @Post('suggest-pricing')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI: suggest a budget range for a job based on description, category and location' })
  async suggestPricing(
    @Body('description') description: string,
    @Body('category') category?: string,
    @Body('county') county?: string,
    @Body('isUrgent') isUrgent?: boolean,
  ) {
    const empty = { budgetMin: null, budgetMax: null, marketRate: null,
                    rationale: 'AI pricing unavailable.', confidence: 0 };
    if (!description || description.length < 10) return empty;
    const result = await this.aiService.suggestJobPricing(
      description,
      category ?? 'general',
      county ?? 'Nairobi',
      isUrgent,
    );
    return result ?? empty;
  }

  // ── GET /jobs/stats ──────────────────────────────
  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Job marketplace stats for dashboard' })
  getStats() {
    return this.jobsService.getStats();
  }

  // ── GET /jobs/my-postings — manager sees their posts ──
  @Get('my-postings')
  @ApiOperation({ summary: 'Jobs I have posted' })
  getMyPostings(@CurrentUser() user: any) {
    return this.jobsService.findByPostedBy(user.userId);
  }

  // ── GET /jobs/my-applications — see my applications ──
  @Get('my-applications')
  @ApiOperation({ summary: 'Jobs I have applied for (works for both agents and workers)' })
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

  // ── PATCH /jobs/:id — update job fields ─────────
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Update an existing job listing' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.jobsService.update(id, body);
  }

  // ── PATCH /jobs/:id/cancel — cancel a job ────────
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Cancel an open job listing' })
  cancel(@Param('id') id: string) {
    return this.jobsService.cancel(id);
  }

  // ── GET /jobs/:id ────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Get job details' })
  findOne(@Param('id') id: string) {
    return this.jobsService.findById(id);
  }

  // ── POST /jobs/:id/apply — worker applies (B2C marketplace only) ──
  @Post(':id/apply')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.WORKER)
  @ApiOperation({ summary: 'Apply for a job (external workers only, not internal agents)' })
  async apply(
    @Param('id') jobId: string,
    @Body() dto: ApplyJobDto,
    @CurrentUser() user: any,
  ) {
    // Jobs are for external workers only (B2C marketplace)
    return this.applicationsService.apply(jobId, user.userId, dto.coverNote);
  }

  // ── GET /jobs/:id/applications — manager sees applicants ──
  @Get(':id/applications')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'View all applicants for a job' })
  getApplications(@Param('id') jobId: string) {
    return this.applicationsService.findByJob(jobId);
  }

  // ── PATCH /jobs/:id/assign/:assigneeId — hire external worker (B2C only) ──
  @Patch(':id/assign/:assigneeId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Hire an external worker for a job (B2C marketplace - not for internal agents)' })
  assign(
    @Param('id') jobId: string,
    @Param('assigneeId') assigneeId: string,
    @CurrentUser() user: any,
  ) {
    // Jobs are for external workers only - assignWorkerId stores the hired worker
    return this.jobsService.assignWorker(jobId, assigneeId, user.userId);
  }

  // ── PATCH /jobs/:id/complete — mark done + pay ───
  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Mark job as completed and credit worker wallet' })
  complete(
    @Param('id') jobId: string,
    @Body() dto: CompleteJobDto,
    @CurrentUser() user: any,
  ) {
    return this.jobsService.completeJob(jobId, user.userId, dto.rating);
  }

  // ── PATCH /jobs/applications/:applicationId/shortlist — move to shortlist ──
  @Patch('applications/:applicationId/shortlist')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Shortlist a job application' })
  shortlistApplication(@Param('applicationId') applicationId: string) {
    return this.applicationsService.shortlist(applicationId);
  }

  // ── PATCH /jobs/applications/:applicationId/accept — accept an applicant ──
  @Patch('applications/:applicationId/accept')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Accept a shortlisted applicant (moves to accepted, others rejected)' })
  acceptApplication(@Param('applicationId') applicationId: string) {
    return this.applicationsService.accept(applicationId);
  }

  // ── PATCH /jobs/applications/:applicationId/reject — reject an applicant ──
  @Patch('applications/:applicationId/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Reject a job application' })
  rejectApplication(
    @Param('applicationId') applicationId: string,
    @Body('reason') reason?: string,
  ) {
    return this.applicationsService.reject(applicationId, reason);
  }

  // ── PATCH /jobs/applications/:applicationId/withdraw — withdraw application ──
  @Patch('applications/:applicationId/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw my job application (if still pending)' })
  async withdrawApplication(
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: any,
  ) {
    // Get the applicant ID (could be agent or worker)
    const agent = await this.agentsService.findByUserId(user.userId).catch(() => null);
    const applicantId = agent ? agent.id : user.userId;

    await this.applicationsService.withdrawApplication(applicationId, applicantId);
    return { message: 'Application withdrawn successfully' };
  }

  // ── PATCH /jobs/applications/:applicationId — update application ──
  @Patch('applications/:applicationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update my job application (if still pending)' })
  async updateApplication(
    @Param('applicationId') applicationId: string,
    @Body() dto: ApplyJobDto,
    @CurrentUser() user: any,
  ) {
    // Get the applicant ID (could be agent or worker)
    const agent = await this.agentsService.findByUserId(user.userId).catch(() => null);
    const applicantId = agent ? agent.id : user.userId;

    return this.applicationsService.updateApplication(applicationId, applicantId, {
      coverNote: dto.coverNote,
    });
  }
}
