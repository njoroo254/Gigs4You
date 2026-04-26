import { Controller, Post, Get, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';
import { GpsService } from './gps.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { AgentsService } from '../agents/agents.service';

class GpsPingDto {
  @IsNumber() latitude: number;
  @IsNumber() longitude: number;
  @IsNumber() @IsOptional() speed?: number;
  @IsNumber() @IsOptional() accuracy?: number;
}

@ApiTags('GPS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gps')
export class GpsController {
  constructor(
    private gpsService: GpsService,
    private agentsService: AgentsService,
  ) {}

  // ── POST /gps/ping — mobile app calls this every 30s ──
  @Post('ping')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log a GPS ping from the mobile app' })
  async ping(@CurrentUser() user: any, @Body() dto: GpsPingDto) {
    const agent = await this.agentsService.findByUserId(user.userId);
    if (!agent) throw new Error('Agent not found');
    return this.gpsService.logPing({ agentId: agent.id, ...dto });
  }

  // ── GET /gps/trail/:agentId — manager sees route ──
  @Get('trail/:agentId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: "Get an agent's GPS trail for the last N hours" })
  getTrail(
    @Param('agentId') agentId: string,
    @Query('hours') hours: number = 8,
  ) {
    return this.gpsService.getTrail(agentId, Number(hours));
  }

  // ── GET /gps/flagged — fraud review ──────────────
  @Get('flagged')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'List all flagged GPS pings for fraud review' })
  getFlagged() {
    return this.gpsService.getFlagged();
  }
}
