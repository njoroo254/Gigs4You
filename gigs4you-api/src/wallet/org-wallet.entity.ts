import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum OrgTxType {
  DEPOSIT      = 'deposit',       // Admin topped up via M-Pesa / Paybill
  DISBURSEMENT = 'disbursement',  // Paid out to an agent
  REFUND       = 'refund',        // Failed payout reversed
}

export enum OrgTxStatus {
  COMPLETED = 'completed',
  PENDING   = 'pending',
  FAILED    = 'failed',
}

// ── One wallet per organisation ───────────────────────────────────────────────
@Entity('org_wallets')
export class OrgWallet {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ unique: true })
  @Index()
  organisationId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  balance: number;           // available for payouts

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  pendingBalance: number;    // in-flight / unconfirmed

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalDeposited: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalDisbursed: number;

  @Column({ default: 'KES' }) currency: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

// ── Per-transaction ledger ────────────────────────────────────────────────────
@Entity('org_wallet_transactions')
@Index(['orgWalletId', 'createdAt'])
export class OrgWalletTransaction {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() orgWalletId: string;

  @Column({ type: 'enum', enum: OrgTxType })
  type: OrgTxType;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column() description: string;

  @Column({ nullable: true }) reference: string;   // invoice number / M-Pesa code
  @Column({ nullable: true }) mpesaRef: string;    // Safaricom transaction ID
  @Column({ nullable: true }) agentId: string;     // set for disbursements
  @Column({ nullable: true }) initiatedBy: string; // userId of admin/manager who acted

  @Column({ type: 'enum', enum: OrgTxStatus, default: OrgTxStatus.COMPLETED })
  status: OrgTxStatus;

  @CreateDateColumn() createdAt: Date;
}
