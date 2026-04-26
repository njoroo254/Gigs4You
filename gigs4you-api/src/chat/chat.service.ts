import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ChatMessage, ChatConversation } from './chat.entity';
import { ChatGroup, ChatGroupMember, ChatGroupMessage } from './chat-group.entity';
import { User } from '../users/user.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)        private msgRepo:      Repository<ChatMessage>,
    @InjectRepository(ChatConversation)   private convRepo:     Repository<ChatConversation>,
    @InjectRepository(User)               private userRepo:     Repository<User>,
    @InjectRepository(ChatGroup)          private groupRepo:    Repository<ChatGroup>,
    @InjectRepository(ChatGroupMember)    private memberRepo:   Repository<ChatGroupMember>,
    @InjectRepository(ChatGroupMessage)   private groupMsgRepo: Repository<ChatGroupMessage>,
  ) {}

  private makeConvId(a: string, b: string): string {
    return [a, b].sort().join(':');
  }

  async sendMessage(senderId: string, recipientId: string, body: string, opts: {
    taskId?: string;
    attachmentUrl?: string;
    attachmentType?: string;
    organisationId?: string;
    messageType?: string;
  } = {}): Promise<ChatMessage> {
    const conversationId = this.makeConvId(senderId, recipientId);

    const msg = this.msgRepo.create({
      conversationId,
      senderId,
      recipientId,
      body,
      ...opts,
      messageType: opts.messageType || 'text',
    });
    await this.msgRepo.save(msg);

    // Update or create conversation record
    let conv = await this.convRepo.findOne({ where: { conversationId } });
    if (!conv) {
      conv = this.convRepo.create({
        conversationId,
        participantA: senderId,
        participantB: recipientId,
        organisationId: opts.organisationId,
        unreadCountA: 0,
        unreadCountB: 0,
      });
    } else {
      // Ensure counts are numbers (guard against DB rows with NULL)
      conv.unreadCountA = conv.unreadCountA ?? 0;
      conv.unreadCountB = conv.unreadCountB ?? 0;
    }
    conv.lastMessageBody = body.slice(0, 100);
    conv.lastMessageAt   = new Date();

    // Increment unread for recipient
    if (conv.participantA === recipientId) conv.unreadCountA += 1;
    else                                   conv.unreadCountB += 1;

    await this.convRepo.save(conv);
    return msg;
  }

  async getMessages(userId: string, otherUserId: string, limit = 50, before?: string): Promise<ChatMessage[]> {
    const conversationId = this.makeConvId(userId, otherUserId);
    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.conversationId = :cid', { cid: conversationId })
      .orderBy('m.createdAt', 'DESC')
      .take(limit);
    if (before) qb.andWhere('m.createdAt < :before', { before });
    const msgs = await qb.getMany();
    return msgs.reverse();
  }

  async getConversations(userId: string): Promise<any[]> {
    // Primary path: query the conversations table
    try {
      const convs = await this.convRepo
        .createQueryBuilder('c')
        .where('c.participantA = :uid OR c.participantB = :uid', { uid: userId })
        .orderBy('c.lastMessageAt', 'DESC')
        .take(50)
        .getMany();

      if (convs.length > 0) {
        const otherIds = [...new Set(convs.map(c =>
          c.participantA === userId ? c.participantB : c.participantA,
        ))];
        const users = otherIds.length
          ? await this.userRepo.find({ where: { id: In(otherIds) }, select: ['id','name','phone','role'] })
          : [];
        const userMap = new Map(users.map(u => [u.id, u]));
        return convs.map(c => {
          const otherId = c.participantA === userId ? c.participantB : c.participantA;
          const u = userMap.get(otherId);
          return { ...c, otherUser: u ? { id: u.id, name: u.name, phone: u.phone, role: u.role } : null };
        });
      }
    } catch { /* fall through */ }

    // Fallback: derive conversations directly from chat_messages
    // Handles cases where chat_conversations records were never created
    return this.deriveConversationsFromMessages(userId);
  }

  private async deriveConversationsFromMessages(userId: string): Promise<any[]> {
    const msgs = await this.msgRepo
      .createQueryBuilder('m')
      .where('m.senderId = :uid OR m.recipientId = :uid', { uid: userId })
      .orderBy('m.createdAt', 'DESC')
      .getMany();

    // Group by conversationId keeping only the latest message per pair
    const seen = new Map<string, { otherId: string; lastMsg: any; unread: number }>();
    for (const msg of msgs) {
      const otherId = msg.senderId === userId ? msg.recipientId : msg.senderId;
      const cid     = this.makeConvId(userId, otherId);
      if (!seen.has(cid)) {
        seen.set(cid, { otherId, lastMsg: msg, unread: 0 });
      }
      if (!msg.isRead && msg.recipientId === userId) {
        seen.get(cid)!.unread += 1;
      }
    }

    if (seen.size === 0) return [];

    // Batch-load other participants' profiles
    const otherIds = [...new Set([...seen.values()].map(v => v.otherId))];
    const users = await this.userRepo.find({
      where: { id: In(otherIds) },
      select: ['id','name','phone','role'],
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    return [...seen.entries()].map(([cid, { otherId, lastMsg, unread }]) => {
      const [a, b] = cid.split(':');
      const u = userMap.get(otherId);
      return {
        id:              cid,
        conversationId:  cid,
        participantA:    a,
        participantB:    b,
        lastMessageBody: lastMsg.body,
        lastMessageAt:   lastMsg.createdAt,
        unreadCountA:    a === userId ? unread : 0,
        unreadCountB:    b === userId ? unread : 0,
        otherUser:       u ? { id: u.id, name: u.name, phone: u.phone, role: u.role } : null,
      };
    });
  }

  async markRead(userId: string, otherUserId: string): Promise<void> {
    const conversationId = this.makeConvId(userId, otherUserId);
    await this.msgRepo.update(
      { conversationId, recipientId: userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    const conv = await this.convRepo.findOne({ where: { conversationId } });
    if (conv) {
      if (conv.participantA === userId) conv.unreadCountA = 0;
      else                              conv.unreadCountB = 0;
      await this.convRepo.save(conv);
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    const convs = await this.convRepo
      .createQueryBuilder('c')
      .where('c.participantA = :uid OR c.participantB = :uid', { uid: userId })
      .getMany();
    return convs.reduce((sum, c) =>
      sum + (c.participantA === userId ? c.unreadCountA : c.unreadCountB), 0);
  }

  // ── Group methods ────────────────────────────────────────────────────────

  async createGroup(opts: {
    name: string;
    createdBy: string;
    memberIds: string[];
    organisationId?: string;
    description?: string;
  }): Promise<ChatGroup & { members: any[] }> {
    const group = this.groupRepo.create({
      name: opts.name,
      createdBy: opts.createdBy,
      organisationId: opts.organisationId,
      description: opts.description,
    });
    await this.groupRepo.save(group);

    // Add creator + requested members (dedup)
    const allIds = [...new Set([opts.createdBy, ...opts.memberIds])];
    const members = allIds.map(uid =>
      this.memberRepo.create({ groupId: group.id, userId: uid, isAdmin: uid === opts.createdBy }),
    );
    await this.memberRepo.save(members);

    const populatedMembers = await this.getGroupMemberProfiles(group.id);
    return { ...group, members: populatedMembers };
  }

  async getGroups(userId: string): Promise<any[]> {
    const memberships = await this.memberRepo.find({ where: { userId } });
    if (!memberships.length) return [];

    const groupIds = memberships.map(m => m.groupId);
    const groups   = await this.groupRepo.find({ where: { id: In(groupIds) } });

    // Attach last message + member count to each group
    const result: any[] = [];
    for (const g of groups) {
      const lastMsg = await this.groupMsgRepo.findOne({
        where:  { groupId: g.id },
        order:  { createdAt: 'DESC' },
      });
      const memberCount = await this.memberRepo.count({ where: { groupId: g.id } });
      result.push({ ...g, lastMessage: lastMsg ?? null, memberCount });
    }
    return result.sort((a, b) => {
      const ta = a.lastMessage?.createdAt?.getTime() ?? a.createdAt?.getTime() ?? 0;
      const tb = b.lastMessage?.createdAt?.getTime() ?? b.createdAt?.getTime() ?? 0;
      return tb - ta;
    });
  }

  async getGroupMessages(groupId: string, userId: string, limit = 60, before?: string): Promise<ChatGroupMessage[]> {
    const isMember = await this.memberRepo.findOne({ where: { groupId, userId } });
    if (!isMember) throw new ForbiddenException('Not a group member');

    const qb = this.groupMsgRepo
      .createQueryBuilder('m')
      .where('m.groupId = :groupId', { groupId })
      .orderBy('m.createdAt', 'DESC')
      .take(limit);
    if (before) qb.andWhere('m.createdAt < :before', { before });
    const msgs = await qb.getMany();
    return msgs.reverse();
  }

  async sendGroupMessage(groupId: string, senderId: string, body: string, opts: {
    attachmentUrl?: string;
    attachmentType?: string;
    messageType?: string;
  } = {}): Promise<ChatGroupMessage & { senderName: string }> {
    const isMember = await this.memberRepo.findOne({ where: { groupId, userId: senderId } });
    if (!isMember) throw new ForbiddenException('Not a group member');

    const msg = this.groupMsgRepo.create({
      groupId, senderId, body,
      attachmentUrl:  opts.attachmentUrl,
      attachmentType: opts.attachmentType,
      messageType:    opts.messageType || (opts.attachmentUrl ? 'image' : 'text'),
    });
    await this.groupMsgRepo.save(msg);

    const sender = await this.userRepo.findOne({ where: { id: senderId }, select: ['id','name'] });
    return { ...msg, senderName: sender?.name || 'Unknown' };
  }

  async getGroupMembers(groupId: string, userId: string): Promise<any[]> {
    const isMember = await this.memberRepo.findOne({ where: { groupId, userId } });
    if (!isMember) throw new ForbiddenException('Not a group member');
    return this.getGroupMemberProfiles(groupId);
  }

  async addGroupMembers(groupId: string, requesterId: string, userIds: string[]): Promise<void> {
    const requester = await this.memberRepo.findOne({ where: { groupId, userId: requesterId } });
    if (!requester?.isAdmin) throw new ForbiddenException('Only group admins can add members');

    for (const uid of userIds) {
      const exists = await this.memberRepo.findOne({ where: { groupId, userId: uid } });
      if (!exists) await this.memberRepo.save(this.memberRepo.create({ groupId, userId: uid }));
    }
  }

  async removeGroupMember(groupId: string, requesterId: string, targetUserId: string): Promise<void> {
    const requester = await this.memberRepo.findOne({ where: { groupId, userId: requesterId } });
    // Allow self-removal or admin removal
    if (requesterId !== targetUserId && !requester?.isAdmin) {
      throw new ForbiddenException('Only group admins can remove other members');
    }
    await this.memberRepo.delete({ groupId, userId: targetUserId });
  }

  async getGroupMemberIds(groupId: string): Promise<string[]> {
    const members = await this.memberRepo.find({ where: { groupId } });
    return members.map(m => m.userId);
  }

  async getGroupById(groupId: string): Promise<ChatGroup | null> {
    return this.groupRepo.findOne({ where: { id: groupId } }) ?? null;
  }

  private async getGroupMemberProfiles(groupId: string): Promise<any[]> {
    const members = await this.memberRepo.find({ where: { groupId } });
    if (!members.length) return [];
    const users = await this.userRepo.find({
      where: { id: In(members.map(m => m.userId)) },
      select: ['id','name','phone','role'],
    });
    const userMap = new Map(users.map(u => [u.id, u]));
    return members.map(m => ({ ...m, user: userMap.get(m.userId) ?? null }));
  }
}
