import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNumber, IsString, Min } from 'class-validator';
import crypto from 'crypto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { AgentsService } from '../agents/agents.service';
import { REDIS_CLIENT } from '../common/redis.provider';
import { OrgWalletService } from './org-wallet.service';
import { MpesaService } from './mpesa.service';
import { TransactionType } from './wallet.entity';
import { WalletService } from './wallet.service';
import type Redis from 'ioredis';

class SinglePayoutDto {
  @IsString() phone: string;
  @IsNumber() @Min(10) amount: number;
  @IsString() remarks: string;
}

class BulkPayoutDto {
  @IsArray() @ArrayMinSize(1)
  payments: { agentId: string; amount: number; remarks?: string }[];
}

class StkPushDto {
  @IsString() phone: string;
  @IsNumber() @Min(1) amount: number;
  @IsString() accountRef: string;
  @IsString() description: string;
}

@ApiTags('M-Pesa')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mpesa')
export class MpesaController {
  private readonly log = new Logger(MpesaController.name);

  constructor(
    private mpesaService: MpesaService,
    private walletService: WalletService,
    private orgWalletService: OrgWalletService,
    @Inject(forwardRef(() => AgentsService))
    private agentsService: AgentsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Post('pay-agent')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pay a single agent via M-Pesa B2C' })
  async payAgent(@Body() dto: SinglePayoutDto, @CurrentUser() user: any) {
    const orgId = user?.orgId || 'platform';
    const description = dto.remarks || `M-Pesa payment to ${dto.phone}`;
    const pending = await this.orgWalletService.createPendingDisbursement(
      orgId,
      dto.amount,
      description,
      {
        reference: `PHONE:${dto.phone}`,
        initiatedBy: user?.id,
      },
    );

    try {
      const result = await this.mpesaService.b2cPayment({
        phone: dto.phone,
        amount: dto.amount,
        commandId: 'BusinessPayment',
        remarks: dto.remarks,
      });

      const conversationId = result?.OriginatorConversationID || result?.ConversationID;
      if (!conversationId) {
        await this.orgWalletService.failDisbursement(
          pending.id,
          'M-Pesa did not return a conversation ID for reconciliation',
        );
        throw new BadRequestException('M-Pesa payout could not be reconciled. No funds were disbursed.');
      }

      await this.orgWalletService.attachDisbursementConversationId(pending.id, conversationId);

      return {
        success: true,
        status: 'pending_settlement',
        orgTransactionId: pending.id,
        mpesaResponse: result,
      };
    } catch (err) {
      await this.orgWalletService.failDisbursement(pending.id, (err as Error).message);
      throw err;
    }
  }

  @Post('bulk-pay')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk pay multiple agents via M-Pesa B2C' })
  async bulkPay(@Body() dto: BulkPayoutDto, @CurrentUser() user: any) {
    const results = [];
    const errors = [];
    const orgId = user?.orgId || 'platform';

    for (const payment of dto.payments) {
      try {
        const agent = await this.agentsService.findById(payment.agentId);
        const wallet = await this.walletService.findByAgent(payment.agentId);
        const phone = (wallet as any).mpesaPhone || agent.user?.phone;

        if (!phone) {
          errors.push({ agentId: payment.agentId, error: 'No M-Pesa phone registered' });
          continue;
        }

        const pending = await this.orgWalletService.createPendingDisbursement(
          orgId,
          payment.amount,
          payment.remarks || 'M-Pesa agent payment',
          {
            agentId: payment.agentId,
            reference: `AGENT:${payment.agentId}`,
            initiatedBy: user?.id,
          },
        );

        try {
          const mpesaResult = await this.mpesaService.b2cPayment({
            phone,
            amount: payment.amount,
            commandId: 'SalaryPayment',
            remarks: payment.remarks || 'Gigs4You payment',
          });

          const conversationId = mpesaResult?.OriginatorConversationID || mpesaResult?.ConversationID;
          if (!conversationId) {
            await this.orgWalletService.failDisbursement(
              pending.id,
              'M-Pesa did not return a conversation ID for reconciliation',
            );
            throw new BadRequestException('M-Pesa payout could not be reconciled. No funds were disbursed.');
          }

          await this.orgWalletService.attachDisbursementConversationId(pending.id, conversationId);

          results.push({
            agentId: payment.agentId,
            amount: payment.amount,
            phone,
            orgTransactionId: pending.id,
          });
        } catch (err) {
          await this.orgWalletService.failDisbursement(pending.id, (err as Error).message);
          errors.push({ agentId: payment.agentId, error: (err as Error).message });
        }
      } catch (err) {
        errors.push({ agentId: payment.agentId, error: (err as Error).message });
      }
    }

    return {
      processed: results.length,
      failed: errors.length,
      totalPaid: results.reduce((sum, result) => sum + result.amount, 0),
      results,
      errors,
    };
  }

  @Post('stk-push')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'STK Push - request payment from a phone number' })
  stkPush(@Body() dto: StkPushDto) {
    return this.mpesaService.stkPush(dto);
  }

  @Post('stk-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[DEPRECATED] STK callback fallback - configure MPESA_STK_CALLBACK_URL to /billing/mpesa-stk-callback',
    deprecated: true,
  })
  stkCallback(@Body() body: any) {
    console.error(
      '[MISCONFIGURED] STK callback received at /mpesa/stk-callback but should go to /billing/mpesa-stk-callback. '
      + 'Update MPESA_STK_CALLBACK_URL. Payload dropped:',
      JSON.stringify(body),
    );
    return { ResultCode: 0, ResultDesc: 'Received - check server logs, misconfigured callback URL' };
  }

  @Post('b2c-result')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Daraja B2C result callback - called by Safaricom' })
  async b2cResult(@Body() body: any, @Headers('x-mpesa-signature') sig: string) {
    const securityCredential = process.env.MPESA_SECURITY_CREDENTIAL;
    if (securityCredential && sig) {
      try {
        const dataToSign = JSON.stringify(body);
        const expectedSig = crypto
          .createHmac('sha256', securityCredential)
          .update(dataToSign)
          .digest('base64');

        if (sig !== expectedSig) {
          console.error('[SECURITY] B2C callback signature mismatch');
          return { ResultCode: 1, ResultDesc: 'Invalid signature' };
        }
      } catch (err) {
        console.error('[SECURITY] B2C signature verification error:', err);
      }
    }

    this.log.log(
      `B2C Result received: code=${body.ResultCode} id=${body.OriginatorConversationID} desc=${body.ResultDesc}`,
    );

    try {
      const { ResultCode, OriginatorConversationID, ResultDesc } = body;

      if (!OriginatorConversationID) {
        this.log.error('B2C callback missing OriginatorConversationID');
        return { ResultCode: 1, ResultDesc: 'Missing conversation ID' };
      }

      const idempotencyKey = `mpesa:b2c:done:${OriginatorConversationID}`;
      const acquired = await this.redis.set(idempotencyKey, '1', 'EX', 86_400, 'NX');
      if (!acquired) {
        this.log.warn(`Duplicate B2C callback ignored for ConversationID: ${OriginatorConversationID}`);
        return { ResultCode: 0, ResultDesc: 'Already processed' };
      }

      const tx = await this.walletService.findTransactionByConversationId(OriginatorConversationID);

      if (ResultCode === 0) {
        const completedOrgTx = await this.orgWalletService.completeDisbursementByMpesaRef(
          OriginatorConversationID,
        );

        if (tx?.type === TransactionType.DEBIT) {
          await this.walletService.completeWithdrawal(tx.id);
        } else if (tx?.type === TransactionType.CREDIT) {
          await this.walletService.completeCredit(tx.id);
        }

        if (!tx && !completedOrgTx) {
          this.log.error(`No transaction found for conversation ID: ${OriginatorConversationID}`);
          return { ResultCode: 1, ResultDesc: 'Transaction not found' };
        }

        this.log.log(`B2C success: ${OriginatorConversationID} - ${ResultDesc}`);
      } else {
        const failedOrgTx = await this.orgWalletService.failDisbursementByMpesaRef(
          OriginatorConversationID,
          ResultDesc,
        );

        if (tx) {
          await this.walletService.failTransaction(tx.id, ResultDesc);
        }

        if (!tx && !failedOrgTx) {
          this.log.error(`No transaction found for conversation ID: ${OriginatorConversationID}`);
          return { ResultCode: 1, ResultDesc: 'Transaction not found' };
        }

        this.log.warn(`B2C failed: ${OriginatorConversationID} - ${ResultDesc}`);
      }

      return { ResultCode: 0, ResultDesc: 'Processed' };
    } catch (error) {
      this.log.error(`B2C callback processing error: ${(error as Error).message}`, (error as Error).stack);
      return { ResultCode: 1, ResultDesc: 'Processing error' };
    }
  }

  @Post('topup')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Topup org payment pool via STK Push - admin loads KES from their M-Pesa to pay agents',
    description: 'Sends an STK Push to the admin phone. On payment, the amount is credited to the org wallet pool for agent payouts.',
  })
  async topupOrgWallet(
    @Body() body: { phone: string; amount: number },
    @CurrentUser() user: any,
  ) {
    const orgId = user.orgId || 'platform';
    const accountRef = `TOPUP-${orgId.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, '')}`;

    const result = await this.mpesaService.stkPush({
      phone: body.phone,
      amount: body.amount,
      accountRef,
      description: 'Wallet topup',
    });

    const checkoutRequestId = result?.CheckoutRequestID;
    if (checkoutRequestId) {
      await this.orgWalletService.createPendingDeposit(orgId, body.amount, checkoutRequestId, {
        initiatedBy: user?.id,
      });
    }

    return {
      message: `STK Push sent to ${body.phone}. Enter your M-Pesa PIN to confirm.`,
      amount: body.amount,
      accountRef,
      checkoutRequestId,
    };
  }

  @Get('balance')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Query Safaricom shortcode balance' })
  checkBalance() {
    return this.mpesaService.checkBalance();
  }
}
