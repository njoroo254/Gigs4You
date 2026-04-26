import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Optional,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { PushService } from '../push/push.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

const GROUP_CREATOR_ROLES = ['super_admin', 'admin', 'manager'];

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('chat')
export class ChatController {
  private readonly log = new Logger(ChatController.name);

  constructor(
    private svc: ChatService,
    private gateway: ChatGateway,
    @Optional() private pushService: PushService,
    @Optional() private notificationsService: NotificationsService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  // ── Contacts ─────────────────────────────────────────────────────────

  @Get('contacts')
  @ApiOperation({ summary: 'Get org contacts (agents, supervisors, managers, admin)' })
  async contacts(@CurrentUser() user: any) {
    if (!user.orgId) return [];
    const users = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.name', 'u.phone', 'u.role'])
      .where('u.organisationId = :orgId', { orgId: user.orgId })
      .andWhere('u.id != :me', { me: user.userId })
      .andWhere('u.isActive = true')
      .andWhere("u.role IN ('agent','supervisor','manager','admin','super_admin')")
      .orderBy('u.name', 'ASC')
      .getMany();
    return users;
  }

  // ── Direct Messages ───────────────────────────────────────────────────

  @Get('conversations')
  @ApiOperation({ summary: 'Get all my DM conversations' })
  conversations(@CurrentUser() user: any) {
    return this.svc.getConversations(user.userId);
  }

  @Get('conversations/:otherId/messages')
  @ApiOperation({ summary: 'Get messages with a specific user' })
  messages(
    @CurrentUser() user: any,
    @Param('otherId') otherId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.svc.getMessages(user.userId, otherId, limit ? parseInt(limit) : 50, before);
  }

  @Post('conversations/:otherId/messages')
  @ApiOperation({ summary: 'Send a direct message to a user' })
  async send(
    @CurrentUser() user: any,
    @Param('otherId') otherId: string,
    @Body('body') body: string,
    @Body('taskId') taskId?: string,
    @Body('attachmentUrl') attachmentUrl?: string,
  ) {
    const msg = await this.svc.sendMessage(user.userId, otherId, body, {
      taskId, attachmentUrl, organisationId: user.orgId,
    });

    const payload = {
      id: msg.id, senderId: msg.senderId, recipientId: msg.recipientId,
      body: msg.body, taskId: msg.taskId, messageType: msg.messageType,
      conversationId: msg.conversationId, createdAt: msg.createdAt,
      attachmentUrl: msg.attachmentUrl, attachmentType: msg.attachmentType,
    };
    this.gateway.emitToUser(otherId, 'new_message', payload);
    this.gateway.emitToUser(user.userId, 'message_sent', payload);

    // Always push — mobile OS suppresses tray notification when app is foreground;
    // Flutter's data handler manages in-app display for online users.
    if (this.pushService) {
      this.pushService.notifyChatMessage(
        otherId, user.name || 'Manager', body, msg.conversationId,
      ).catch(() => {});
    }

    return msg;
  }

  @Patch('conversations/:otherId/read')
  @ApiOperation({ summary: 'Mark all messages from a user as read' })
  markRead(@CurrentUser() user: any, @Param('otherId') otherId: string) {
    return this.svc.markRead(user.userId, otherId);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread DM count' })
  unread(@CurrentUser() user: any) {
    return this.svc.getUnreadCount(user.userId);
  }

  // ── Groups ────────────────────────────────────────────────────────────

  @Post('groups')
  @ApiOperation({ summary: 'Create a group (admin / super_admin / manager only)' })
  async createGroup(
    @CurrentUser() user: any,
    @Body('name') name: string,
    @Body('memberIds') memberIds: string[],
    @Body('description') description?: string,
  ) {
    if (!GROUP_CREATOR_ROLES.includes(user.role)) {
      throw new ForbiddenException('Only admins and managers can create groups');
    }
    const group = await this.svc.createGroup({
      name, memberIds: memberIds ?? [], description,
      createdBy: user.userId, organisationId: user.orgId,
    });

    // Notify members via WebSocket so the group appears instantly
    const memberIds2 = await this.svc.getGroupMemberIds(group.id);
    for (const uid of memberIds2) {
      this.gateway.emitToUser(uid, 'group_created', group);
    }
    return group;
  }

  @Get('groups')
  @ApiOperation({ summary: 'Get all groups I am a member of' })
  getGroups(@CurrentUser() user: any) {
    return this.svc.getGroups(user.userId);
  }

  @Get('groups/:groupId/messages')
  @ApiOperation({ summary: 'Get messages in a group' })
  getGroupMessages(
    @CurrentUser() user: any,
    @Param('groupId') groupId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.svc.getGroupMessages(groupId, user.userId, limit ? parseInt(limit) : 60, before);
  }

  @Post('groups/:groupId/messages')
  @ApiOperation({ summary: 'Send a message to a group' })
  async sendGroupMessage(
    @CurrentUser() user: any,
    @Param('groupId') groupId: string,
    @Body('body') body: string,
    @Body('attachmentUrl') attachmentUrl?: string,
  ) {
    const msg = await this.svc.sendGroupMessage(groupId, user.userId, body, { attachmentUrl });

    const payload = {
      id: msg.id, groupId, senderId: msg.senderId,
      senderName: msg.senderName, body: msg.body,
      attachmentUrl: msg.attachmentUrl, messageType: msg.messageType,
      createdAt: msg.createdAt,
    };

    // Emit to group room — gateway ensures all members are in the room
    this.gateway.emitToGroup(groupId, 'new_group_message', payload);

    // Notify all other group members — in-app bell (everyone) + push (offline only)
    const [memberIds, group] = await Promise.all([
      this.svc.getGroupMemberIds(groupId),
      this.svc.getGroupById(groupId),
    ]);
    const otherIds   = memberIds.filter(uid => uid !== user.userId);
    const offlineIds = otherIds.filter(uid => !this.gateway.isOnline(uid));
    const groupName  = group?.name ?? 'Group';
    const preview    = body.length > 100 ? body.slice(0, 97) + '…' : body;

    // In-app bell for ALL members (persistent record, even if online)
    for (const uid of otherIds) {
      this.notificationsService?.notify(
        uid,
        `💬 ${user.name || 'Someone'} in ${groupName}`,
        preview,
        'system' as any,
        groupId, 'chat_group',
      );
    }

    // FCM push only for offline members
    if (offlineIds.length && this.pushService) {
      this.pushService.sendToUsers(offlineIds, {
        title: `💬 ${user.name || 'Someone'} in ${groupName}`,
        body:  preview,
        data:  { type: 'chat_group', groupId, screen: '/chat' },
      }).catch(e => this.log.error(`Push (group msg) failed: ${(e as Error).message}`));
    }

    return msg;
  }

  @Get('groups/:groupId/members')
  @ApiOperation({ summary: 'Get members of a group' })
  getGroupMembers(@CurrentUser() user: any, @Param('groupId') groupId: string) {
    return this.svc.getGroupMembers(groupId, user.userId);
  }

  @Post('groups/:groupId/members')
  @ApiOperation({ summary: 'Add members to a group (group admin only)' })
  addGroupMembers(
    @CurrentUser() user: any,
    @Param('groupId') groupId: string,
    @Body('userIds') userIds: string[],
  ) {
    return this.svc.addGroupMembers(groupId, user.userId, userIds);
  }

  @Delete('groups/:groupId/members/:targetUserId')
  @ApiOperation({ summary: 'Remove a member from a group (group admin or self-leave)' })
  removeGroupMember(
    @CurrentUser() user: any,
    @Param('groupId') groupId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.svc.removeGroupMember(groupId, user.userId, targetUserId);
  }
}
