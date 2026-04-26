import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';

export enum PlanTier {
  FREE    = 'free',      // 0 agents, trial
  STARTER = 'starter',  // up to 10 agents — KES 2,999/mo
  GROWTH  = 'growth',   // up to 50 agents — KES 7,999/mo
  SCALE   = 'scale',    // up to 200 agents — KES 19,999/mo
  ENTERPRISE = 'enterprise', // unlimited — custom pricing
}

export enum SubStatus {
  ACTIVE   = 'active',
  TRIAL    = 'trial',
  PAST_DUE = 'past_due',
  EXPIRED  = 'expired',
  CANCELLED= 'cancelled',
}

export enum InvoiceStatus {
  DRAFT     = 'draft',
  PENDING   = 'pending',
  PAID      = 'paid',
  OVERDUE   = 'overdue',
  CANCELLED = 'cancelled',
}

export enum PaymentMethod {
  MPESA_PAYBILL = 'mpesa_paybill',
  MPESA_STK     = 'mpesa_stk',
  STRIPE        = 'stripe',
  FLUTTERWAVE   = 'flutterwave',
  BANK_TRANSFER = 'bank_transfer',
  MANUAL        = 'manual',
}

// Plan limits
export const PLAN_LIMITS: Record<PlanTier, { agents: number; jobs: number; priceKes: number }> = {
  [PlanTier.FREE]:       { agents: 2,   jobs: 5,    priceKes: 0 },
  [PlanTier.STARTER]:    { agents: 10,  jobs: 50,   priceKes: 2999 },
  [PlanTier.GROWTH]:     { agents: 50,  jobs: 500,  priceKes: 7999 },
  [PlanTier.SCALE]:      { agents: 200, jobs: 5000, priceKes: 19999 },
  [PlanTier.ENTERPRISE]: { agents: 9999, jobs: 9999, priceKes: 0 },
};

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  organisationId: string;

  @Column({ type: 'enum', enum: PlanTier, default: PlanTier.FREE })
  plan: PlanTier;

  @Column({ type: 'enum', enum: SubStatus, default: SubStatus.TRIAL })
  status: SubStatus;

  @Column({ type: 'timestamp' })
  currentPeriodStart: Date;

  @Column({ type: 'timestamp' })
  currentPeriodEnd: Date;

  @Column({ type: 'timestamp', nullable: true })
  trialEndsAt: Date;

  // Auto-renew
  @Column({ default: true })
  autoRenew: boolean;

  // External IDs for payment gateways
  @Column({ nullable: true })
  stripeCustomerId: string;

  @Column({ nullable: true })
  stripeSubscriptionId: string;

  @Column({ nullable: true })
  flutterwaveCustomerId: string;

  // M-Pesa paybill reference for this org
  @Column({ nullable: true })
  mpesaAccountRef: string;

  @Column({ nullable: true })
  cancelledAt: Date;

  @Column({ nullable: true })
  cancelReason: string;

  /**
   * Monthly Cathy Usage Unit (CUU) allowance for this subscription.
   * NULL = use the plan-level default from cathy_usage.py.
   * -1   = unlimited (Enterprise).
   * >0   = explicit cap (custom deals).
   */
  @Column({ type: 'integer', nullable: true, default: null })
  monthlyCuuLimit: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get isActive(): boolean {
    return [SubStatus.ACTIVE, SubStatus.TRIAL].includes(this.status) &&
           new Date() < this.currentPeriodEnd;
  }

  get daysRemaining(): number {
    return Math.max(0, Math.floor(
      (this.currentPeriodEnd.getTime() - Date.now()) / 86400000
    ));
  }
}

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organisationId: string;

  @Column()
  subscriptionId: string;

  @Column({ unique: true })
  invoiceNumber: string; // e.g. INV-2024-001

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amountKes: number;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.PENDING })
  status: InvoiceStatus;

  @Column({ type: 'enum', enum: PlanTier })
  plan: PlanTier;

  @Column({ type: 'timestamp' })
  dueDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod;

  // M-Pesa transaction code (e.g. QFX123ABC)
  @Column({ nullable: true })
  mpesaCode: string;

  // Stripe/Flutterwave charge ID
  @Column({ nullable: true })
  gatewayChargeId: string;

  // PDF URL once generated
  @Column({ nullable: true })
  pdfUrl: string;

  @Column({ type: 'simple-json', nullable: true })
  lineItems: Array<{ description: string; amount: number }>;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('payment_events')
export class PaymentEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organisationId: string;

  @Column({ nullable: true })
  invoiceId: string;

  @Column()
  source: string; // 'mpesa_webhook' | 'stripe_webhook' | 'flutterwave_webhook' | 'manual'

  @Column({ type: 'simple-json' })
  rawPayload: any;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: number;

  @Column({ nullable: true })
  reference: string;

  @Column({ default: false })
  processed: boolean;

  @Column({ nullable: true })
  processedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
