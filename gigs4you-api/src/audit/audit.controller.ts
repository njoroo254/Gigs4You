import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Fetch audit logs — super_admin sees all, admin sees own org' })
  findAll(
    @CurrentUser() user: any,
    @Query('orgId')   orgId?:  string,
    @Query('userId')  userId?: string,
    @Query('action')  action?: string,
    @Query('entity')  entity?: string,
    @Query('from')    from?:   string,
    @Query('to')      to?:     string,
    @Query('page')    page?:   string,
    @Query('limit')   limit?:  string,
  ) {
    // Admins can only see their own org; super_admin can specify any orgId
    const resolvedOrgId = user.role === UserRole.SUPER_ADMIN
      ? orgId   // undefined = all orgs
      : user.orgId;

    return this.audit.findAll({
      orgId:  resolvedOrgId,
      userId,
      action,
      entity,
      from,
      to,
      page:  page  ? +page  : 1,
      limit: limit ? +limit : 50,
    });
  }

  @Get('stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Audit activity stats for the last 30 days' })
  stats(@CurrentUser() user: any) {
    const orgId = user.role === UserRole.SUPER_ADMIN ? undefined : user.orgId;
    return this.audit.getStats(orgId);
  }
}
