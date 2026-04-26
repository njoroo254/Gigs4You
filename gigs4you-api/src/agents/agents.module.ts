import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent } from './agent.entity';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { AgentChurnService } from './agent-churn.service';
import { MatchingLearningService } from './matching-learning.service';
import { Task } from '../tasks/task.entity';
import { User } from '../users/user.entity';
import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Agent, Task, User]), AiModule, forwardRef(() => BillingModule), NotificationsModule],
  providers: [AgentsService, AgentChurnService, MatchingLearningService],
  controllers: [AgentsController],
  exports: [AgentsService, MatchingLearningService],
})
export class AgentsModule {}
