import {
  Controller, Get, Post, Body, Inject, Res,
  UseGuards, HttpCode, HttpStatus, Query, forwardRef,
  BadRequestException, NotFoundException, HttpException, Param,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsNumber, IsString, Min, IsOptional, IsUUID } from 'class-validator';
import { WalletService } from './wallet.service';
import { OrgWalletService } from './org-wallet.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AgentsService } from '../agents/agents.service';
import { UserRole } from '../users/user.entity';
import { WalletTransaction } from './wallet.entity';
import { TransactionType } from './wallet.entity';

const MGMT_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR];

class WithdrawDto {
  @IsNumber() @Min(10) amount: number;
  @IsString() mpesaPhone: string;
}

class AdminRefundDto {
  @IsString() agentId: string;
  @IsNumber() @Min(1) amount: number;
  @IsString() reason: string;
  @IsOptional() @IsString() disputeId?: string;
}

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wallet')
export class WalletController {
  constructor(
    private walletService: WalletService,
    private orgWalletService: OrgWalletService,
    @Inject(forwardRef(() => AgentsService))
    private agentsService: AgentsService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // AGENT WALLET  (agent / supervisor roles — individual earnings wallet)
  // ────────────────────────────────────────────────────────────────────────────

  // GET /wallet — agent balance
  @Get()
  @ApiOperation({ summary: 'Agent: my wallet balance' })
  async getMyWallet(@CurrentUser() user: any) {
    const agent = await this.agentsService.findByUserId(user.userId);
    if (!agent) return { balance: 0, pendingBalance: 0, totalEarned: 0, totalWithdrawn: 0, currency: 'KES' };
    return this.walletService.findByAgent(agent.id);
  }

  // GET /wallet/transactions — agent transaction history
  @Get('transactions')
  @ApiOperation({ summary: 'Agent: my transaction history' })
  async getTransactions(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    const agent = await this.agentsService.findByUserId(user.userId);
    if (!agent) return [];
    return this.walletService.getTransactions(agent.id, limit ? parseInt(limit) : 50);
  }

  // POST /wallet/withdraw — agent requests M-Pesa withdrawal
  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Agent: request M-Pesa withdrawal' })
  async withdraw(@CurrentUser() user: any, @Body() dto: WithdrawDto) {
    const agent = await this.agentsService.findByUserId(user.userId);
    if (!agent) throw new NotFoundException('Agent profile not found');
    return this.walletService.requestWithdrawal(agent.id, dto.amount, dto.mpesaPhone);
  }

  // GET /wallet/statement — agent downloads their own CSV statement
  @Get('statement')
  @ApiOperation({ summary: 'Agent: download personal wallet statement as CSV' })
  async downloadStatement(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const agent = await this.agentsService.findByUserId(user.userId);
    if (!agent) { res.status(404).json({ message: 'Agent profile not found' }); return; }
    const csv = await this.buildAgentCsv(agent.id, from, to);
    const filename = `wallet-statement-${new Date().toISOString().slice(0,10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ORG WALLET  (admin / manager / supervisor — shared org-level funds)
  // ────────────────────────────────────────────────────────────────────────────

  // GET /wallet/org — org wallet balance + stats
  @Get('org')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Management: org wallet balance and stats' })
  async getOrgWallet(@CurrentUser() user: any) {
    const orgId = user.orgId;
    if (!orgId) return { balance: 0, totalDeposited: 0, totalDisbursed: 0, currency: 'KES' };
    return this.orgWalletService.getOrCreate(orgId);
  }

  // GET /wallet/org/transactions — org transaction history
  @Get('org/transactions')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Management: org wallet transaction history' })
  async getOrgTransactions(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const orgId = user.orgId;
    if (!orgId) return [];
    return this.orgWalletService.getTransactions(orgId, limit ? parseInt(limit) : 50, from, to);
  }

  // GET /wallet/org/statement — org CSV statement download
  @Get('org/statement')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Management: download org wallet statement as CSV' })
  async downloadOrgStatement(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const orgId = user.orgId;
    if (!orgId) { res.status(400).json({ message: 'No organisation' }); return; }
    const csv = await this.orgWalletService.exportCsv(orgId, from, to);
    const filename = `org-wallet-statement-${new Date().toISOString().slice(0,10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  // GET /wallet/platform-stats — super-admin
  @Get('platform-stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Platform-wide wallet stats (super-admin)' })
  getPlatformStats() {
    return this.walletService.getPlatformStats();
  }

  // POST /wallet/admin/refund — admin issues a wallet refund to an agent
  @Post('admin/refund')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: issue wallet refund to agent (e.g. from dispute resolution)' })
  async adminRefund(@Body() dto: AdminRefundDto) {
    if (!dto.agentId) throw new BadRequestException('agentId is required');
    return this.walletService.issueRefund(dto.agentId, dto.amount, dto.reason, dto.disputeId);
  }

  // GET helper for testing: tells client to use POST for reversal
  @Get('admin/reverse/:txId')
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  @ApiOperation({ summary: 'Test-only: admin reversal endpoint (POST required)' })
  testReverse(@Param('txId') txId: string) {
    throw new HttpException('This endpoint must be invoked with POST to reverse a wallet transaction', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // POST /wallet/admin/reverse/:txId — reverse a completed wallet transaction
  @Post('admin/reverse/:txId')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: reverse a wallet transaction' })
  async reverseTransaction(@Param('txId') txId: string) {
    return this.walletService.reverseTransaction(txId);
  }

  // GET /wallet/admin/verify-chain/:walletId — verify ledger hash chain integrity
  @Get('admin/verify-chain/:walletId')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super-admin: verify ledger hash-chain integrity for a wallet' })
  async verifyChain(@Param('walletId') walletId: string) {
    return this.walletService.verifyChain(walletId);
  }

  // ── Internal helper: build agent CSV ─────────────
  private async buildAgentCsv(agentId: string, from?: string, to?: string): Promise<string> {
    const txs    = await this.walletService.getTransactions(agentId, 10000);
    const wallet = await this.walletService.findByAgent(agentId);
    const esc    = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const filtered = from && to
      ? txs.filter(t => new Date(t.createdAt) >= new Date(from) && new Date(t.createdAt) <= new Date(to))
      : txs;

    const rows = [
      ['Date','Type','Description','M-Pesa Ref','Amount (KES)','Status'].join(','),
      ...filtered.map(t => [
        esc(new Date(t.createdAt).toISOString().slice(0,10)),
        esc(t.type),
        esc(t.description),
        esc(t.mpesaRef || t.mpesaPhone || ''),
        t.type === TransactionType.DEBIT ? `-${Number(t.amount).toFixed(2)}` : Number(t.amount).toFixed(2),
        esc(t.status),
      ].join(',')),
    ];

    const summary = [
      '',
      `"Current Balance (KES)",${Number(wallet.balance).toFixed(2)}`,
      `"Total Earned (KES)",${Number(wallet.totalEarned).toFixed(2)}`,
      `"Total Withdrawn (KES)",${Number(wallet.totalWithdrawn).toFixed(2)}`,
    ];

    return [...rows, ...summary].join('\n');
  }
}
