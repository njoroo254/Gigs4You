import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GpsLog } from '../../gps/gps-log.entity';
import { ChatMessage } from '../../chat/chat.entity';
import { DataRetentionService } from './data-retention.service';

@Module({
  imports: [TypeOrmModule.forFeature([GpsLog, ChatMessage])],
  providers: [DataRetentionService],
})
export class DataRetentionModule {}
