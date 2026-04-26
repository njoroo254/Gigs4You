import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, OneToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Task } from '../tasks/task.entity';
import { GpsLog } from '../gps/gps-log.entity';

export enum AgentStatus {
  CHECKED_IN  = 'checked_in',
  CHECKED_OUT = 'checked_out',
  OFFLINE     = 'offline',
}

@Entity('agents')
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.agent, { eager: true })
  @JoinColumn()
  user: User;

  @Column({ nullable: true })
  deviceId: string;

  @Column({ nullable: true })
  deviceModel: string;

  @Column({ type: 'enum', enum: AgentStatus, default: AgentStatus.OFFLINE })
  status: AgentStatus;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lastLatitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lastLongitude: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  checkedInAt: Date;

  @Column({ name: 'category', default: 'sales' })
  module: string;

  // Which organisation/team this agent belongs to
  @Column({ nullable: true })
  organisationId: string;

  // Whether this is a confirmed team member (vs pending invitation)
  @Column({ default: true })
  isConfirmed: boolean;

  // Gamification
  @Column({ default: 0 })
  totalXp: number;

  @Column({ default: 1 })
  level: number;

  @Column({ default: 0 })
  currentStreak: number;

  // Extended profile fields (denormalised for performance)
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  averageRating: number;

  @Column({ default: 0 })
  completedJobs: number;

  @Column({ default: true })
  isAvailable: boolean;

  @OneToMany(() => Task, (task) => task.agent)
  tasks: Task[];

  @OneToMany(() => GpsLog, (log) => log.agent)
  gpsLogs: GpsLog[];

  @CreateDateColumn()
  createdAt: Date;
}
