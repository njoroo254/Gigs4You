import { SkipThrottle } from '@nestjs/throttler';
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { PushService } from '../push/push.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Agent } from '../agents/agent.entity';
import { ChatGroupMember } from './chat-group.entity';

interface AuthSocket extends Socket {
  userId: string;
  orgId:  string;
  name:   string;
}

@SkipThrottle()
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? [
          'https://dashboard.gigs4you.co.ke',
          'https://app.gigs4you.co.ke',
          'https://gigs4you.co.ke',
        ]
      : [
          'http://localhost:3001',
          'http://localhost:5173',
          'http://localhost:8080',
          'http://10.0.2.2:3000',
          /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
        ],
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization'],
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly log = new Logger(ChatGateway.name);

  // userId → Set of socketIds (same user can connect from multiple tabs/devices)
  private onlineUsers = new Map<string, Set<string>>();

  constructor(
    private jwtService: JwtService,
    private chatService: ChatService,
    private pushService: PushService,
    @Optional() private notificationsService: NotificationsService,
    @InjectRepository(Agent)
    private agentRepo: Repository<Agent>,
    @InjectRepository(ChatGroupMember)
    private groupMemberRepo: Repository<ChatGroupMember>,
  ) {}

  // ── Connection lifecycle ──────────────────────────────────────────────
  async handleConnection(client: AuthSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) { client.disconnect(); return; }

      const payload = this.jwtService.verify(token);
      client.userId = payload.sub;
      client.orgId  = payload.orgId;
      client.name   = payload.name;

      // Join personal room — DMs are sent to room `user:${userId}`
      client.join(`user:${client.userId}`);

      // Join all group rooms this user belongs to
      const memberships = await this.groupMemberRepo.find({ where: { userId: client.userId } });
      for (const m of memberships) {
        client.join(`group:${m.groupId}`);
      }

      // Track online status
      if (!this.onlineUsers.has(client.userId)) {
        this.onlineUsers.set(client.userId, new Set());
      }
      this.onlineUsers.get(client.userId)!.add(client.id);

      // Notify contacts this user is online
      this.broadcastPresence(client.userId, true);

      this.log.log(`Connected: ${client.userId} (${client.id}) — joined ${memberships.length} group(s)`);
    } catch (e) {
      this.log.warn(`Auth failed: ${(e as Error).message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthSocket) {
    if (!client.userId) return;
    const sockets = this.onlineUsers.get(client.userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.onlineUsers.delete(client.userId);
        this.broadcastPresence(client.userId, false);
      }
    }
    this.log.log(`Disconnected: ${client.userId}`);
  }

  // ── Events ────────────────────────────────────────────────────────────

  /** Send a message to another user */
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: {
      recipientId: string;
      body:        string;
      taskId?:     string;
      messageType?: string;
      attachmentUrl?: string;
    },
  ) {
    if (!data.recipientId || (!data.body?.trim() && !data.attachmentUrl)) {
      return { error: 'recipientId and body (or attachment) are required' };
    }

    try {
      const body = data.body?.trim() || (data.attachmentUrl ? '📎 Attachment' : '');
      const msg = await this.chatService.sendMessage(
        client.userId,
        data.recipientId,
        body,
        {
          taskId:         data.taskId,
          attachmentUrl:  data.attachmentUrl,
          organisationId: client.orgId,
          messageType:    data.messageType || (data.attachmentUrl ? 'image' : 'text'),
        },
      );

      const payload = {
        id:             msg.id,
        senderId:       msg.senderId,
        recipientId:    msg.recipientId,
        body:           msg.body,
        taskId:         msg.taskId,
        messageType:    msg.messageType,
        attachmentUrl:  msg.attachmentUrl,
        attachmentType: msg.attachmentType,
        conversationId: msg.conversationId,
        createdAt:      msg.createdAt,
      };

      // Deliver to recipient's room (all their devices)
      this.server.to(`user:${data.recipientId}`).emit('new_message', payload);

      // Confirm delivery to sender (echo to their other devices too)
      this.server.to(`user:${client.userId}`).emit('message_sent', payload);

      // Always push — mobile OS suppresses tray notification when app is foreground;
      // Flutter's data handler manages in-app display for online users.
      this.pushService?.notifyChatMessage(
        data.recipientId, client.name || 'Someone',
        data.body.trim(), msg.conversationId,
      ).catch(() => {});

      return payload;
    } catch (err) {
      this.log.error(`send_message failed for ${client.userId}→${data.recipientId}: ${(err as Error).message}`, (err as Error).stack);
      return { error: 'Failed to send message. Please try again.' };
    }
  }

  /** Typing indicator */
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { recipientId: string; isTyping: boolean },
  ) {
    this.server.to(`user:${data.recipientId}`).emit('user_typing', {
      userId:   client.userId,
      name:     client.name,
      isTyping: data.isTyping,
    });
  }

  /** Mark conversation as read */
  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { otherUserId: string },
  ) {
    await this.chatService.markRead(client.userId, data.otherUserId);
    // Tell sender their messages were read
    this.server.to(`user:${data.otherUserId}`).emit('messages_read', {
      byUserId: client.userId,
    });
  }

  /** Check online status of a list of userIds — emits presence_result back to requester.
   *  Falls back to agent GPS check-in status so checked-in agents always show as online. */
  @SubscribeMessage('get_presence')
  async handleGetPresence(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { userIds: string[] },
  ) {
    const ids = data?.userIds || [];
    const presence: Record<string, boolean> = {};

    // Seed with WebSocket connection status
    for (const id of ids) {
      presence[id] = this.isOnline(id);
    }

    // For any user not connected to chat WS, check their agent GPS status
    const offlineIds = ids.filter(id => !presence[id]);
    if (offlineIds.length) {
      const checkedInAgents = await this.agentRepo
        .createQueryBuilder('a')
        .leftJoin('a.user', 'u')
        .where('u.id IN (:...ids)', { ids: offlineIds })
        .andWhere("a.status = 'checked_in'")
        .select(['a.id', 'u.id'])
        .getRawMany();
      for (const row of checkedInAgents) {
        if (row.u_id) presence[row.u_id] = true;
      }
    }

    client.emit('presence_result', presence);
    return presence;
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  isOnline(userId: string): boolean {
    return (this.onlineUsers.get(userId)?.size ?? 0) > 0;
  }

  private broadcastPresence(userId: string, online: boolean) {
    // Emit to all connected clients — let client filter by contact list
    this.server.emit('presence_update', { userId, online });
  }

  private extractToken(client: Socket): string | null {
    // 1) auth header  2) handshake auth  3) query param
    const auth  = client.handshake?.auth?.token as string;
    const query = client.handshake?.query?.token as string;
    const header = client.handshake?.headers?.authorization;
    if (auth)   return auth.replace('Bearer ', '');
    if (header) return (header as string).replace('Bearer ', '');
    if (query)  return query;
    return null;
  }

  /** Send a message to a group (WebSocket path) */
  @SubscribeMessage('send_group_message')
  async handleSendGroupMessage(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { groupId: string; body: string; attachmentUrl?: string },
  ) {
    if (!data.groupId || (!data.body?.trim() && !data.attachmentUrl)) {
      return { error: 'groupId and body (or attachment) are required' };
    }
    try {
      const body = data.body?.trim() || (data.attachmentUrl ? '📎 Attachment' : '');
      const msg  = await this.chatService.sendGroupMessage(data.groupId, client.userId, body, {
        attachmentUrl: data.attachmentUrl,
      });
      const payload = {
        id: msg.id, groupId: data.groupId,
        senderId: msg.senderId, senderName: msg.senderName,
        body: msg.body, attachmentUrl: msg.attachmentUrl,
        messageType: msg.messageType, createdAt: msg.createdAt,
      };
      // Emit to the group room — all members in it receive the message
      this.server.to(`group:${data.groupId}`).emit('new_group_message', payload);

      // In-app bell + push for group members
      const [memberIds, group] = await Promise.all([
        this.chatService.getGroupMemberIds(data.groupId),
        this.chatService.getGroupById(data.groupId),
      ]);
      const otherIds   = memberIds.filter(uid => uid !== client.userId);
      const offlineIds = otherIds.filter(uid => !this.isOnline(uid));
      const groupName  = group?.name ?? 'Group';
      const preview    = body.length > 100 ? body.slice(0, 97) + '…' : body;

      // In-app bell for ALL members
      for (const uid of otherIds) {
        this.notificationsService?.notify(
          uid,
          `💬 ${client.name || 'Someone'} in ${groupName}`,
          preview,
          'system' as any,
          data.groupId, 'chat_group',
        );
      }

      // FCM push for offline members only
      if (offlineIds.length && this.pushService) {
        this.pushService.sendToUsers(offlineIds, {
          title: `💬 ${client.name || 'Someone'} in ${groupName}`,
          body:  preview,
          data:  { type: 'chat_group', groupId: data.groupId, screen: '/chat' },
        }).catch(() => {});
      }

      return payload;
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  /** Called from other services to push a system event to a user */
  emitToUser(userId: string, event: string, data: any) {
    this.server?.to(`user:${userId}`).emit(event, data);
  }

  /** Emit an event to all sockets in a group room */
  emitToGroup(groupId: string, event: string, data: any) {
    this.server?.to(`group:${groupId}`).emit(event, data);
  }
}
