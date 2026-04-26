import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum NotificationType {
  TASK      = 'task',
  JOB       = 'job',
  PAYMENT   = 'payment',
  SYSTEM    = 'system',
  APPLICATION = 'application',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: NotificationType, default: NotificationType.SYSTEM })
  type: NotificationType;

  @Column({ default: false })
  isRead: boolean;

  @Column({ default: false })
  isImportant: boolean;  // if true, re-notify after 15 min if still unread

  @Column({ type: 'timestamp', nullable: true })
  remindAt: Date | null;  // set to createdAt + 15m when isImportant; cleared on read

  @Column({ nullable: true })
  actionId: string; // jobId | taskId to deep-link to

  @Column({ nullable: true })
  actionType: string;

  @CreateDateColumn()
  createdAt: Date;
}
