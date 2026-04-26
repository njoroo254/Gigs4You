import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet, WalletTransaction } from './wallet.entity';
import { OrgWallet, OrgWalletTransaction } from './org-wallet.entity';
import { WalletService } from './wallet.service';
import { OrgWalletService } from './org-wallet.service';
import { WalletController } from './wallet.controller';
import { MpesaService } from './mpesa.service';
import { MpesaController } from './mpesa.controller';
import { FraudService } from './fraud.service';
import { WalletReconciler } from './wallet.reconciler';
import { AgentsModule } from '../agents/agents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/user.entity';
import { RedisProvider } from '../common/redis.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletTransaction, OrgWallet, OrgWalletTransaction, User]),
    forwardRef(() => AgentsModule),
    NotificationsModule,
  ],
  providers:   [WalletService, OrgWalletService, MpesaService, FraudService, WalletReconciler, RedisProvider],
  controllers: [WalletController, MpesaController],
  exports:     [WalletService, OrgWalletService, MpesaService, FraudService],
})
export class WalletModule {}
