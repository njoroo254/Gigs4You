import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';

const MANAGERS = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.EMPLOYER];

@ApiTags('Matching')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('matching')
export class MatchingController {
  constructor(private svc: MatchingService) {}

  @Get('jobs/:jobId/candidates')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'AI: get best matching agents for a job' })
  candidates(@Param('jobId') jobId: string, @Query('limit') limit?: string) {
    return this.svc.recommendForJob(jobId, limit ? parseInt(limit) : 10);
  }

  @Get('jobs/:jobId/predict-time')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'AI: predict job completion time' })
  predictTime(@Param('jobId') jobId: string, @Query('agentId') agentId?: string) {
    return this.svc.predictCompletionTime(jobId, agentId);
  }

  @Get('workers/recommended-jobs')
  @ApiOperation({ summary: 'AI: get recommended jobs for the logged-in worker/agent' })
  recommendedJobs(@CurrentUser() user: any) {
    return this.svc.recommendJobsForWorker(user.userId);
  }

  @Get('analytics/efficiency')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'AI: agent efficiency analytics' })
  efficiency(@CurrentUser() user: any, @Query('orgId') orgId?: string) {
    const scope = user.role === UserRole.SUPER_ADMIN ? orgId : user.orgId;
    return this.svc.agentEfficiencyReport(scope);
  }
}
