import { Controller, Get, Post, Param, Patch, Body, UseGuards, Query, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from './user.entity';

const MANAGERS = [
  UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYER,
];

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  /**
   * GET /users
   * - super_admin → ALL users across all orgs (optionally filter with ?orgId=xxx)
   * - admin/manager → only their own org's users
   */
  @Get()
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'List users. super_admin sees all orgs, others see own org.' })
  findAll(
    @CurrentUser() user: any,
    @Query('orgId') orgId?: string,
  ) {
    if (user.role === UserRole.SUPER_ADMIN) {
      // SA can optionally filter by a specific org, or get everyone
      return this.usersService.findAll(orgId || undefined);
    }
    // All other roles see only their org
    return this.usersService.findAll(user.orgId);
  }

  @Get(':id')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Get a single user by ID — must be in caller\'s org (super_admin exempt)' })
  async findOne(@Param('id') id: string, @CurrentUser() caller: any) {
    const target = await this.usersService.findById(id);
    if (!target) throw new NotFoundException('User not found');
    if (caller.role !== UserRole.SUPER_ADMIN && target.organisationId !== caller.orgId) {
      throw new ForbiddenException('Access denied — user belongs to a different organisation');
    }
    return target;
  }

  @Patch(':id/permissions')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update granular permissions for a user in your org' })
  async updatePermissions(@Param('id') id: string, @Body() permissions: Record<string, boolean>, @CurrentUser() caller: any) {
    await this.assertSameOrg(caller, id);
    return this.usersService.update(id, { permissions });
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Deactivate a user account in your org' })
  async deactivate(@Param('id') id: string, @CurrentUser() caller: any) {
    await this.assertSameOrg(caller, id);
    return this.usersService.deactivate(id);
  }

  @Patch(':id/activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Reactivate a user account in your org' })
  async activate(@Param('id') id: string, @CurrentUser() caller: any) {
    await this.assertSameOrg(caller, id);
    return this.usersService.update(id, { isActive: true });
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user role or details — must be in caller\'s org' })
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() caller: any) {
    await this.assertSameOrg(caller, id);
    const allowed = ['role', 'name', 'county', 'companyName', 'isActive'];
    const safe = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    return this.usersService.update(id, safe);
  }

  // ── POST /users/:id/revert-role — revert a user to a previous role (admin action) ───
  @Post(':id/revert-role')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Revert a user to a previous role within the same organisation' })
  async revertRole(
    @Param('id') id: string,
    @Body('previousRole') previousRole: string,
    @CurrentUser() caller: any,
  ) {
    // Only super admin or admin can revert roles for users in their org
    await this.assertSameOrg(caller, id);
    if (!previousRole || !(Object.values(UserRole) as string[]).includes(previousRole)) {
      throw new BadRequestException('Invalid previousRole');
    }
    // Avoid downgrading to an invalid role for the user's current org context
    return this.usersService.update(id, { role: previousRole as any });
  }

  /** Throws ForbiddenException if target user is not in the caller's org (super_admin exempt). */
  private async assertSameOrg(caller: any, targetUserId: string): Promise<void> {
    if (caller.role === UserRole.SUPER_ADMIN) return;
    const target = await this.usersService.findById(targetUserId);
    if (!target) throw new NotFoundException('User not found');
    if (target.organisationId !== caller.orgId) {
      throw new ForbiddenException('Access denied — user belongs to a different organisation');
    }
  }
}
