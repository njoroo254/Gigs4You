import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { WalletTransaction, TransactionType, TransactionStatus } from './wallet.entity';
import { MpesaService } from './mpesa.service';
import { EmailService } from '../email/email.service';

const MAX_RECONCILIATION_ATTEMPTS = 3;
const PENDING_AGE_MINUTES         = 10;

@Injectable()
export class WalletReconciler {
  private readonly log = new Logger(WalletReconciler.name);

  constructor(
    @InjectRepository(WalletTransaction)
    private readonly txRepo: Repository<WalletTransaction>,
    private readonly mpesa: MpesaService,
    private readonly email: EmailService,
  ) {}

  @Cron('0 */30 * * * *')
  async reconcilePending(): Promise<void> {
    const cutoff = new Date(Date.now() - PENDING_AGE_MINUTES * 60 * 1000);

    const pending = await this.txRepo.find({
      where: {
        status:    TransactionStatus.PENDING,
        type:      In([TransactionType.DEBIT, TransactionType.CREDIT]),
        createdAt: LessThan(cutoff),
      },
    });

    if (pending.length === 0) return;

    this.log.log(`Reconciler: found ${pending.length} PENDING transaction(s) older than ${PENDING_AGE_MINUTES} min`);

    let queried   = 0;
    let abandoned = 0;

    for (const tx of pending) {
      const attempts = (tx.reconciliationAttempts ?? 0) + 1;

      if (attempts > MAX_RECONCILIATION_ATTEMPTS) {
        // Already at cap from a previous run — mark failed and alert
        await this.markReconciliationFailed(tx);
        abandoned++;
        continue;
      }

      // Increment attempt counter
      await this.txRepo.update(tx.id, { reconciliationAttempts: attempts });

      if (attempts >= MAX_RECONCILIATION_ATTEMPTS) {
        // This is the last attempt — fire the status query then flag it
        await this.fireStatusQuery(tx);
        await this.markReconciliationFailed(tx);
        abandoned++;
      } else {
        // Still within attempt budget — re-trigger Daraja status query
        await this.fireStatusQuery(tx);
        queried++;
      }
    }

    this.log.log(
      `Reconciler run complete: ${queried} status queries triggered, ${abandoned} transaction(s) marked RECONCILIATION_FAILED`,
    );
  }

  private async fireStatusQuery(tx: WalletTransaction): Promise<void> {
    try {
      await this.mpesa.queryTransactionStatus({
        transactionId:            tx.mpesaRef          || undefined,
        originatorConversationId: tx.mpesaConversationId || undefined,
        remarks:                  `Reconciliation attempt for tx ${tx.id}`,
      });
      this.log.log(`Reconciler: queued Daraja status check for tx ${tx.id} (ref=${tx.reference})`);
    } catch (err: any) {
      // Non-fatal — Daraja may be temporarily unavailable; we'll retry next cron run
      this.log.warn(`Reconciler: Daraja status query failed for tx ${tx.id}: ${err?.message}`);
    }
  }

  private async markReconciliationFailed(tx: WalletTransaction): Promise<void> {
    await this.txRepo.update(tx.id, { status: TransactionStatus.RECONCILIATION_FAILED });

    this.log.error(
      `Reconciler: tx ${tx.id} (ref=${tx.reference}, type=${tx.type}, amount=${tx.amount}) ` +
      `marked RECONCILIATION_FAILED after ${MAX_RECONCILIATION_ATTEMPTS} attempts without M-Pesa callback`,
    );

    const ts    = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
    const html  = `
      <div style="font-family:Arial,sans-serif;max-width:600px">
        <h2 style="color:#dc2626">M-Pesa Reconciliation Failure</h2>
        <p>A wallet transaction could not be reconciled after <strong>${MAX_RECONCILIATION_ATTEMPTS} Daraja status queries</strong>.</p>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Transaction ID</td><td style="padding:8px;border:1px solid #e5e7eb">${tx.id}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #e5e7eb">${tx.reference || '-'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Type</td><td style="padding:8px;border:1px solid #e5e7eb">${tx.type}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Amount</td><td style="padding:8px;border:1px solid #e5e7eb">KES ${tx.amount}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">M-Pesa Conversation ID</td><td style="padding:8px;border:1px solid #e5e7eb">${tx.mpesaConversationId || '-'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">M-Pesa Ref</td><td style="padding:8px;border:1px solid #e5e7eb">${tx.mpesaRef || '-'}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Created At</td><td style="padding:8px;border:1px solid #e5e7eb">${tx.createdAt?.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Detected At</td><td style="padding:8px;border:1px solid #e5e7eb">${ts}</td></tr>
        </table>
        <p style="color:#6b7280;font-size:12px;margin-top:24px">
          Action required: manually verify this transaction in the Daraja portal and update the ledger if necessary.
        </p>
      </div>
    `;

    await this.email.sendAdminAlert(
      `Unreconciled M-Pesa transaction — ${tx.reference || tx.id}`,
      html,
    );
  }
}
