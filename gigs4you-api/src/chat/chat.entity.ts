import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

@Entity('chat_messages')
@Index(['conversationId', 'createdAt'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // conversationId = sorted pair of userIds e.g. "uuid1:uuid2"
  @Column()
  conversationId: string;

  @Column()
  senderId: string;

  @Column()
  recipientId: string;

  @Column({ nullable: true })
  organisationId: string;

  @Column({ nullable: true })
  taskId: string;    // optional — link message to a task

  @Column({ type: 'text' })
  body: string;

  @Column({ nullable: true })
  attachmentUrl: string;

  @Column({ nullable: true })
  attachmentType: string; // 'image' | 'document'

  @Column({ default: false })
  isRead: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;

  // Message type
  @Column({ default: 'text' })
  messageType: string; // 'text' | 'image' | 'task_update' | 'system'

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('chat_conversations')
export class ChatConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  conversationId: string;

  @Column()
  participantA: string;

  @Column()
  participantB: string;

  @Column({ nullable: true })
  organisationId: string;

  @Column({ nullable: true })
  lastMessageBody: string;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date;

  @Column({ default: 0 })
  unreadCountA: number = 0;

  @Column({ default: 0 })
  unreadCountB: number = 0;

  @CreateDateColumn()
  createdAt: Date;
}
