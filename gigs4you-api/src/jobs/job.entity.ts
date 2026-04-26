import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn, ManyToMany, JoinTable,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Skill } from '../skills/skill.entity';
import { JobApplication } from '../applications/job-application.entity';

export enum JobStatus {
  OPEN       = 'open',
  IN_PROGRESS = 'in_progress',
  COMPLETED  = 'completed',
  CANCELLED  = 'cancelled',
  EXPIRED    = 'expired',
}

export enum BudgetType {
  FIXED   = 'fixed',
  HOURLY  = 'hourly',
  DAILY   = 'daily',
  MONTHLY = 'monthly',
}

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ default: 'general' })
  category: string;

  // Required skills (many-to-many with skills table)
  @ManyToMany(() => Skill, { eager: true })
  @JoinTable({ name: 'job_required_skills' })
  requiredSkills: Skill[];

  // Budget
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  budgetMin: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  budgetMax: number;

  @Column({ type: 'enum', enum: BudgetType, default: BudgetType.FIXED })
  budgetType: BudgetType;

  // Location
  @Column()
  location: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;

  @Column({ nullable: true })
  county: string;

  // Status & urgency
  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.OPEN })
  status: JobStatus;

  @Column({ default: false })
  isUrgent: boolean;

  @Column({ default: false })
  isFeatured: boolean;

  // Scheduling
  @Column({ type: 'timestamp', nullable: true })
  startDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  deadline: Date;

  // Who posted
  @ManyToOne(() => User, { eager: false })
  @JoinColumn()
  postedBy: User;

  @Column()
  postedById: string;

  @Column({ nullable: true })
  companyName: string;

  @Column({ nullable: true })
  companyLogoUrl: string;

  // Number of positions
  @Column({ default: 1 })
  positionsAvailable: number;

  // Applications
  @OneToMany(() => JobApplication, (app) => app.job)
  applications: JobApplication[];

  @Column({ default: 0 })
  applicantCount: number;

  // External worker who was hired (B2C marketplace)
  @Column({ nullable: true })
  assignedWorkerId: string;

  // Views
  @Column({ default: 0 })
  viewCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
