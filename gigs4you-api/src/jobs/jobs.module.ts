import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from './job.entity';
import { User } from '../users/user.entity';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { SkillsModule } from '../skills/skills.module';
import { ApplicationsModule } from '../applications/applications.module';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgentsModule } from '../agents/agents.module';
import { WorkersModule } from '../workers/workers.module';
import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job, User]),
    SkillsModule,
    ApplicationsModule,
    WalletModule,
    NotificationsModule,
    AgentsModule,
    forwardRef(() => WorkersModule),
    AiModule,
    BillingModule,
  ],
  providers: [JobsService],
  controllers: [JobsController],
  exports: [JobsService],
})
export class JobsModule {}
