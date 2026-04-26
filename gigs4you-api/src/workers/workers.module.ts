import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkerProfile } from './worker-profile.entity';
import { WorkersService } from './workers.service';
import { WorkersController } from './workers.controller';
import { SkillsModule } from '../skills/skills.module';
import { AgentsModule } from '../agents/agents.module';
import { JobsModule } from '../jobs/jobs.module';
import { ApplicationsModule } from '../applications/applications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkerProfile]),
    SkillsModule,
    AgentsModule,
    forwardRef(() => JobsModule),
    forwardRef(() => ApplicationsModule),
  ],
  providers: [WorkersService],
  controllers: [WorkersController],
  exports: [WorkersService],
})
export class WorkersModule {}
