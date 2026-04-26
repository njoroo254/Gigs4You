import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

@Entity('chat_groups')
export class ChatGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  createdBy: string;   // userId of creator

  @Column({ nullable: true })
  organisationId: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('chat_group_members')
@Index(['groupId', 'userId'], { unique: true })
export class ChatGroupMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  groupId: string;

  @Column()
  userId: string;

  @Column({ default: false })
  isAdmin: boolean;

  @CreateDateColumn()
  joinedAt: Date;
}

@Entity('chat_group_messages')
@Index(['groupId', 'createdAt'])
export class ChatGroupMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  groupId: string;

  @Column()
  senderId: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ nullable: true })
  attachmentUrl: string;

  @Column({ nullable: true })
  attachmentType: string;   // 'image' | 'document'

  @Column({ default: 'text' })
  messageType: string;

  @CreateDateColumn()
  createdAt: Date;
}
