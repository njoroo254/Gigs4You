import { Controller, Get, Post, Patch, Body, Param, UseGuards, HttpCode, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { DocumentType } from './verification.entity';

@ApiTags('Verification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('verification')
export class VerificationController {
  constructor(private svc: VerificationService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my verification status' })
  getMe(@CurrentUser() user: any) {
    return this.svc.getOrCreate(user.userId);
  }

  @Post('submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit ID + selfie for verification' })
  submit(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.submit(user.userId, body);
  }

  @Get('pending')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: list pending verifications' })
  pending() {
    return this.svc.getPending();
  }

  @Get('user/:userId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Admin: get verification record for a specific user' })
  getForUser(@Param('userId') userId: string) {
    return this.svc.getOrCreate(userId);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: approve a verification' })
  approve(@Param('id') id: string, @CurrentUser() admin: any, @Body('note') note?: string) {
    return this.svc.review(id, admin.userId, true, note);
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: reject a verification' })
  reject(@Param('id') id: string, @CurrentUser() admin: any, @Body('note') note: string) {
    return this.svc.review(id, admin.userId, false, note);
  }
}
