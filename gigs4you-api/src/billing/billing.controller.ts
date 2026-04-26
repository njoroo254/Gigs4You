import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus, Headers, Req, Logger, Optional,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { PlanTier } from './billing.entity';
import { verifyMpesaSignature, verifyStripeSignature } from '../common/guards/webhook-verification';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private billingService: BillingService,
    @Optional() private aiService: AiService,
    @Optional() private notificationsService: NotificationsService,
  ) {}

  // ── PUBLIC webhooks (no auth — Safaricom/Stripe calls these) ──────

  @Post('mpesa-stk-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'M-Pesa STK push callback from Safaricom' })
  mpesaStkCallback(@Body() body: any, @Headers('x-callback-signature') sig: string) {
    // Verify M-Pesa callback signature
    const verification = verifyMpesaSignature(body, sig);
    if (!verification.valid) {
      this.logger.warn(`[SECURITY] M-Pesa callback signature invalid: ${verification.reason}`);
      // Still process if no signature provided (backward compatibility)
      if (sig) {
        return { ResultCode: 1, ResultDesc: 'Invalid signature' };
      }
    }

    // Basic validation for STK callback
    if (!body?.Body?.stkCallback?.MerchantRequestID || !body?.Body?.stkCallback?.CheckoutRequestID) {
      this.logger.warn('Invalid STK callback payload received');
      return { ResultCode: 1, ResultDesc: 'Invalid payload' };
    }
    this.billingService.handleStkCallback(body).catch(e => this.logger.error('STK callback processing failed', e?.message));
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  @Post('mpesa-c2b-confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'M-Pesa Paybill C2B confirmation webhook' })
  mpesaC2bConfirm(@Body() body: any) {
    this.billingService.handlePaybillConfirmation(body).catch(e => this.logger.error('C2B confirmation processing failed', e?.message));
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  @Post('mpesa-c2b-validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'M-Pesa Paybill C2B validation webhook' })
  mpesaC2bValidate(@Body() body: any) {
    // Validate required fields
    if (!body?.TransID || !body?.TransAmount || !body?.BillRefNumber) {
      this.logger.warn('Invalid C2B validate payload received');
      return { ResultCode: 1, ResultDesc: 'Invalid payload' };
    }
    // Account references are generated as GIGS<6 alphanumeric chars> e.g. GIGSAB1C2D
    // Accept any alphanumeric reference (not digits-only — that would reject all real refs)
    if (!/^[A-Z0-9-]+$/i.test(body.BillRefNumber)) {
      this.logger.warn(`Unexpected BillRefNumber format: ${body.BillRefNumber}`);
      return { ResultCode: 1, ResultDesc: 'Invalid account reference format' };
    }
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  @Post('stripe-webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook for subscription events' })
  async stripeWebhook(
    @Body() body: any,
    @Headers('stripe-signature') sig: string,
    @Req() req: any,
  ) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (webhookSecret && sig) {
      // Use the raw request buffer — re-serialising via JSON.stringify changes
      // whitespace/key order and will always fail Stripe's HMAC check.
      const rawBody: Buffer | undefined = req.rawBody;
      const bodyString = rawBody ? rawBody.toString('utf8') : JSON.stringify(body);
      const verification = verifyStripeSignature(bodyString, sig, webhookSecret);

      if (!verification.valid) {
        this.logger.warn(`[SECURITY] Stripe webhook signature invalid: ${verification.reason}`);
        return { error: 'Invalid signature' };
      }
    } else if (webhookSecret && !sig) {
      this.logger.warn('[SECURITY] Stripe webhook missing signature');
      return { error: 'Missing signature' };
    }

    this.billingService.handleStripeWebhook(body, sig).catch(e => this.logger.error('Stripe webhook processing failed', e?.message));
    return { received: true };
  }

  @Post('flutterwave-webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Flutterwave webhook — handles charge.completed events' })
  async flutterwaveWebhook(@Body() body: any, @Req() req: any) {
    // Verify Flutterwave signature using timing-safe comparison to prevent timing attacks
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
    const signature  = req.headers['verif-hash'] as string | undefined;
    if (secretHash && signature) {
      const { timingSafeEqual } = await import('crypto');
      const expected = Buffer.from(secretHash);
      const received = Buffer.from(signature);
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
        return { status: 'invalid_signature' };
      }
    } else if (secretHash && !signature) {
      return { status: 'invalid_signature' };
    }

    // Process charge.completed event
    if (body?.event === 'charge.completed' && body?.data?.status === 'successful') {
      const { tx_ref, amount, currency } = body.data;
      // tx_ref format: "INV-{invoiceId}" or "SUB-{orgId}"
      try {
        if (tx_ref?.startsWith('INV-')) {
          const invoiceId = tx_ref.replace('INV-', '');
          await this.billingService.confirmManualPayment(invoiceId,
            `Flutterwave payment confirmed — txRef: ${tx_ref}, amount: ${amount} ${currency}`
          );
        }
      } catch (e) {
        // Log but don't fail — Flutterwave will retry on non-200
        this.logger.error('Flutterwave webhook processing failed', (e as Error)?.message);
      }
    }

    return { status: 'ok' };
  }

  // ── PROTECTED — org admin & super_admin ───────────────────────────

  @Get('subscription')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get organisation subscription status. Super-admin can pass ?orgId= to query any org.' })
  getSubscription(@CurrentUser() user: any, @Query('orgId') queryOrgId?: string) {
    // Super-admin can inspect any org's subscription via ?orgId=
    const orgId = user.role === UserRole.SUPER_ADMIN
      ? (queryOrgId || user.orgId)
      : user.orgId;
    return this.billingService.getSubscription(orgId);
  }

  @Post('subscribe')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Upgrade to a plan — creates invoice' })
  subscribe(
    @CurrentUser() user: any,
    @Body('plan') plan: PlanTier,
  ) {
    return this.billingService.upgradePlan(user.orgId, plan);
  }

  @Get('invoices')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'List all invoices for my org' })
  getInvoices(@CurrentUser() user: any) {
    return this.billingService.getInvoices(user.orgId);
  }

  @Post('invoices/:id/pay-mpesa')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate M-Pesa STK push to pay an invoice' })
  payViaMpesa(
    @Param('id') invoiceId: string,
    @Body('phone') phone: string,
  ) {
    return this.billingService.initiateStkPush(invoiceId, phone);
  }

  // ── GET /billing/recommend-plan — AI plan suggestion ─────────────
  @Get('recommend-plan')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'AI: recommend the most cost-effective subscription plan based on usage' })
  async recommendPlan(@CurrentUser() user: any) {
    const sub = await this.billingService.getSubscription(user.orgId).catch(() => null);
    const currentPlan = (sub as any)?.subscription?.plan ?? 'free';

    // Gather usage metrics from billing service
    const invoices = await this.billingService.getInvoices(user.orgId).catch(() => []);
    const orgStats = {
      currentPlan,
      invoiceCount: (invoices as any[]).length,
      paidInvoices: (invoices as any[]).filter((i: any) => i.status === 'paid').length,
    };

    // Plans catalogue (simplified — real values come from billing.entity PlanTier)
    const availablePlans = [
      { name: 'starter', monthlyKes: 2500, agents: 5,  features: ['GPS tracking', 'Task management'] },
      { name: 'growth',  monthlyKes: 7500, agents: 20, features: ['All starter', 'AI matching', 'Reports'] },
      { name: 'pro',     monthlyKes: 15000, agents: 50, features: ['All growth', 'AI insights', 'Custom roles'] },
      { name: 'enterprise', monthlyKes: 30000, agents: -1, features: ['Unlimited', 'Dedicated support'] },
    ];

    if (!this.aiService) {
      return { recommendedPlan: null, reason: 'AI service unavailable.', confidence: 0 };
    }
    const result = await this.aiService.recommendSubscriptionPlan(orgStats, currentPlan, availablePlans);
    if (!result) return { recommendedPlan: null, reason: 'AI recommendation unavailable.', confidence: 0 };

    // Fire in-app insight if AI recommends a plan different from the current one
    if (result.recommendedPlan && result.recommendedPlan !== currentPlan && result.confidence >= 0.6) {
      this.notificationsService?.notifyAiInsight(
        user.userId,
        '💡 AI Plan Recommendation',
        `Based on your usage, upgrading to ${result.recommendedPlan} could save you money and unlock more features. ${result.reason}`,
      );
    }

    return result;
  }

  // ── SUPER ADMIN ───────────────────────────────────────────────────

  @Get('admin/subscriptions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super-admin: all org subscriptions' })
  allSubscriptions() {
    return this.billingService.getAllSubscriptions();
  }

  @Patch('admin/invoices/:id/confirm')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super-admin: manually confirm a payment' })
  confirmPayment(
    @Param('id') invoiceId: string,
    @Body('note') note: string,
  ) {
    return this.billingService.confirmManualPayment(invoiceId, note || 'Confirmed by super admin');
  }

  @Post('admin/expire-check')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Super-admin: manually trigger expired subscription check' })
  expireCheck() {
    return this.billingService.expireOverdueSubscriptions();
  }
}
