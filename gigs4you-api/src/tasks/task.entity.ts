import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Agent } from '../agents/agent.entity';

export enum TaskStatus {
  PENDING     = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED   = 'completed',
  FAILED      = 'failed',
  CANCELLED   = 'cancelled',
}

export enum TaskPriority {
  LOW    = 'low',
  MEDIUM = 'medium',
  HIGH   = 'high',
}

// A single checklist item the agent must tick off
export interface ChecklistItem {
  id:                 string;
  label:              string;
  required:           boolean;
  checked:            boolean;
  checkedAt:          string | null;
  // Per-item photo proof
  requiresPhoto?:     boolean;
  requiredPhotoCount?: number;   // how many photos needed (default 1)
  photoUrls?:         string[];  // URLs uploaded by the agent for this item
}

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type:'text', nullable:true })
  description: string;

  @Column({ type:'enum', enum:TaskStatus, default:TaskStatus.PENDING })
  status: TaskStatus;

  @Column({ type:'enum', enum:TaskPriority, default:TaskPriority.MEDIUM })
  priority: TaskPriority;

  // ── Location ─────────────────────────────────────
  @Column({ type:'decimal', precision:10, scale:7, nullable:true })
  latitude: number;

  @Column({ type:'decimal', precision:10, scale:7, nullable:true })
  longitude: number;

  @Column({ nullable:true })
  locationName: string;

  // ── Scheduling ───────────────────────────────────
  @Column({ type:'timestamp', nullable:true })
  dueAt: Date;

  // Time agent actually started the task
  @Column({ type:'timestamp', nullable:true })
  startedAt: Date;

  // Time agent submitted completion
  @Column({ type:'timestamp', nullable:true })
  completedAt: Date;

  // ── Time tracking ────────────────────────────────
  // Minutes from assignment to start (how long agent took to begin)
  @Column({ type:'int', nullable:true })
  minutesToStart: number;

  // Minutes from start to completion
  @Column({ type:'int', nullable:true })
  minutesToComplete: number;

  // ── Task customisation by creator ────────────────
  @Column({ default:false })
  requiresPhoto: boolean;

  @Column({ default:false })
  requiresSignature: boolean;

  // Organisation this task belongs to
  @Column({ nullable:true })
  organisationId: string;

  // Checklist items stored as JSON (creator defines, agent checks off)
  @Column({ type:'simple-json', nullable:true })
  checklist: ChecklistItem[];

  // ── Proof of work ────────────────────────────────
  @Column({ type:'simple-array', nullable:true })
  photoUrls: string[];

  @Column({ name:'signatureUrl', nullable:true })
  customerSignatureUrl: string;

  @Column({ type:'text', nullable:true })
  notes: string;

  // GPS coordinates where agent submitted completion (DB: completionLatitude/Longitude)
  @Column({ name:'completionLatitude', type:'decimal', precision:10, scale:7, nullable:true })
  submittedLatitude: number;

  @Column({ name:'completionLongitude', type:'decimal', precision:10, scale:7, nullable:true })
  submittedLongitude: number;

  // ── Gamification ─────────────────────────────────
  @Column({ default:50 })
  xpReward: number;

  // ── Assignment ───────────────────────────────────
  @ManyToOne(() => Agent, agent => agent.tasks, { eager:false })
  @JoinColumn()
  agent: Agent;

  @Column({ nullable:true })
  agentId: string;

  @Column({ nullable:true })
  assignedBy: string;

  // ── Acceptance tracking ──────────────────────────
  @Column({ type:'varchar', default:'pending', nullable:true })
  acceptanceStatus: 'pending' | 'accepted' | 'declined';

  @Column({ type:'timestamp with time zone', nullable:true })
  acceptedAt: Date;

  @Column({ type:'int', default:120 })
  acceptanceWindowMinutes: number;

  @Column({ type:'timestamp', nullable:true })
  acceptanceDeadline: Date;

  @Column({ default:false })
  acceptanceOverdue: boolean;

  @Column({ type:'text', nullable:true })
  declineReason: string;

  // ── AI predictions ───────────────────────────────
  // Likelihood (0–1) that this agent will complete this task on time,
  // computed from completion history, streak, proximity and availability at assignment time.
  @Column({ type:'decimal', precision:4, scale:3, nullable:true })
  aiCompletionScore: number;

  // Claude Vision photo verification result (set asynchronously after task completion)
  @Column({ nullable:true, default:null })
  photoVerified: boolean;

  @Column({ type:'text', nullable:true })
  photoVerificationNote: string;

  // ── Manager approval + payment ───────────────────
  @Column({ type:'decimal', precision:10, scale:2, nullable:true })
  paymentAmount: number;

  @Column({ type:'timestamp', nullable:true })
  approvedAt: Date;

  @Column({ nullable:true })
  approvedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
