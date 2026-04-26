import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './task.entity';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { AgentsModule } from '../agents/agents.module';
import { WalletModule } from '../wallet/wallet.module';
import { AiModule } from '../ai/ai.module';

@Module({
  // AgentsModule exports MatchingLearningService — available to TasksService automatically
  imports: [TypeOrmModule.forFeature([Task]), AgentsModule, WalletModule, AiModule],
  providers: [TasksService],
  controllers: [TasksController],
  exports: [TasksService],
})
export class TasksModule {}
