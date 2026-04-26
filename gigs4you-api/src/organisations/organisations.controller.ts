import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganisationsService } from './organisations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { Cached } from '../common/decorators/cached.decorator';

const SA = [UserRole.SUPER_ADMIN];
const ADMIN = [UserRole.SUPER_ADMIN, UserRole.ADMIN];
const MGMT = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYER];

@ApiTags('Organisations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organisations')
export class OrganisationsController {
  constructor(private svc: OrganisationsService) {}

  private assertOrgAccess(user: any, orgId: string) {
    // Resolve a robust organisation id from the user payload.
    const currentOrgId = user?.orgId ?? user?.organisationId ?? (user?.organisation?.id ?? null);
    if (user?.role === UserRole.SUPER_ADMIN) return;
    if (!currentOrgId || currentOrgId !== orgId) {
      throw new ForbiddenException('Not your organisation');
    }
  }

  @Post()
  @Roles(...MGMT)
  @ApiOperation({ summary: 'Create organisation. Super-admin creates for another admin; admin creates their own.' })
  create(@Body() body: any, @CurrentUser() user: any) {
    const ownerId = user.role === UserRole.SUPER_ADMIN
      ? (body?.ownerId || user.userId)
      : user.userId;
    const linkOwner = user.role !== UserRole.SUPER_ADMIN || Boolean(body?.ownerId);
    return this.svc.create(body, ownerId, linkOwner);
  }

  @Get('mine')
  @Roles(...MGMT)
  @ApiOperation({ summary: 'Organisations owned by or containing me' })
  mine(@CurrentUser() user: any) {
    return this.svc.findByOwner(user.userId);
  }

  @Get('super-admin/overview')
  @Roles(...SA)
  @Cached(60)
  @ApiOperation({ summary: 'Super-admin organisation portfolio overview' })
  superAdminOverview() {
    return this.svc.getSuperAdminOverview();
  }

  @Get('super-admin/directory')
  @Roles(...SA)
  @Cached(60)
  @ApiOperation({ summary: 'Super-admin enriched organisation directory' })
  superAdminDirectory() {
    return this.svc.findAllDetailed();
  }

  @Get('search-users')
  @Roles(...SA)
  @ApiOperation({ summary: 'Search platform users to attach to an organisation' })
  searchUsers(
    @Query('q') q?: string,
    @Query('excludeOrgId') excludeOrgId?: string,
  ) {
    return this.svc.searchUsers(q || '', excludeOrgId);
  }

  @Get()
  @Roles(...ADMIN)
  @Cached(60)
  @ApiOperation({ summary: 'All orgs — super-admin sees all, others see their accessible orgs' })
  findAll(@CurrentUser() user: any) {
    if (user.role === UserRole.SUPER_ADMIN) return this.svc.findAll();
    return this.svc.findAccessibleForUser(user);
  }

  @Get(':id/dashboard')
  @Roles(...ADMIN)
  @Cached(60)
  @ApiOperation({ summary: 'Deep org dashboard for super-admin and admins' })
  dashboard(@Param('id') id: string, @CurrentUser() user: any) {
    this.assertOrgAccess(user, id);
    return this.svc.getDashboard(id);
  }

  @Get(':id')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Get organisation details + stats' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    this.assertOrgAccess(user, id);
    const org = await this.svc.findById(id);
    const stats = await this.svc.getStats(id).catch(() => ({}));
    return { ...org, stats };
  }

  @Get(':id/members')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Get all agents and users in an organisation' })
  members(@Param('id') id: string, @CurrentUser() user: any) {
    this.assertOrgAccess(user, id);
    return this.svc.getMembers(id);
  }

  @Get(':id/stats')
  @Roles(...ADMIN)
  @Cached(60)
  @ApiOperation({ summary: 'Get KPI stats for a specific organisation' })
  stats(@Param('id') id: string, @CurrentUser() user: any) {
    this.assertOrgAccess(user, id);
    return this.svc.getStats(id);
  }

  @Patch(':id')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Update organisation — super_admin can edit any org' })
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.update(id, user.userId, body, user.role === UserRole.SUPER_ADMIN);
  }

  @Patch(':id/deactivate')
  @Roles(...SA)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Super-admin deactivates an organisation' })
  deactivate(@Param('id') id: string) {
    return this.svc.deactivate(id);
  }

  @Patch(':id/activate')
  @Roles(...SA)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Super-admin reactivates an organisation' })
  activate(@Param('id') id: string) {
    return this.svc.activate(id);
  }

  // ── Branch endpoints ──────────────────────────────────────────────────

  @Get(':id/branches')
  @Roles(...ADMIN)
  @Cached(60)
  @ApiOperation({ summary: 'List all branches of an organisation' })
  getBranches(@Param('id') id: string, @CurrentUser() user: any) {
    this.assertOrgAccess(user, id);
    return this.svc.getBranchesWithStats(id);
  }

  @Post(':id/branches')
  @Roles(...ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a branch under an organisation' })
  createBranch(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    this.assertOrgAccess(user, id);
    return this.svc.createBranch(id, body, user.userId);
  }

  @Post(':id/members/:userId')
  @Roles(...ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a user to an organisation' })
  addMember(
    @Param('id') orgId: string,
    @Param('userId') userId: string,
    @Body('role') role?: string,
  ) {
    return this.svc.addUserToOrg(orgId, userId, role);
  }

  @Post(':id/invite')
  @Roles(...ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invite an existing platform user into an organisation by phone' })
  inviteMember(@Param('id') id: string, @Body('phone') phone: string) {
    return this.svc.inviteMember(id, phone);
  }

  @Patch(':id/primary-admin')
  @Roles(...SA)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign or replace the primary admin for an organisation' })
  assignPrimaryAdmin(@Param('id') id: string, @Body('userId') userId: string) {
    return this.svc.assignPrimaryAdmin(id, userId);
  }

  @Delete(':id/members/:agentId')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Remove a member from the organisation' })
  removeMember(@Param('id') id: string, @Param('agentId') agentId: string) {
    return this.svc.removeMember(id, agentId);
  }
}
