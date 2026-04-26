import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import type Redis from 'ioredis';
import {
  Wallet,
  WalletTransaction,
  TransactionStatus,
  TransactionType,
} from './wallet.entity';
import { MpesaService } from './mpesa.service';
import { FraudService } from './fraud.service';
import { PushService } from '../push/push.service';
import { NotificationService } from '../notifications-gateway/notification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { ApiCacheService } from '../common/cache/api-cache.service';
import { User } from '../users/user.entity';
import { REDIS_CLIENT } from '../common/redis.provider';

@Injectable()
export class WalletService {
  private readonly log = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private txRepo: Repository<WalletTransaction>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectDataSource()
    private dataSource: DataSource,
    @Optional() private mpesaService: MpesaService,
    @Optional() private pushService: PushService,
    @Optional() private notificationService: NotificationService,
    @Optional() private notificationsService: NotificationsService,
    @Optional() private auditService: AuditService,
    @Optional() private cacheService: ApiCacheService,
    private fraudService: FraudService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getOrCreate(agentId: string): Promise<Wallet> {
    let wallet = await this.walletRepo.findOne({ where: { agentId } });
    if (!wallet) {
      wallet = this.walletRepo.create({ agentId, balance: 0, pendingBalance: 0 });
      wallet = await this.walletRepo.save(wallet);
    }
    return wallet;
  }

  async findByAgent(agentId: string): Promise<Wallet> {
    return this.getOrCreate(agentId);
  }

  async creditAgent(
    agentId: string,
    amount: number,
    description: string,
    jobId?: string,
  ): Promise<WalletTransaction> {
    const wallet = await this.getOrCreate(agentId);

    await this.walletRepo.increment({ id: wallet.id }, 'balance', amount);
    await this.walletRepo.increment({ id: wallet.id }, 'totalEarned', amount);
    this.pushService?.notifyPaymentReceivedByAgentId(agentId, amount)
      .catch((err) => this.log.error(`Push (creditAgent) failed for agent ${agentId}: ${(err as Error).message}`));
    this.notifyAgentPayment(agentId, amount, description);

    const tx = this.txRepo.create({
      walletId: wallet.id,
      type: TransactionType.CREDIT,
      amount,
      description,
      status: TransactionStatus.COMPLETED,
      jobId,
      reference: this.genRef('TXN'),
    });
    const saved = await this.saveLedgerEntry(tx);
    this.invalidateStatsCache().catch(() => {});
    return saved;
  }

  async addPending(agentId: string, amount: number, description: string): Promise<void> {
    const wallet = await this.getOrCreate(agentId);
    await this.walletRepo.increment({ id: wallet.id }, 'pendingBalance', amount);
    await this.saveLedgerEntry(this.txRepo.create({
      walletId: wallet.id,
      type: TransactionType.PENDING,
      amount,
      description,
      status: TransactionStatus.PENDING,
      reference: this.genRef('PND'),
    }));
  }

  private genRef(prefix: string): string {
    const year = new Date().getFullYear();
    const randomPart = Math.random().toString(36).substring(2, 9).toUpperCase();
    return `${prefix}-${year}-${randomPart}`;
  }

  private getWithdrawalLockKey(walletId: string): string {
    return `wallet:withdraw:${walletId}`;
  }

  private async reserveWithdrawal(walletId: string, amount: number): Promise<boolean> {
    const result = await this.walletRepo
      .createQueryBuilder()
      .update(Wallet)
      .set({
        balance: () => `balance - ${amount}`,
        pendingBalance: () => `"pendingBalance" + ${amount}`,
      })
      .where('id = :id AND balance >= :amount', { id: walletId, amount })
      .execute();

    return !!result.affected && result.affected > 0;
  }

  private async releaseReservedWithdrawal(walletId: string, amount: number): Promise<void> {
    await this.walletRepo
      .createQueryBuilder()
      .update(Wallet)
      .set({
        balance: () => `balance + ${amount}`,
        pendingBalance: () => `GREATEST("pendingBalance" - ${amount}, 0)`,
      })
      .where('id = :id', { id: walletId })
      .execute();
  }

  async requestWithdrawal(
    agentId: string,
    amount: number,
    mpesaPhone: string,
  ): Promise<WalletTransaction> {
    if (amount < 10) throw new BadRequestException('Minimum withdrawal is KES 10');

    // Redis distributed lock guards against duplicate concurrent requests at the
    // application layer. The DB-level FOR UPDATE + CHECK constraint below are the
    // hard stops that protect against races even if the Redis lock fails.
    const walletStub = await this.getOrCreate(agentId);
    const lockKey = this.getWithdrawalLockKey(walletStub.id);
    const lock = await this.redis.set(lockKey, '1', 'EX', 30, 'NX');
    if (!lock) {
      throw new BadRequestException(
        'A withdrawal is already being processed. Please wait for it to complete.',
      );
    }

    // Fraud check happens outside the transaction — it's read-only and slow.
    let fraudScore: number | undefined;
    let isFraudFlagged = false;
    const fraud = await this.fraudService.assertSafe(walletStub.id, amount);
    if (fraud.shouldFlag) {
      fraudScore = fraud.score;
      isFraudFlagged = true;
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let saved: WalletTransaction;

    try {
      // Pessimistic write lock — serialises all writers on this wallet row.
      const wallet = await qr.manager.findOne(Wallet, {
        where: { id: walletStub.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) throw new NotFoundException('Wallet not found');

      const available = Number(wallet.balance);
      if (amount > available) {
        throw new BadRequestException(
          `Insufficient balance. Available: KES ${available.toFixed(2)}`,
        );
      }

      const inFlight = await qr.manager.findOne(WalletTransaction, {
        where: { walletId: wallet.id, type: TransactionType.DEBIT, status: TransactionStatus.PENDING },
      });
      if (inFlight) {
        throw new BadRequestException(
          'A withdrawal is already pending. Wait for it to complete before requesting another.',
        );
      }

      // Deduct balance and move to pending — both inside the transaction.
      wallet.balance         = available - amount;
      wallet.pendingBalance  = Number(wallet.pendingBalance) + amount;
      await qr.manager.save(wallet);

      // Build the ledger entry inside the transaction so hash chain is consistent.
      const txId = randomUUID();
      const prev = await qr.manager.findOne(WalletTransaction, {
        where: { walletId: wallet.id },
        order: { createdAt: 'DESC' },
        select: ['id', 'hash'],
      });
      const previousHash = prev?.hash ?? '0'.repeat(64);
      const reference    = `WD-${Date.now()}`;
      const raw          = `${previousHash}:${txId}:${amount}:${wallet.id}:${TransactionStatus.PENDING}`;

      const txEntity = qr.manager.create(WalletTransaction, {
        id: txId,
        walletId: wallet.id,
        type: TransactionType.DEBIT,
        amount,
        description: `M-Pesa withdrawal to ${mpesaPhone}`,
        status: TransactionStatus.PENDING,
        reference,
        mpesaPhone,
        fraudScore,
        isFraudFlagged,
        previousHash,
        hash: createHash('sha256').update(raw).digest('hex'),
      });
      saved = await qr.manager.save(txEntity);

      await qr.commitTransaction();
    } catch (err: any) {
      await qr.rollbackTransaction();
      // Postgres CHECK (balance >= 0) violation → 402 Payment Required
      if (err?.code === '23514') {
        throw new HttpException('Insufficient balance', 402);
      }
      // Postgres optimistic-lock version mismatch
      if (err?.code === '23505' || err?.name === 'OptimisticLockVersionMismatchError') {
        throw new BadRequestException('Balance was modified concurrently — please retry.');
      }
      throw err;
    } finally {
      await qr.release();
      await this.redis.del(lockKey).catch(() => {});
    }

    this.auditService?.record({
      action: 'WITHDRAWAL_REQUESTED',
      entity: 'WalletTransaction',
      entityId: saved.id,
      details: { amount, reference: saved.reference, fraudFlagged: isFraudFlagged },
    }).catch(() => {});

    if (this.mpesaService) {
      try {
        const b2cResult = await this.mpesaService.b2cPayment({
          phone: mpesaPhone,
          amount,
          commandId: 'BusinessPayment',
          remarks: `Gigs4You payout - ${saved.reference}`,
        });
        await this.walletRepo.update(walletStub.id, { mpesaPhone });
        await this.txRepo.update(saved.id, {
          mpesaConversationId: b2cResult.OriginatorConversationID || b2cResult.ConversationID,
        });
        return saved;
      } catch (err) {
        await this.failTransaction(saved.id, `M-Pesa payout request failed: ${(err as Error).message}`);
        throw new BadRequestException(
          `M-Pesa payout request failed: ${(err as Error).message}. Transaction cancelled.`,
        );
      }
    }

    await this.walletRepo.update(walletStub.id, { mpesaPhone });
    await this.completeWithdrawal(saved.id);
    saved.status = TransactionStatus.COMPLETED;
    return saved;
  }

  async getTransactions(
    agentId: string,
    limit = 30,
  ): Promise<WalletTransaction[]> {
    const wallet = await this.getOrCreate(agentId);
    return this.txRepo.find({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async createPendingCredit(
    agentId: string,
    amount: number,
    description: string,
    mpesaPhone: string,
  ): Promise<WalletTransaction> {
    const wallet = await this.getOrCreate(agentId);
    const tx = this.txRepo.create({
      walletId: wallet.id,
      type: TransactionType.CREDIT,
      amount,
      description,
      status: TransactionStatus.PENDING,
      reference: this.genRef('TXN'),
      mpesaPhone,
    });
    return this.saveLedgerEntry(tx);
  }

  async completeCredit(txId: string): Promise<void> {
    const tx = await this.txRepo.findOne({ where: { id: txId } });
    if (!tx || tx.status !== TransactionStatus.PENDING || tx.type !== TransactionType.CREDIT) {
      return;
    }

    await this.walletRepo.increment({ id: tx.walletId }, 'balance', Number(tx.amount));
    await this.walletRepo.increment({ id: tx.walletId }, 'totalEarned', Number(tx.amount));
    await this.txRepo.update(txId, { status: TransactionStatus.COMPLETED });

    const wallet = await this.walletRepo.findOne({ where: { id: tx.walletId }, select: ['agentId'] });
    if (wallet) {
      this.pushService?.notifyPaymentReceivedByAgentId(wallet.agentId, Number(tx.amount))
        .catch((err) => this.log.error(`Push (completeCredit) failed for agent ${wallet.agentId}: ${(err as Error).message}`));
      this.notifyAgentPayment(wallet.agentId, Number(tx.amount), tx.description);
    }
  }

  async completeWithdrawal(txId: string): Promise<void> {
    const tx = await this.txRepo.findOne({ where: { id: txId } });
    if (!tx || tx.status !== TransactionStatus.PENDING || tx.type !== TransactionType.DEBIT) {
      return;
    }

    const txAmount = Number(tx.amount);
    const settleResult = await this.walletRepo
      .createQueryBuilder()
      .update(Wallet)
      .set({
        pendingBalance: () => `GREATEST("pendingBalance" - ${txAmount}, 0)`,
        totalWithdrawn: () => `"totalWithdrawn" + ${txAmount}`,
      })
      .where('id = :id AND "pendingBalance" >= :amount', { id: tx.walletId, amount: txAmount })
      .execute();

    if (!settleResult.affected || settleResult.affected === 0) {
      this.log.error(`completeWithdrawal: pending balance check failed for tx ${txId}`);
      await this.txRepo.update(txId, {
        status: TransactionStatus.FAILED,
        description: `${tx.description} (failed during settlement)`,
      });
      return;
    }

    await this.txRepo.update(txId, { status: TransactionStatus.COMPLETED });
    this.invalidateStatsCache().catch(() => {});
    this.auditService?.record({
      action: 'WITHDRAWAL_COMPLETED',
      entity: 'WalletTransaction',
      entityId: txId,
      details: { amount: txAmount },
    }).catch(() => {});
  }

  async updateTransactionConversationId(txId: string, conversationId: string): Promise<void> {
    await this.txRepo.update(txId, { mpesaConversationId: conversationId });
  }

  async failTransaction(txId: string, reason: string): Promise<void> {
    const tx = await this.txRepo.findOne({ where: { id: txId } });
    if (!tx || tx.status !== TransactionStatus.PENDING) {
      return;
    }

    if (tx.type === TransactionType.DEBIT) {
      await this.releaseReservedWithdrawal(tx.walletId, Number(tx.amount));
    }

    await this.txRepo.update(txId, {
      status: TransactionStatus.FAILED,
      description: `${tx.description} (failed: ${reason})`,
    });
    this.auditService?.record({
      action: 'TRANSACTION_FAILED',
      entity: 'WalletTransaction',
      entityId: txId,
      details: { reason },
    }).catch(() => {});
  }

  async findTransactionByConversationId(conversationId: string): Promise<WalletTransaction | null> {
    return this.txRepo.findOne({ where: { mpesaConversationId: conversationId } });
  }

  async issueRefund(
    agentId: string,
    amount: number,
    reason: string,
    disputeId?: string,
  ): Promise<WalletTransaction> {
    if (amount <= 0) throw new BadRequestException('Refund amount must be positive');
    const wallet = await this.getOrCreate(agentId);

    await this.walletRepo.increment({ id: wallet.id }, 'balance', amount);
    await this.walletRepo.increment({ id: wallet.id }, 'totalEarned', amount);

    const tx = this.txRepo.create({
      walletId: wallet.id,
      type: TransactionType.REFUND,
      amount,
      description: `Refund: ${reason}`,
      status: TransactionStatus.COMPLETED,
      reference: disputeId
        ? `REF-DISPUTE-${disputeId.slice(0, 8).toUpperCase()}`
        : this.genRef('REF'),
    });
    const saved = await this.saveLedgerEntry(tx);

    this.pushService?.notifyPaymentReceivedByAgentId(agentId, amount)
      .catch((err) => this.log.error(`Push (issueRefund) failed for agent ${agentId}: ${(err as Error).message}`));
    this.notifyAgentRefund(agentId, amount, reason);

    return saved;
  }

  private notifyAgentPayment(agentId: string, amount: number, description: string): void {
    this.resolveUserForAgent(agentId).then((user) => {
      if (!user) return;
      this.notificationsService?.notifyPayment(user.id, amount, description);
      this.notificationService?.notifyPaymentReceived({
        phone: user.phone,
        email: user.email,
        name: user.name,
        amount,
        description,
      }).catch((err) => this.log.error(`SMS/email (payment) failed for user ${user.id}: ${(err as Error).message}`));
    }).catch((err) => this.log.error(`notifyAgentPayment failed for agent ${agentId}: ${(err as Error).message}`));
  }

  private notifyAgentRefund(agentId: string, amount: number, reason: string): void {
    this.resolveUserForAgent(agentId).then((user) => {
      if (!user) return;
      this.notificationsService?.notifyRefund(user.id, amount, reason);
      this.notificationService?.notifyPaymentReceived({
        phone: user.phone,
        email: user.email,
        name: user.name,
        amount,
        description: `Refund: ${reason}`,
      }).catch((err) => this.log.error(`SMS/email (refund) failed for user ${user.id}: ${(err as Error).message}`));
    }).catch((err) => this.log.error(`notifyAgentRefund failed for agent ${agentId}: ${(err as Error).message}`));
  }

  private async resolveUserForAgent(agentId: string): Promise<User | null> {
    const direct = await this.userRepo.findOne({ where: { id: agentId } });
    if (direct) return direct;
    return null;
  }

  private async saveLedgerEntry(tx: WalletTransaction): Promise<WalletTransaction> {
    if (!tx.id) tx.id = randomUUID();

    const prev = await this.txRepo.findOne({
      where: { walletId: tx.walletId },
      order: { createdAt: 'DESC' },
      select: ['id', 'hash'],
    });
    const previousHash = prev?.hash ?? '0'.repeat(64);

    const raw = `${previousHash}:${tx.id}:${tx.amount}:${tx.walletId}:${tx.status}`;
    tx.previousHash = previousHash;
    tx.hash = createHash('sha256').update(raw).digest('hex');

    return this.txRepo.save(tx);
  }

  async reverseTransaction(txId: string): Promise<WalletTransaction> {
    const tx = await this.txRepo.findOne({ where: { id: txId } });
    if (!tx) throw new NotFoundException(`Transaction ${txId} not found`);
    if (tx.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('Only completed transactions can be reversed');
    }

    const wallet = await this.walletRepo.findOne({ where: { id: tx.walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const txAmount = Number(tx.amount);
    let reversal: WalletTransaction;

    if (tx.type === TransactionType.CREDIT || tx.type === TransactionType.REFUND) {
      const reverseCreditResult = await this.walletRepo
        .createQueryBuilder()
        .update(Wallet)
        .set({
          balance: () => `balance - ${txAmount}`,
          totalEarned: () => `GREATEST("totalEarned" - ${txAmount}, 0)`,
        })
        .where('id = :id AND balance >= :amount', { id: wallet.id, amount: txAmount })
        .execute();

      if (!reverseCreditResult.affected || reverseCreditResult.affected === 0) {
        throw new BadRequestException('Insufficient current wallet balance to reverse this credit');
      }

      reversal = this.txRepo.create({
        walletId: wallet.id,
        type: TransactionType.DEBIT,
        amount: tx.amount,
        description: `Reversal of ${tx.type}: ${tx.description}`,
        status: TransactionStatus.COMPLETED,
        reference: `REV-${tx.type.toUpperCase()}-${tx.id}`,
        jobId: tx.jobId,
      });
    } else if (tx.type === TransactionType.DEBIT) {
      await this.walletRepo.increment({ id: wallet.id }, 'balance', txAmount);
      await this.walletRepo
        .createQueryBuilder()
        .update(Wallet)
        .set({
          totalWithdrawn: () => `GREATEST("totalWithdrawn" - ${txAmount}, 0)`,
        })
        .where('id = :id', { id: wallet.id })
        .execute();

      reversal = this.txRepo.create({
        walletId: wallet.id,
        type: TransactionType.CREDIT,
        amount: tx.amount,
        description: `Reversal of debit: ${tx.description}`,
        status: TransactionStatus.COMPLETED,
        reference: `REV-DEBIT-${tx.id}`,
        jobId: tx.jobId,
      });
    } else {
      throw new BadRequestException('Cannot reverse this transaction type');
    }

    const saved = await this.saveLedgerEntry(reversal);
    // Audit: record reversal event for admin actions
    try {
      await this.auditService?.record({
        action: 'WALLET_REVERSAL',
        entity: 'WalletTransaction',
        entityId: saved.id,
        details: { originalTxId: txId, amount: Number(tx.amount) },
      }).catch(() => {});
    } catch {
      // Ignore audit failures to avoid blocking reversal flow
    }
    return saved;
  }

  async getPlatformStats(fromDate?: Date, toDate?: Date) {
    // Default: last 30 days. Max: 90 days.
    const now  = new Date();
    const from = fromDate ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to   = toDate   ?? now;

    const rangeMs = to.getTime() - from.getTime();
    if (rangeMs > 90 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Date range cannot exceed 90 days');
    }

    // Cache key encodes the date bucket (5-minute slots) so stale data never exceeds 5 min.
    const bucket  = Math.floor(Date.now() / (5 * 60 * 1000));
    const cacheKey = `wallet:platform-stats:${bucket}:${from.toISOString().slice(0, 10)}:${to.toISOString().slice(0, 10)}`;
    const cached   = await this.cacheService?.get<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const [walletStats, txStats] = await Promise.all([
      this.walletRepo.createQueryBuilder('w')
        .select('COUNT(*)', 'walletCount')
        .addSelect('COALESCE(SUM(w.balance), 0)', 'totalBalance')
        .addSelect('COALESCE(SUM(w."totalEarned"), 0)', 'totalEarned')
        .addSelect('COALESCE(SUM(w."totalWithdrawn"), 0)', 'totalWithdrawn')
        .getRawOne(),

      this.txRepo.createQueryBuilder('t')
        .select('COUNT(*)', 'total')
        .addSelect(`COUNT(CASE WHEN t.status = '${TransactionStatus.COMPLETED}' THEN 1 END)`, 'completed')
        .addSelect(`COUNT(CASE WHEN t.status = '${TransactionStatus.PENDING}' THEN 1 END)`, 'pending')
        .addSelect(`COUNT(CASE WHEN t.status = '${TransactionStatus.FAILED}' THEN 1 END)`, 'failed')
        .addSelect('COALESCE(SUM(CASE WHEN t.type = \'credit\' AND t.status = \'completed\' THEN t.amount ELSE 0 END), 0)', 'totalCredited')
        .addSelect('COALESCE(SUM(CASE WHEN t.type = \'debit\'  AND t.status = \'completed\' THEN t.amount ELSE 0 END), 0)', 'totalDebited')
        .where('t."createdAt" BETWEEN :from AND :to', { from, to })
        .getRawOne(),
    ]);

    const result = {
      wallets:        Number(walletStats?.walletCount   ?? 0),
      totalBalance:   Number(walletStats?.totalBalance  ?? 0),
      totalEarned:    Number(walletStats?.totalEarned   ?? 0),
      totalWithdrawn: Number(walletStats?.totalWithdrawn ?? 0),
      period: { from: from.toISOString(), to: to.toISOString() },
      transactions: {
        total:        Number(txStats?.total         ?? 0),
        completed:    Number(txStats?.completed     ?? 0),
        pending:      Number(txStats?.pending       ?? 0),
        failed:       Number(txStats?.failed        ?? 0),
        totalCredited: Number(txStats?.totalCredited ?? 0),
        totalDebited:  Number(txStats?.totalDebited  ?? 0),
      },
    };

    await this.cacheService?.set(cacheKey, result, 5 * 60); // 5-minute TTL
    return result;
  }

  /** Call after any committed transaction to bust the stats cache for the current bucket. */
  private async invalidateStatsCache(): Promise<void> {
    const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const pattern = `wallet:platform-stats:${bucket}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length) await this.redis.del(...keys);
  }

  /**
   * Walk the ledger hash chain for a wallet and verify every link.
   * Returns { valid: true, count } on success or { valid: false, firstBrokenAt, details }
   * on the first broken link.  Skips rows with null hash (pre-chain rows).
   */
  async verifyChain(walletId: string): Promise<{
    valid: boolean;
    count: number;
    firstBrokenAt?: string;
    details?: string;
  }> {
    const txs = await this.txRepo.find({
      where: { walletId },
      order: { createdAt: 'ASC' },
      select: ['id', 'amount', 'walletId', 'status', 'previousHash', 'hash', 'createdAt'],
    });

    let expectedPrevious = '0'.repeat(64);
    let verified = 0;

    for (const tx of txs) {
      if (!tx.hash) {
        // Pre-chain row — reset chain anchor to this row's hash (null → continue)
        expectedPrevious = '0'.repeat(64);
        continue;
      }

      if (tx.previousHash !== expectedPrevious) {
        return {
          valid: false,
          count: verified,
          firstBrokenAt: tx.id,
          details: `previousHash mismatch: expected ${expectedPrevious.slice(0, 8)}… got ${(tx.previousHash ?? 'null').slice(0, 8)}…`,
        };
      }

      const raw      = `${tx.previousHash}:${tx.id}:${tx.amount}:${tx.walletId}:${tx.status}`;
      const computed = createHash('sha256').update(raw).digest('hex');

      if (tx.hash !== computed) {
        return {
          valid: false,
          count: verified,
          firstBrokenAt: tx.id,
          details: `hash mismatch: stored ${tx.hash.slice(0, 8)}… computed ${computed.slice(0, 8)}…`,
        };
      }

      expectedPrevious = tx.hash;
      verified++;
    }

    return { valid: true, count: verified };
  }
}
