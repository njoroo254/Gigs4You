import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushService } from './push.service';
import { User } from '../users/user.entity';
import { Agent } from '../agents/agent.entity';

@Global()   // available everywhere without importing
@Module({
  imports:   [TypeOrmModule.forFeature([User, Agent])],
  providers: [PushService],
  exports:   [PushService],
})
export class PushModule {}
