import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { Cached } from '../common/decorators/cached.decorator';

const MANAGERS = [
  UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER,
  UserRole.SUPERVISOR, UserRole.EMPLOYER,
];

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('summary')
  @Roles(...MANAGERS)
  @Cached(120)
  @ApiOperation({ summary: 'Dashboard summary KPIs' })
  summary(@CurrentUser() user: any, @Query('orgId') orgId?: string) {
    const scope = user.role === UserRole.SUPER_ADMIN ? orgId : user.orgId;
    return this.reports.summary(scope);
  }

  @Get('tasks')
  @Roles(...MANAGERS)
  @Cached(120)
  @ApiOperation({ summary: 'Task status report' })
  taskReport(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('agentId') agentId?: string,
  ) {
    const orgId = user.role === UserRole.SUPER_ADMIN ? undefined : user.orgId;
    return this.reports.taskReport(from, to, agentId, orgId);
  }

  @Get('attendance')
  @Roles(...MANAGERS)
  @Cached(120)
  @ApiOperation({ summary: 'Agent attendance/GPS check-in report' })
  attendanceReport(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const orgId = user.role === UserRole.SUPER_ADMIN ? undefined : user.orgId;
    return this.reports.attendanceReport(from, to, orgId);
  }

  @Get('financial')
  @Roles(...MANAGERS)
  @Cached(120)
  @ApiOperation({ summary: 'Wallet and payment transactions' })
  financialReport(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const orgId = user.role === UserRole.SUPER_ADMIN ? undefined : user.orgId;
    return this.reports.financialReport(from, to, orgId);
  }

  @Get('logins')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Cached(60)
  @ApiOperation({ summary: 'User login logs' })
  loginReport(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const scope = user.role === UserRole.SUPER_ADMIN ? undefined : user.orgId;
    return this.reports.loginReport(from, to, scope);
  }

  @Get('agent-performance')
  @Roles(...MANAGERS)
  @Cached(120)
  @ApiOperation({ summary: 'Per-agent performance leaderboard' })
  agentPerformance(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const orgId = user.role === UserRole.SUPER_ADMIN ? undefined : user.orgId;
    return this.reports.agentPerformanceReport(from, to, orgId);
  }

  // ── Super-admin system reports ──────────────────
  @Get('system-usage')
  @Roles(UserRole.SUPER_ADMIN)
  @Cached(300)
  @ApiOperation({ summary: 'Platform login traffic (hourly/daily/monthly)' })
  systemUsage(@Query('period') period: 'hourly'|'daily'|'monthly' = 'daily') {
    return this.reports.systemUsageReport(period);
  }

  @Get('system-overview')
  @Roles(UserRole.SUPER_ADMIN)
  @Cached(300)
  @ApiOperation({ summary: 'Platform-wide overview KPIs' })
  systemOverview() {
    return this.reports.systemOverviewReport();
  }

  @Get('org-comparison')
  @Roles(UserRole.SUPER_ADMIN)
  @Cached(300)
  @ApiOperation({ summary: 'KPI comparison across all organisations' })
  orgComparison() {
    return this.reports.orgComparisonReport();
  }

  @Get('worker-pipeline')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Cached(120)
  @ApiOperation({ summary: 'Worker registration → application → hire funnel' })
  workerPipeline(@CurrentUser() user: any, @Query('orgId') orgId?: string) {
    const scope = user.role === UserRole.SUPER_ADMIN ? orgId : user.orgId;
    return this.reports.workerPipelineReport(scope);
  }

  // ── Agent self-performance ────────────────────────
  @Get('my-performance')
  @Roles(UserRole.AGENT, UserRole.WORKER, ...MANAGERS)
  @Cached(60)
  @ApiOperation({ summary: 'Personal performance report for the logged-in agent' })
  async myPerformance(@CurrentUser() user: any) {
    const agentId = await this.reports.resolveAgentId(user.userId);
    if (!agentId) return { error: 'No agent record found' };
    return this.reports.myPerformanceReport(agentId);
  }

  // ── GPS analytics (supervisor / admin / manager) ──
  @Get('gps-analytics')
  @Roles(...MANAGERS)
  @Cached(60)
  @ApiOperation({ summary: 'GPS activity, pings and anomalies per agent' })
  gpsAnalytics(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to')   to?: string,
  ) {
    const orgId = user.role === UserRole.SUPER_ADMIN ? undefined : user.orgId;
    return this.reports.gpsAnalyticsReport(orgId, from, to);
  }

  // ── Jobs analytics (employer / admin / manager) ───
  @Get('jobs-analytics')
  @Roles(...MANAGERS)
  @Cached(60)
  @ApiOperation({ summary: 'Job applications funnel and hiring metrics' })
  jobsAnalytics(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to')   to?: string,
  ) {
    const orgId    = user.role === UserRole.SUPER_ADMIN ? undefined : user.orgId;
    const byPoster = user.role === UserRole.EMPLOYER ? user.userId : undefined;
    return this.reports.jobsAnalyticsReport(byPoster, orgId, from, to);
  }

  // ── Compliance / KYC ──────────────────────────────
  @Get('compliance')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Cached(120)
  @ApiOperation({ summary: 'KYC verification and GPS fraud flags' })
  compliance(@CurrentUser() user: any) {
    const orgId = user.role === UserRole.SUPER_ADMIN ? undefined : user.orgId;
    return this.reports.complianceReport(orgId);
  }

  // ── Platform financial (super_admin) ──────────────
  @Get('platform-financial')
  @Roles(UserRole.SUPER_ADMIN)
  @Cached(300)
  @ApiOperation({ summary: 'Platform-wide transaction summary and monthly trend' })
  platformFinancial() {
    return this.reports.platformFinancialReport();
  }
}
