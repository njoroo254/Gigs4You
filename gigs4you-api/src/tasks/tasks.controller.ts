import {
  Controller, Get, Post, Patch, Delete, Body,
  Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { AiService } from '../ai/ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { AgentsService } from '../agents/agents.service';

const MANAGERS = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.EMPLOYER];

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private tasksService: TasksService,
    private agentsService: AgentsService,
    private aiService: AiService,
  ) {}

  // ── POST /tasks/parse-intent — AI-extract fields from a description ──
  @Post('parse-intent')
  @Roles(...MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI: parse a free-text task description into checklist, priority, duration and skills' })
  async parseTaskIntent(@Body('description') description: string) {
    const _empty = { checklist: [], priority: 'medium', estimatedMinutes: null, requiredSkills: [], confidence: 0 };
    if (!description || description.length < 10) return _empty;
    const result = await this.aiService.parseTaskIntent(description);
    return result ?? _empty;
  }

  // ── POST /tasks ───────────────────────────────────
  @Post()
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Create and assign a task to an agent' })
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: any) {
    return this.tasksService.create(dto, user.userId, user.orgId);
  }

  // ── GET /tasks ────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'List tasks. Agents see only theirs; managers see org-scoped.' })
  async findAll(
    @CurrentUser() user: any,
    @Query('organisationId') orgFilter?: string,
  ) {
    if (user.role === UserRole.AGENT) {
      const agent = await this.agentsService.findByUserId(user.userId);
      if (!agent) return [];
      return this.tasksService.findAllForAgent(agent.id);
    }
    // super_admin: honour explicit organisationId query param; no param = all-platform view
    // all other roles: always scoped to their own org regardless of query param
    const organisationId = user.role === UserRole.SUPER_ADMIN
      ? (orgFilter || undefined)
      : user.orgId;
    return this.tasksService.findAll({ organisationId });
  }

  // ── GET /tasks/today ──────────────────────────────
  @Get('today')
  @ApiOperation({ summary: "Get task list for the logged-in agent" })
  async getToday(@CurrentUser() user: any) {
    const agent = await this.agentsService.findByUserId(user.userId);
    if (!agent) return [];
    return this.tasksService.findTodayForAgent(agent.id);
  }

  // ── GET /tasks/stats ──────────────────────────────
  @Get('stats')
  @ApiOperation({ summary: 'Task completion stats' })
  async getStats(
    @CurrentUser() user: any,
    @Query('organisationId') orgFilter?: string,
  ) {
    if (user.role === UserRole.AGENT) {
      return this.tasksService.getStats({ userId: user.userId });
    }
    return this.tasksService.getStats({
      organisationId: user.role === UserRole.SUPER_ADMIN
        ? (orgFilter || undefined)
        : user.orgId,
    });
  }

  // ── PATCH /tasks/:id — update fields (manager) ───
  @Patch(':id')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Update task details — manager only' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.tasksService.update(id, body);
  }

  // ── PATCH /tasks/:id/start ────────────────────────
  @Patch(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a task' })
  async start(@Param('id') id: string, @CurrentUser() user: any) {
    // BUG FIX: pass user.userId — service will resolve to agentId internally
    return this.tasksService.start(id, user.userId);
  }

  // ── PATCH /tasks/:id/complete ─────────────────────
  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a task with proof' })
  async complete(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: CompleteTaskDto,
  ) {
    return this.tasksService.complete(id, user.userId, dto);
  }

  // ── PATCH /tasks/:id/fail ─────────────────────────
  @Patch(':id/fail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a task as failed' })
  async fail(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('reason') reason: string,
  ) {
    return this.tasksService.fail(id, user.userId, reason || 'No reason given');
  }

  // ── DELETE /tasks/:id — cancel ────────────────────
  @Delete(':id')
  @Roles(...MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel/delete a task' })
  cancel(@Param('id') id: string) {
    return this.tasksService.cancel(id);
  }

  // ── PATCH /tasks/:id/accept — agent accepts ───────
  @Patch(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Agent accepts an assigned task' })
  accept(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tasksService.acceptTask(id, user.userId);
  }

  // ── PATCH /tasks/:id/decline — agent declines ─────
  @Patch(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Agent declines a task with optional reason' })
  decline(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('reason') reason?: string,
  ) {
    return this.tasksService.declineTask(id, user.userId, reason);
  }

  // ── PATCH /tasks/:id/approve — manager approves + pays ──
  @Patch(':id/approve')
  @Roles(...MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manager approves a completed task and optionally pays the agent' })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('paymentAmount') paymentAmount?: number,
  ) {
    return this.tasksService.approveAndPay(id, user.userId, paymentAmount);
  }

  // ── GET /tasks/overdue-acceptances — admin check ──
  @Get('overdue-acceptances')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Get tasks where agent has not accepted within deadline' })
  overdueAcceptances() {
    return this.tasksService.checkOverdueAcceptances();
  }

  // ── GET /tasks/:id ────────────────────────────────
  @Get(':id([0-9a-fA-F-]{36})')
  findOne(@Param('id') id: string) {
    return this.tasksService.findById(id);
  }
}
