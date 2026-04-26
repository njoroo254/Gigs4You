/**
 * FraudService — runtime fraud scoring for wallet withdrawal requests.
 *
 * Scoring model (0–1, higher = more suspicious):
 *   - Withdrawal frequency: >3 DEBITs in last 24h          → +0.35
 *   - Amount spike: this amount > 3× 30-day completed avg  → +0.40
 *   - First-ever withdrawal                                 → +0.10 (informational)
 *
 * Decision thresholds:
 *   - score ≥ 0.90 → BLOCK (throw)
 *   - score ≥ 0.60 → FLAG  (record score, allow with note)
 *   - score < 0.60 → PASS
 */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Wallet, WalletTransaction, TransactionType, TransactionStatus } from './wallet.entity';

export interface FraudResult {
  score:       number;    // 0–1
  flags:       string[];
  shouldFlag:  boolean;   // score ≥ 0.60
  shouldBlock: boolean;   // score ≥ 0.90
}

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(
    @InjectRepository(WalletTransaction) private txRepo:     Repository<WalletTransaction>,
    @InjectRepository(Wallet)            private walletRepo: Repository<Wallet>,
  ) {}

  async scoreWithdrawal(walletId: string, amount: number): Promise<FraudResult> {
    const flags: string[] = [];
    let riskScore = 0;

    // ── Check 1: High withdrawal frequency (>3 in last 24h) ────────────────
    const since24h = new Date(Date.now() - 86_400_000);
    const recentCount = await this.txRepo.count({
      where: { walletId, type: TransactionType.DEBIT, createdAt: MoreThan(since24h) },
    });
    if (recentCount >= 3) {
      flags.push(`High frequency: ${recentCount} withdrawals in the last 24 h`);
      riskScore += 0.35;
    }

    // ── Check 2: Amount spike vs 30-day completed average ───────────────────
    const since30d = new Date(Date.now() - 30 * 86_400_000);
    const completed30d = await this.txRepo.find({
      where: {
        walletId,
        type:   TransactionType.DEBIT,
        status: TransactionStatus.COMPLETED,
        createdAt: MoreThan(since30d),
      },
      select: ['amount'],
    });
    if (completed30d.length >= 3) {
      const avg = completed30d.reduce((s, t) => s + Number(t.amount), 0) / completed30d.length;
      if (amount > avg * 3) {
        flags.push(
          `Amount spike: KES ${amount.toFixed(0)} is ${(amount / avg).toFixed(1)}× the 30-day average (KES ${avg.toFixed(0)})`,
        );
        riskScore += 0.40;
      }
    }

    // ── Check 3: First-ever withdrawal ─────────────────────────────────────
    const wallet = await this.walletRepo.findOne({ where: { id: walletId }, select: ['totalWithdrawn'] });
    if (wallet && Number(wallet.totalWithdrawn) === 0) {
      flags.push('First ever withdrawal from this wallet');
      riskScore += 0.10;
    }

    riskScore = Math.min(1, Math.round(riskScore * 1000) / 1000);

    const result: FraudResult = {
      score:       riskScore,
      flags,
      shouldFlag:  riskScore >= 0.60,
      shouldBlock: riskScore >= 0.90,
    };

    if (result.shouldBlock) {
      this.logger.warn(
        `FRAUD BLOCK — walletId=${walletId} amount=${amount} score=${riskScore} flags=${flags.join('; ')}`,
      );
    } else if (result.shouldFlag) {
      this.logger.warn(
        `FRAUD FLAG  — walletId=${walletId} amount=${amount} score=${riskScore} flags=${flags.join('; ')}`,
      );
    }

    return result;
  }

  /**
   * Throws BadRequestException when the withdrawal should be blocked.
   * Callers should then persist the fraudScore/isFraudFlagged on the transaction.
   */
  async assertSafe(walletId: string, amount: number): Promise<FraudResult> {
    const result = await this.scoreWithdrawal(walletId, amount);
    if (result.shouldBlock) {
      throw new BadRequestException(
        `Withdrawal blocked by fraud check (risk score ${result.score.toFixed(2)}). ` +
        `Flags: ${result.flags.join('; ')}. Contact support if this is unexpected.`,
      );
    }
    return result;
  }
}
