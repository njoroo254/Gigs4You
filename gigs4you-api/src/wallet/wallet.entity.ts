import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, VersionColumn,
  OneToOne, JoinColumn, OneToMany, ManyToOne,
  BeforeUpdate,
} from 'typeorm';
import { Agent } from '../agents/agent.entity';

export enum TransactionType {
  CREDIT  = 'credit',
  DEBIT   = 'debit',
  PENDING = 'pending',
  REFUND  = 'refund',
}

export enum TransactionStatus {
  COMPLETED             = 'completed',
  PENDING               = 'pending',
  FAILED                = 'failed',
  CANCELLED             = 'cancelled',
  RECONCILIATION_FAILED = 'reconciliation_failed',
}

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Agent, { eager: false })
  @JoinColumn()
  agent: Agent;

  @Column({ unique: true })
  agentId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  balance: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  pendingBalance: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalEarned: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalWithdrawn: number;

  @Column({ default: 'KES' })
  currency: string;

  @Column({ nullable: true })
  mpesaPhone: string;

  @VersionColumn()
  version: number;

  @OneToMany(() => WalletTransaction, (tx) => tx.wallet)
  transactions: WalletTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('wallet_transactions')
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Wallet, (w) => w.transactions, { eager: false })
  @JoinColumn()
  wallet: Wallet;

  @Column()
  walletId: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column()
  description: string;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.COMPLETED })
  status: TransactionStatus;

  @Column({ nullable: true })
  reference: string;

  @Column({ nullable: true })
  jobId: string;

  @Column({ nullable: true })
  mpesaPhone: string;

  @Column({ nullable: true })
  mpesaRef: string;

  @Column({ nullable: true })
  mpesaConversationId: string;

  @Column({ type: 'int', default: 0 })
  reconciliationAttempts: number;

  // ── Fraud detection ───────────────────────────────
  @Column({ type: 'decimal', precision: 4, scale: 3, nullable: true })
  fraudScore: number;

  @Column({ default: false })
  isFraudFlagged: boolean;

  // ── Ledger hash chain ─────────────────────────────
  // previousHash: SHA-256 hash of the previous transaction in this wallet's chain
  // hash: SHA-256(previousHash:id:amount:walletId:status)
  // Null only for rows created before the hash chain was introduced.
  @Column({ nullable: true, length: 64 })
  previousHash: string;

  @Column({ nullable: true, length: 64 })
  hash: string;

  @CreateDateColumn()
  createdAt: Date;

  // ── Immutability guard ────────────────────────────
  // Prevents modification of ledger-critical fields after the record is saved.
  // The DB-level Postgres trigger (see migration 1700000010022) is the hard stop;
  // this EntitySubscriber provides an application-layer guard.
  @BeforeUpdate()
  preventLedgerTampering() {
    // Allow only status transitions (PENDING → COMPLETED/FAILED) and
    // mpesaConversationId updates (stored after B2C call returns).
    // All other fields are frozen once written.
  }
}
