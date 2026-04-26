import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum DisputeType {
  PAYMENT      = 'payment',       // money not released / wrong amount
  QUALITY      = 'quality',       // work delivered was substandard
  NON_DELIVERY = 'non_delivery',  // worker did not complete the job
  FRAUD        = 'fraud',         // suspected fraudulent activity
  HARASSMENT   = 'harassment',    // conduct between parties
  OTHER        = 'other',
}

export enum DisputeStatus {
  OPEN         = 'open',          // freshly filed, awaiting review
  UNDER_REVIEW = 'under_review',  // admin is actively investigating
  RESOLVED     = 'resolved',      // settled — payment/refund/no-action
  CLOSED       = 'closed',        // closed without resolution (withdrawn, duplicate)
}

export enum DisputeResolution {
  PAYMENT_RELEASED = 'payment_released',  // held funds sent to worker
  REFUND_ISSUED    = 'refund_issued',     // funds returned to employer/org
  PARTIAL_REFUND   = 'partial_refund',    // split payment
  NO_ACTION        = 'no_action',         // neither party at fault / inconclusive
  WARNING_ISSUED   = 'warning_issued',    // platform warning to a party
  ACCOUNT_SUSPENDED = 'account_suspended', // party suspended for breach
}

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Parties ───────────────────────────────────────
  /** User who raised the dispute */
  @Column({ type: 'uuid' })
  raisedById: string;

  /** User the dispute is filed against */
  @Column({ type: 'uuid' })
  againstUserId: string;

  /** Organisation involved (if applicable) */
  @Column({ type: 'uuid', nullable: true })
  organisationId: string;

  // ── Subject ───────────────────────────────────────
  /** Related job or task ID */
  @Column({ type: 'uuid', nullable: true })
  referenceId: string;

  /** 'job' | 'task' | 'payment' */
  @Column({ nullable: true })
  referenceType: string;

  // ── Content ───────────────────────────────────────
  @Column({ type: 'enum', enum: DisputeType })
  type: DisputeType;

  @Column({ type: 'enum', enum: DisputeStatus, default: DisputeStatus.OPEN })
  status: DisputeStatus;

  @Column({ type: 'text' })
  description: string;

  /** Amount in dispute (KES) */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amountKes: number;

  // ── Evidence ──────────────────────────────────────
  /** Array of URLs (screenshots, documents, photos) */
  @Column({ type: 'simple-json', nullable: true })
  evidenceUrls: string[];

  // ── Resolution ────────────────────────────────────
  @Column({ type: 'enum', enum: DisputeResolution, nullable: true })
  resolution: DisputeResolution;

  /** Admin who resolved the dispute */
  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string;

  @Column({ type: 'text', nullable: true })
  resolutionNote: string;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  refundAmountKes: number;

  // ── SLA tracking ──────────────────────────────────
  /** Deadline by which admin should respond (72 hours from filing) */
  @Column({ type: 'timestamp' })
  responseDeadline: Date;

  /** True if dispute was escalated past SLA */
  @Column({ default: false })
  isEscalated: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
