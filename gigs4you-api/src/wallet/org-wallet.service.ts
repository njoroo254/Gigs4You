import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import {
  OrgWallet,
  OrgWalletTransaction,
  OrgTxType,
  OrgTxStatus,
} from './org-wallet.entity';

@Injectable()
export class OrgWalletService {
  constructor(
    @InjectRepository(OrgWallet)
    private walletRepo: Repository<OrgWallet>,
    @InjectRepository(OrgWalletTransaction)
    private txRepo: Repository<OrgWalletTransaction>,
  ) {}

  async getOrCreate(organisationId: string): Promise<OrgWallet> {
    let wallet = await this.walletRepo.findOne({ where: { organisationId } });
    if (!wallet) {
      wallet = this.walletRepo.create({
        organisationId,
        balance: 0,
        pendingBalance: 0,
        totalDeposited: 0,
        totalDisbursed: 0,
      });
      wallet = await this.walletRepo.save(wallet);
    }
    return wallet;
  }

  async credit(
    organisationId: string,
    amount: number,
    description: string,
    opts: { reference?: string; mpesaRef?: string; initiatedBy?: string } = {},
  ): Promise<OrgWalletTransaction> {
    const wallet = await this.getOrCreate(organisationId);
    await this.walletRepo.update(wallet.id, {
      balance: Number(wallet.balance) + amount,
      totalDeposited: Number(wallet.totalDeposited) + amount,
    });

    return this.txRepo.save(this.txRepo.create({
      orgWalletId: wallet.id,
      type: OrgTxType.DEPOSIT,
      amount,
      description,
      reference: opts.reference,
      mpesaRef: opts.mpesaRef,
      initiatedBy: opts.initiatedBy,
      status: OrgTxStatus.COMPLETED,
    }));
  }

  async createPendingDeposit(
    organisationId: string,
    amount: number,
    checkoutId: string,
    opts: { initiatedBy?: string } = {},
  ): Promise<OrgWalletTransaction> {
    const wallet = await this.getOrCreate(organisationId);
    await this.walletRepo.update(wallet.id, {
      pendingBalance: Number(wallet.pendingBalance) + amount,
    });

    return this.txRepo.save(this.txRepo.create({
      orgWalletId: wallet.id,
      type: OrgTxType.DEPOSIT,
      amount,
      description: 'Wallet topup - pending',
      reference: checkoutId,
      initiatedBy: opts.initiatedBy,
      status: OrgTxStatus.PENDING,
    }));
  }

  async completeByCheckoutId(checkoutId: string, mpesaRef?: string): Promise<boolean> {
    const tx = await this.txRepo.findOne({
      where: { reference: checkoutId, status: OrgTxStatus.PENDING, type: OrgTxType.DEPOSIT },
    });
    if (!tx) return false;

    const wallet = await this.walletRepo.findOne({ where: { id: tx.orgWalletId } });
    if (!wallet) return false;

    await this.walletRepo.update(wallet.id, {
      balance: Number(wallet.balance) + Number(tx.amount),
      pendingBalance: Math.max(0, Number(wallet.pendingBalance) - Number(tx.amount)),
      totalDeposited: Number(wallet.totalDeposited) + Number(tx.amount),
    });
    await this.txRepo.update(tx.id, {
      status: OrgTxStatus.COMPLETED,
      mpesaRef: mpesaRef || undefined,
      description: 'Wallet topup',
    });

    return true;
  }

  async failPendingDepositByCheckoutId(checkoutId: string, reason?: string): Promise<boolean> {
    const tx = await this.txRepo.findOne({
      where: { reference: checkoutId, status: OrgTxStatus.PENDING, type: OrgTxType.DEPOSIT },
    });
    if (!tx) return false;

    const wallet = await this.walletRepo.findOne({ where: { id: tx.orgWalletId } });
    if (!wallet) return false;

    await this.walletRepo.update(wallet.id, {
      pendingBalance: Math.max(0, Number(wallet.pendingBalance) - Number(tx.amount)),
    });
    await this.txRepo.update(tx.id, {
      status: OrgTxStatus.FAILED,
      description: reason ? `Wallet topup failed: ${reason}` : 'Wallet topup failed',
    });

    return true;
  }

  async debit(
    organisationId: string,
    amount: number,
    description: string,
    opts: { agentId?: string; reference?: string; mpesaRef?: string; initiatedBy?: string } = {},
  ): Promise<OrgWalletTransaction> {
    const wallet = await this.getOrCreate(organisationId);
    const settledAmount = Number(amount);

    const debitResult = await this.walletRepo
      .createQueryBuilder()
      .update(OrgWallet)
      .set({
        balance: () => `balance - ${settledAmount}`,
        totalDisbursed: () => `"totalDisbursed" + ${settledAmount}`,
      })
      .where('id = :id AND balance >= :amount', { id: wallet.id, amount: settledAmount })
      .execute();

    if (!debitResult.affected || debitResult.affected === 0) {
      throw new BadRequestException(
        `Insufficient organisation wallet balance. Available: KES ${Number(wallet.balance).toFixed(2)}`,
      );
    }

    return this.txRepo.save(this.txRepo.create({
      orgWalletId: wallet.id,
      type: OrgTxType.DISBURSEMENT,
      amount: settledAmount,
      description,
      agentId: opts.agentId,
      reference: opts.reference,
      mpesaRef: opts.mpesaRef,
      initiatedBy: opts.initiatedBy,
      status: OrgTxStatus.COMPLETED,
    }));
  }

  async createPendingDisbursement(
    organisationId: string,
    amount: number,
    description: string,
    opts: { agentId?: string; reference?: string; initiatedBy?: string } = {},
  ): Promise<OrgWalletTransaction> {
    const wallet = await this.getOrCreate(organisationId);
    const reservedAmount = Number(amount);

    const reserveResult = await this.walletRepo
      .createQueryBuilder()
      .update(OrgWallet)
      .set({
        balance: () => `balance - ${reservedAmount}`,
        pendingBalance: () => `"pendingBalance" + ${reservedAmount}`,
      })
      .where('id = :id AND balance >= :amount', { id: wallet.id, amount: reservedAmount })
      .execute();

    if (!reserveResult.affected || reserveResult.affected === 0) {
      throw new BadRequestException(
        `Insufficient organisation wallet balance. Available: KES ${Number(wallet.balance).toFixed(2)}`,
      );
    }

    return this.txRepo.save(this.txRepo.create({
      orgWalletId: wallet.id,
      type: OrgTxType.DISBURSEMENT,
      amount: reservedAmount,
      description,
      agentId: opts.agentId,
      reference: opts.reference,
      initiatedBy: opts.initiatedBy,
      status: OrgTxStatus.PENDING,
    }));
  }

  async attachDisbursementConversationId(txId: string, conversationId: string): Promise<void> {
    await this.txRepo.update(txId, { mpesaRef: conversationId });
  }

  async completeDisbursementByMpesaRef(conversationId: string): Promise<boolean> {
    const tx = await this.txRepo.findOne({
      where: { mpesaRef: conversationId, status: OrgTxStatus.PENDING, type: OrgTxType.DISBURSEMENT },
    });
    if (!tx) return false;

    const wallet = await this.walletRepo.findOne({ where: { id: tx.orgWalletId } });
    if (!wallet) return false;

    await this.walletRepo.update(wallet.id, {
      pendingBalance: Math.max(0, Number(wallet.pendingBalance) - Number(tx.amount)),
      totalDisbursed: Number(wallet.totalDisbursed) + Number(tx.amount),
    });
    await this.txRepo.update(tx.id, { status: OrgTxStatus.COMPLETED });

    return true;
  }

  async failDisbursement(txId: string, reason?: string): Promise<boolean> {
    const tx = await this.txRepo.findOne({
      where: { id: txId, status: OrgTxStatus.PENDING, type: OrgTxType.DISBURSEMENT },
    });
    if (!tx) return false;

    const wallet = await this.walletRepo.findOne({ where: { id: tx.orgWalletId } });
    if (!wallet) return false;

    await this.walletRepo.update(wallet.id, {
      balance: Number(wallet.balance) + Number(tx.amount),
      pendingBalance: Math.max(0, Number(wallet.pendingBalance) - Number(tx.amount)),
    });
    await this.txRepo.update(tx.id, {
      status: OrgTxStatus.FAILED,
      description: reason ? `${tx.description} (failed: ${reason})` : tx.description,
    });

    return true;
  }

  async failDisbursementByMpesaRef(conversationId: string, reason?: string): Promise<boolean> {
    const tx = await this.txRepo.findOne({
      where: { mpesaRef: conversationId, status: OrgTxStatus.PENDING, type: OrgTxType.DISBURSEMENT },
    });
    if (!tx) return false;

    return this.failDisbursement(tx.id, reason);
  }

  async getTransactions(
    organisationId: string,
    limit = 50,
    from?: string,
    to?: string,
  ): Promise<OrgWalletTransaction[]> {
    const wallet = await this.getOrCreate(organisationId);
    const where: any = { orgWalletId: wallet.id };
    if (from && to) {
      where.createdAt = Between(new Date(from), new Date(to));
    }

    return this.txRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async exportCsv(organisationId: string, from?: string, to?: string): Promise<string> {
    const txs = await this.getTransactions(organisationId, 10000, from, to);
    const wallet = await this.getOrCreate(organisationId);
    const esc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

    const rows = [
      ['Date', 'Type', 'Description', 'Reference', 'M-Pesa Ref', 'Amount (KES)', 'Status'].join(','),
      ...txs.map((tx) => [
        esc(new Date(tx.createdAt).toISOString().slice(0, 10)),
        esc(tx.type),
        esc(tx.description),
        esc(tx.reference || ''),
        esc(tx.mpesaRef || ''),
        tx.type === OrgTxType.DISBURSEMENT
          ? `-${Number(tx.amount).toFixed(2)}`
          : Number(tx.amount).toFixed(2),
        esc(tx.status),
      ].join(',')),
    ];

    const summary = [
      '',
      `"Organisation ID",${esc(organisationId)}`,
      `"Current Balance (KES)",${Number(wallet.balance).toFixed(2)}`,
      `"Pending Balance (KES)",${Number(wallet.pendingBalance).toFixed(2)}`,
      `"Total Deposited (KES)",${Number(wallet.totalDeposited).toFixed(2)}`,
      `"Total Disbursed (KES)",${Number(wallet.totalDisbursed).toFixed(2)}`,
    ];

    return [...rows, ...summary].join('\n');
  }
}
