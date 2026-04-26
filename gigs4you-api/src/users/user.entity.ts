import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToOne,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Agent } from '../agents/agent.entity';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',  // Platform owner — manages everything
  ADMIN       = 'admin',         // Company/org admin — manages their own team
  MANAGER     = 'manager',       // Field manager — creates tasks, views reports
  SUPERVISOR  = 'supervisor',    // Supervises a group of agents
  AGENT       = 'agent',         // Confirmed team member — receives tasks
  EMPLOYER    = 'employer',      // Individual/company that posts jobs
  WORKER      = 'worker',        // Freelancer — no org, sees jobs only
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /** Stored AES-256-GCM encrypted in production (iv:ciphertext:tag, base64). */
  @Column({ type: 'text' })
  phone: string;

  /**
   * HMAC-SHA-256 blind index of the normalised phone number.
   * Used for equality lookups so we never need to decrypt to search.
   * NULL in dev mode when encryption keys are not configured.
   */
  @Column({ unique: true, nullable: true })
  phoneHash: string;

  // Optional username for login (auto-generated from name if not set)
  @Column({ unique: true, nullable: true })
  username: string;

  /** Stored AES-256-GCM encrypted in production. */
  @Column({ unique: true, nullable: true, type: 'text' })
  email: string;

  /** HMAC-SHA-256 blind index of the normalised email address. */
  @Column({ unique: true, nullable: true })
  emailHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.AGENT })
  role: UserRole;

  @Column()
  @Exclude()
  password: string;

  @Column({ default: false })
  isPhoneVerified: boolean;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ default: true })
  isActive: boolean;

  // Which organisation/company this user belongs to
  @Column({ nullable: true })
  organisationId: string;

  // Company name (for employers and admins)
  @Column({ nullable: true })
  companyName: string;

  // County / location
  @Column({ nullable: true })
  county: string;

  // Granular permissions (JSON) — admin can grant/revoke specific abilities
  // e.g. { canCreateJobs: true, canDeleteTasks: false, canViewReports: true }
  @Column({ type: 'simple-json', nullable: true })
  permissions: Record<string, boolean>;

  // FCM push tokens — JSON array, max 5 (one per device)
  @Column({ type: 'text', nullable: true })
  fcmTokens: string;

  // Last login tracking
  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true })
  lastLoginIp: string;

  @OneToOne(() => Agent, (agent) => agent.user, { nullable: true })
  agent: Agent;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
