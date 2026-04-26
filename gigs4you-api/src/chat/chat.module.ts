import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatMessage, ChatConversation } from './chat.entity';
import { ChatGroup, ChatGroupMember, ChatGroupMessage } from './chat-group.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { User } from '../users/user.entity';
import { Agent } from '../agents/agent.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatMessage, ChatConversation,
      ChatGroup, ChatGroupMember, ChatGroupMessage,
      User, Agent,
    ]),
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET'),
      }),
    }),
  ],
  providers:   [ChatService, ChatGateway],
  controllers: [ChatController],
  exports:     [ChatService, ChatGateway],
})
export class ChatModule {}
