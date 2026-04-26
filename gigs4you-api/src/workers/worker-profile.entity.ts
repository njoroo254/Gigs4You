import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  OneToOne, JoinColumn, ManyToMany, JoinTable,
} from 'typeorm';
import { Agent } from '../agents/agent.entity';
import { Skill } from '../skills/skill.entity';

// CV-style experience entry
export interface WorkExperience {
  company:    string;
  title:      string;
  startDate:  string;
  endDate?:   string;
  current:    boolean;
  description?: string;
}

// Education entry
export interface Education {
  institution: string;
  qualification: string;
  field?:      string;
  startYear:   number;
  endYear?:    number;
}

// Certification
export interface Certification {
  name:       string;
  issuer:     string;
  year:       number;
  expiryYear?: number;
}

@Entity('worker_profiles')
export class WorkerProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Agent, { eager: true, nullable: true })
  @JoinColumn()
  agent: Agent;

  @Column({ type: 'uuid', nullable: true })
  agentId: string;

  @Column({ nullable: true })
  userId: string;

  // For standalone workers (freelancers without Agent records)

  // ── Required CV fields ───────────────────────────
  @Column({ nullable: true, type: 'text' })
  bio: string;                       // Professional summary

  @Column({ nullable: true, type: 'date' })
  dateOfBirth: string;               // required for profile completion

  @Column({ nullable: true })
  location: string;                  // e.g. "Westlands, Nairobi"

  @Column({ nullable: true })
  county: string;

  @ManyToMany(() => Skill, { eager: true })
  @JoinTable({ name: 'worker_skills' })
  skills: Skill[];                   // required — at least one

  // ── Optional CV fields ───────────────────────────
  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  nationalIdNumber: string;

  @Column({ nullable: true })
  linkedinUrl: string;

  @Column({ type: 'simple-json', nullable: true })
  workExperience: WorkExperience[];

  @Column({ type: 'simple-json', nullable: true })
  education: Education[];

  @Column({ type: 'simple-json', nullable: true })
  certifications: Certification[];

  @Column({ type: 'simple-array', nullable: true })
  languages: string[];               // e.g. ['English','Kiswahili']

  @Column({ type: 'simple-array', nullable: true })
  portfolioUrls: string[];

  // ── Availability & rates ─────────────────────────
  @Column({ default: true })
  isAvailable: boolean;

  @Column({ nullable: true })
  availabilityNote: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  dailyRate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  hourlyRate: number;

  @Column({ nullable: true })
  mpesaPhone: string;

  // ── Performance ──────────────────────────────────
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  averageRating: number;

  @Column({ default: 0 })
  totalRatings: number;

  @Column({ default: 0 })
  completedJobs: number;

  @Column({ default: 0 })
  cancelledJobs: number;

  // ── Verification ─────────────────────────────────
  @Column({ default: false })
  isVerified: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get completionRate(): number {
    const total = this.completedJobs + this.cancelledJobs;
    return total > 0 ? Math.round((this.completedJobs / total) * 100) : 100;
  }

  // Profile completion % — name+skills+dob+location are required
  get profileCompletion(): number {
    const checks = [
      !!this.bio,
      !!this.dateOfBirth,
      !!this.location,
      this.skills?.length > 0,
      !!this.mpesaPhone,
      this.workExperience?.length > 0,
      this.education?.length > 0,
      !!this.avatarUrl,
    ];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  }
}
