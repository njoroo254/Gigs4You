import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organisation } from './organisation.entity';
import { OrganisationsService } from './organisations.service';
import { OrganisationsController } from './organisations.controller';
import { AgentsModule } from '../agents/agents.module';
import { UsersModule } from '../users/users.module';
import { BillingModule } from '../billing/billing.module';
import { Task } from '../tasks/task.entity';
import { Job } from '../jobs/job.entity';
import { JobApplication } from '../applications/job-application.entity';
import { Subscription, Invoice } from '../billing/billing.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { WalletTransaction } from '../wallet/wallet.entity';
import { User } from '../users/user.entity';
import { Verification } from '../verification/verification.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organisation,
      Task,
      Job,
      JobApplication,
      Subscription,
      Invoice,
      AuditLog,
      WalletTransaction,
      User,
      Verification,
    ]),
    AgentsModule,
    UsersModule,
    forwardRef(() => BillingModule),
  ],
  providers: [OrganisationsService],
  controllers: [OrganisationsController],
  exports: [OrganisationsService],
})
export class OrganisationsModule {}
