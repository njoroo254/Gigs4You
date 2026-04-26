import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingService } from './billing.service';
import { SubscriptionGuard, PlanLimitService } from './subscription.guard';
import { SubscriptionGuard as SubscriptionLimitService } from './subscription-guard.service';
import { BillingTasksService } from './billing-tasks.service';
import { BillingController } from './billing.controller';
import { Subscription, Invoice, PaymentEvent } from './billing.entity';
import { Organisation } from '../organisations/organisation.entity';
import { User } from '../users/user.entity';
import { WalletModule } from '../wallet/wallet.module';
import { OrgWalletService } from '../wallet/org-wallet.service';
import { OrgWallet, OrgWalletTransaction } from '../wallet/org-wallet.entity';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, Invoice, PaymentEvent, Organisation, User, OrgWallet, OrgWalletTransaction]),
    forwardRef(() => WalletModule),
    AiModule,
    NotificationsModule,
  ],
  controllers: [BillingController],
  providers: [BillingService, SubscriptionGuard, PlanLimitService, BillingTasksService, SubscriptionLimitService, OrgWalletService],
  exports: [BillingService, SubscriptionGuard, PlanLimitService, SubscriptionLimitService],
})
export class BillingModule {}
