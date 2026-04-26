import { Injectable, Logger, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Subscription, Invoice, PaymentEvent, PlanTier, SubStatus, InvoiceStatus, PaymentMethod, PLAN_LIMITS } from './billing.entity';
import { Organisation } from '../organisations/organisation.entity';
import { MpesaService } from '../wallet/mpesa.service';
import { OrgWalletService } from '../wallet/org-wallet.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  readonly VAT_RATE = 0.16;

  constructor(
    @InjectRepository(Subscription) private subRepo: Repository<Subscription>,
    @InjectRepository(Invoice)      private invRepo: Repository<Invoice>,
    @InjectRepository(PaymentEvent) private evtRepo: Repository<PaymentEvent>,
    @InjectRepository(Organisation) private orgRepo: Repository<Organisation>,
    private config: ConfigService,
    @Optional() private mpesaService: MpesaService,
    @Optional() private orgWalletService: OrgWalletService,
  ) {}

  // ── Create trial subscription on org creation ─────────────────────
  async createTrialSubscription(organisationId: string): Promise<Subscription> {
    const trialDays = 14;
    const now       = new Date();
    const trialEnd  = new Date(now.getTime() + trialDays * 86400000);

    const sub = this.subRepo.create({
      organisationId,
      plan: PlanTier.FREE,
      status: SubStatus.TRIAL,
      currentPeriodStart: now,
      currentPeriodEnd:   trialEnd,
      trialEndsAt:        trialEnd,
      mpesaAccountRef:    `GIGS${organisationId.slice(0, 6).toUpperCase()}`,
    });
    return this.subRepo.save(sub);
  }

  // ── Get org's active subscription ─────────────────────────────────
  async getSubscription(organisationId: string): Promise<any | null> {
    const sub = await this.subRepo.findOne({ where: { organisationId } });
    if (!sub) return null;
    return {
      ...sub,
      billingId: sub.mpesaAccountRef || null,
      isActive: sub.isActive,
      daysRemaining: sub.daysRemaining,
    };
  }

  // ── Request plan upgrade — creates invoice, does NOT activate until paid ──
  async upgradePlan(organisationId: string, plan: PlanTier): Promise<{ invoice: Invoice; message: string }> {
    if (!Object.values(PlanTier).includes(plan)) {
      throw new BadRequestException('Invalid plan selection');
    }

    let sub = await this.subRepo.findOne({ where: { organisationId } });
    if (!sub) sub = await this.createTrialSubscription(organisationId);

    if (sub.plan === plan) throw new BadRequestException('Already on this plan');

    const basePrice = PLAN_LIMITS[plan].priceKes;
    if (basePrice === 0) throw new BadRequestException('Contact sales for Enterprise pricing');
    const vat = Number((basePrice * this.VAT_RATE).toFixed(2));
    const total = Number((basePrice + vat).toFixed(2));

    // Block upgrade if there is already an unpaid invoice — never auto-cancel invoices.
    // The org admin must pay the existing invoice, or a super-admin must cancel it manually
    // via PATCH /billing/admin/invoices/:id/confirm (marking as cancelled).
    const existingUnpaid = await this.invRepo.findOne({
      where: { organisationId, status: InvoiceStatus.PENDING },
    });
    if (existingUnpaid) {
      return {
        invoice: existingUnpaid,
        message: existingUnpaid.plan === plan
          ? `An unpaid invoice (${existingUnpaid.invoiceNumber}) already exists for the ${plan} plan. Pay it to activate.`
          : `Invoice ${existingUnpaid.invoiceNumber} for the ${existingUnpaid.plan} plan is still pending. Pay or ask an administrator to cancel it before switching plans.`,
      };
    }

    // Create invoice — plan will activate via activateAfterPayment() once paid
    const invoice = await this.createInvoice(organisationId, sub.id, plan, total, basePrice, vat);

    return {
      invoice,
      message: `Invoice ${invoice.invoiceNumber} created for KES ${total.toLocaleString()} (KES ${basePrice.toLocaleString()} + VAT ${vat.toLocaleString()}). Pay via M-Pesa to activate ${plan} plan.`,
    };
  }

  // ── Create invoice ────────────────────────────────────────────────
  async createInvoice(
    organisationId: string,
    subscriptionId: string,
    plan: PlanTier,
    amountKes: number,
    baseAmountKes?: number,
    vatAmountKes?: number,
  ): Promise<Invoice> {
    // Generate invoice number
    const count = await this.invRepo.count();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const dueDate = new Date(Date.now() + 7 * 86400000); // 7 days to pay
    const base = baseAmountKes ?? amountKes;
    const vat = vatAmountKes ?? Number((base * this.VAT_RATE).toFixed(2));

    const inv = this.invRepo.create({
      organisationId,
      subscriptionId,
      invoiceNumber,
      amountKes,
      plan,
      status: InvoiceStatus.PENDING,
      dueDate,
      lineItems: [
        { description: `Gigs4You ${plan} plan — monthly subscription`, amount: base },
        { description: `VAT (${this.VAT_RATE * 100}%)`, amount: vat },
      ],
    });
    return this.invRepo.save(inv);
  }

  // ── Initiate M-Pesa STK Push for an invoice ───────────────────────
  async initiateStkPush(invoiceId: string, phone: string): Promise<any> {
    const inv = await this.invRepo.findOne({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === InvoiceStatus.PAID) throw new BadRequestException('Invoice already paid');

    // amountKes is the VAT-inclusive total (base + 16% VAT)
    const chargeAmount = Math.round(Number(inv.amountKes));

    if (this.mpesaService) {
      // Use shared MpesaService (sandbox vs production automatically handled)
      const result = await this.mpesaService.stkPush({
        phone,
        amount:      chargeAmount,
        accountRef:  inv.invoiceNumber,
        description: `Gigs4You ${inv.plan} plan`,
      });
      return { checkoutRequestId: result.CheckoutRequestID, invoiceId };
    }

    // Fallback: dev mode — simulate successful push
    this.logger.warn('MpesaService not available (dev mode) — STK push simulated');
    return { checkoutRequestId: `SIM-${Date.now()}`, invoiceId, simulated: true };
  }

  // ── M-Pesa STK Callback (webhook) ─────────────────────────────────
  async handleStkCallback(payload: any): Promise<void> {
    const evt = this.evtRepo.create({
      organisationId: 'unknown', // resolved below
      source: 'mpesa_stk_callback',
      rawPayload: payload,
    });
    await this.evtRepo.save(evt);

    const callback = payload?.Body?.stkCallback;
    if (!callback) {
      this.logger.warn('Invalid M-Pesa STK callback payload (missing stkCallback)', payload);
      return;
    }

    const checkoutId = callback.CheckoutRequestID as string | undefined;
    const resultCode = callback.ResultCode;
    if (resultCode !== 0) {
      if (checkoutId && this.orgWalletService) {
        await this.orgWalletService.failPendingDepositByCheckoutId(
          checkoutId,
          callback.ResultDesc || `M-Pesa STK callback failed with code ${resultCode}`,
        );
      }
      if (checkoutId) {
        evt.reference = `TOPUP:${checkoutId}`;
      }
      evt.processed = true;
      evt.processedAt = new Date();
      await this.evtRepo.save(evt);
      this.logger.warn(`M-Pesa STK callback indicates failure (ResultCode=${resultCode})`, payload);
      return;
    }

    const metadata = callback.CallbackMetadata?.Item || [];
    const getVal = (name: string) => metadata.find((i: any) => i.Name === name)?.Value;

    const amount          = getVal('Amount');
    const mpesaCode       = getVal('MpesaReceiptNumber');
    // Note: Safaricom STK callbacks do NOT include AccountReference in the payload.
    // We correlate via CheckoutRequestID which was stored when the STK push was initiated.
    const accountRef      = payload?.Body?.stkCallback?.AccountReference as string | undefined;

    // ── Org wallet topup — match by CheckoutRequestID (primary) ──────
    if (checkoutId && this.orgWalletService) {
      const credited = await this.orgWalletService.completeByCheckoutId(checkoutId, mpesaCode);
      if (credited) {
        evt.amount      = amount;
        evt.reference   = `TOPUP:${checkoutId}|MPESA:${mpesaCode || 'unknown'}`;
        evt.processed   = true;
        evt.processedAt = new Date();
        await this.evtRepo.save(evt);
        this.logger.log(`Org wallet credited ${amount} KES via CheckoutRequestID ${checkoutId} (${mpesaCode})`);
        return;
      }
    }

    if (!accountRef) return;

    // ── Subscription invoice payment (accountRef = invoice number) ────
    const inv = await this.invRepo.findOne({ where: { invoiceNumber: accountRef } });
    if (inv) {
      inv.status        = InvoiceStatus.PAID;
      inv.paidAt        = new Date();
      inv.mpesaCode     = mpesaCode;
      inv.paymentMethod = PaymentMethod.MPESA_STK;
      await this.invRepo.save(inv);
      await this.activateAfterPayment(inv.organisationId, inv.subscriptionId, inv.plan);

      evt.organisationId = inv.organisationId;
      evt.invoiceId      = inv.id;
      evt.amount         = amount;
      evt.reference      = `INV:${inv.invoiceNumber}|MPESA:${mpesaCode || 'unknown'}`;
      evt.processed      = true;
      evt.processedAt    = new Date();
      await this.evtRepo.save(evt);
    }
  }

  // ── M-Pesa Paybill C2B Confirmation webhook ────────────────────────
  async handlePaybillConfirmation(payload: any): Promise<void> {
    const evt = this.evtRepo.create({
      organisationId: 'unknown',
      source: 'mpesa_paybill_c2b',
      rawPayload: payload,
      amount: payload.TransAmount,
      reference: payload.TransID,
    });
    await this.evtRepo.save(evt);

    // Match account reference to subscription
    const accountRef = payload.BillRefNumber?.toString();
    if (!accountRef) return;

    const sub = await this.subRepo.findOne({ where: { mpesaAccountRef: accountRef } });
    if (!sub) { this.logger.warn(`No subscription for M-Pesa ref ${accountRef}`); return; }

    // Find pending invoice or create one
    let inv = await this.invRepo.findOne({
      where: { organisationId: sub.organisationId, status: InvoiceStatus.PENDING },
      order: { createdAt: 'DESC' },
    });

    if (inv) {
      inv.status        = InvoiceStatus.PAID;
      inv.paidAt        = new Date();
      inv.mpesaCode     = payload.TransID;
      inv.paymentMethod = PaymentMethod.MPESA_PAYBILL;
      await this.invRepo.save(inv);

      evt.invoiceId      = inv.id;
      evt.reference      = `INV:${inv.invoiceNumber}|MPESA:${payload.TransID}`;
    } else {
      // If no invoice exists, record source transaction ID while leaving invoiceId null.
      evt.reference = `MPESA:${payload.TransID}|ACC:${accountRef}`;
    }

    await this.activateAfterPayment(sub.organisationId, sub.id);

    evt.organisationId = sub.organisationId;
    evt.processed      = true;
    evt.processedAt    = new Date();
    await this.evtRepo.save(evt);
  }

  // ── Stripe webhook ─────────────────────────────────────────────────
  async handleStripeWebhook(payload: any, signature: string): Promise<void> {
    // Verify signature using stripe.webhooks.constructEvent
    const stripeSecret = this.config.get('STRIPE_WEBHOOK_SECRET');
    if (!stripeSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return;
    }
    try {
      const stripe = require('stripe')(this.config.get('STRIPE_SECRET_KEY'));
      const event = stripe.webhooks.constructEvent(payload, signature, stripeSecret);
      payload = event; // Use verified payload
    } catch (err) {
      console.error('Stripe webhook signature verification failed:', (err as Error).message);
      return;
    }

    const evt = this.evtRepo.create({
      organisationId: 'unknown',
      source: 'stripe_webhook',
      rawPayload: payload,
    });
    await this.evtRepo.save(evt);

    if (payload.type === 'invoice.payment_succeeded') {
      const stripeCustomerId = payload.data?.object?.customer;
      const chargeId         = payload.data?.object?.charge;
      const amount           = (payload.data?.object?.amount_paid || 0) / 100; // cents to KES

      const sub = await this.subRepo.findOne({ where: { stripeCustomerId } });
      if (!sub) return;

      let inv = await this.invRepo.findOne({
        where: { organisationId: sub.organisationId, status: InvoiceStatus.PENDING },
        order: { createdAt: 'DESC' },
      });
      if (inv) {
        inv.status           = InvoiceStatus.PAID;
        inv.paidAt           = new Date();
        inv.gatewayChargeId  = chargeId;
        inv.paymentMethod    = PaymentMethod.STRIPE;
        inv.amountKes        = amount;
        await this.invRepo.save(inv);

        evt.invoiceId = inv.id;
        evt.reference = `INV:${inv.invoiceNumber}|STRIPE:${chargeId}`;
      }

      if (inv) {
        await this.activateAfterPayment(sub.organisationId, sub.id, inv.plan);
      } else {
        await this.activateAfterPayment(sub.organisationId, sub.id);
      }
      evt.organisationId = sub.organisationId;
      evt.processed      = true;
      evt.processedAt    = new Date();
      await this.evtRepo.save(evt);
    }

    if (payload.type === 'customer.subscription.deleted') {
      const stripeCustomerId = payload.data?.object?.customer;
      const sub = await this.subRepo.findOne({ where: { stripeCustomerId } });
      if (sub) {
        sub.status = SubStatus.CANCELLED;
        await this.subRepo.save(sub);
        await this.orgRepo.update({ id: sub.organisationId }, { isActive: false });
      }
    }
  }

  // ── Manual payment confirmation ────────────────────────────────────
  async confirmManualPayment(invoiceId: string, adminNote: string): Promise<Invoice> {
    const inv = await this.invRepo.findOne({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    inv.status        = InvoiceStatus.PAID;
    inv.paidAt        = new Date();
    inv.paymentMethod = PaymentMethod.MANUAL;
    inv.notes         = adminNote;
    await this.invRepo.save(inv);
    await this.activateAfterPayment(inv.organisationId, inv.subscriptionId);
    return inv;
  }

  // ── Internal: activate subscription after confirmed payment ────────
  private async activateAfterPayment(organisationId: string, subscriptionId: string, plan?: PlanTier): Promise<void> {
    const sub = await this.subRepo.findOne({ where: { id: subscriptionId } });
    if (!sub) return;

    const now = new Date();
    // Extend by one month from now (or from end if still active)
    const base = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    const end  = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());

    sub.status             = SubStatus.ACTIVE;
    sub.currentPeriodStart = now;
    sub.currentPeriodEnd   = end;
    if (plan && Object.values(PlanTier).includes(plan)) {
      sub.plan = plan;
    }
    await this.subRepo.save(sub);

    // Reactivate org if it was suspended
    await this.orgRepo.update({ id: organisationId }, { isActive: true });
    this.logger.log(`Subscription activated for org ${organisationId} until ${end.toISOString()}`);
  }

  // ── Manually trigger: expire overdue subscriptions ────────────────────
  // Mirrors the nightly BillingTasksService logic for on-demand admin use
  async expireOverdueSubscriptions(): Promise<{ pastDue: number; expired: number }> {
    const now          = new Date();
    const graceDeadline = new Date(now.getTime() - 7 * 86400000);

    const lapsed = await this.subRepo.find({
      where: { status: SubStatus.ACTIVE, currentPeriodEnd: LessThan(now) },
    });
    for (const sub of lapsed) {
      sub.status = SubStatus.PAST_DUE;
      await this.subRepo.save(sub);
      this.logger.warn(`Subscription past_due: org ${sub.organisationId}`);
    }

    const graceLapsed = await this.subRepo.find({
      where: { status: SubStatus.PAST_DUE, currentPeriodEnd: LessThan(graceDeadline) },
    });
    for (const sub of graceLapsed) {
      sub.status = SubStatus.EXPIRED;
      await this.subRepo.save(sub);
      await this.orgRepo.update({ id: sub.organisationId }, { isActive: false });
      this.logger.warn(`Subscription EXPIRED — org ${sub.organisationId} deactivated`);
    }

    return { pastDue: lapsed.length, expired: graceLapsed.length };
  }

  // ── Get all invoices for an org ────────────────────────────────────
  async getInvoices(organisationId: string): Promise<Invoice[]> {
    return this.invRepo.find({
      where: { organisationId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Super-admin: all subscriptions ────────────────────────────────
  async getAllSubscriptions(): Promise<any[]> {
    const subs = await this.subRepo.find({ order: { createdAt: 'DESC' } });
    return subs.map(s => ({
      ...s,
      isActive: s.isActive,
      daysRemaining: s.daysRemaining,
      planLimit: PLAN_LIMITS[s.plan],
    }));
  }

  // ── Check org can create more agents ──────────────────────────────
  async checkAgentLimit(organisationId: string, currentAgentCount: number): Promise<boolean> {
    const sub = await this.subRepo.findOne({ where: { organisationId } });
    if (!sub || !sub.isActive) return false;
    return currentAgentCount < PLAN_LIMITS[sub.plan].agents;
  }

}
