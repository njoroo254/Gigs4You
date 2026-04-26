// ── applications.module.ts ───────────────────────────
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobApplication } from './job-application.entity';
import { ApplicationsService } from './applications.service';
import { WorkersModule } from '../workers/workers.module';
import { Job } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { AiModule } from '../ai/ai.module';
import { PushModule } from '../push/push.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobApplication, Job, User]),
    AiModule,
    forwardRef(() => WorkersModule),
    PushModule,
    NotificationsModule,
  ],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
