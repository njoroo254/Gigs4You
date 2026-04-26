import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Task } from '../tasks/task.entity';
import { Agent } from '../agents/agent.entity';
import { User } from '../users/user.entity';
import { GpsLog } from '../gps/gps-log.entity';
import { Job } from '../jobs/job.entity';
import { JobApplication } from '../applications/job-application.entity';
import { WalletTransaction } from '../wallet/wallet.entity';
import { WorkerProfile } from '../workers/worker-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Task, Agent, User, GpsLog, Job, JobApplication, WalletTransaction, WorkerProfile])],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
