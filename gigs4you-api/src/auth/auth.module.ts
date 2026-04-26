import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { SeedController } from './seed.controller';
import { SeedModule } from './seed.module';
import { UsersModule } from '../users/users.module';
import { AgentsModule } from '../agents/agents.module';
import { OrganisationsModule } from '../organisations/organisations.module';
import { BillingModule } from '../billing/billing.module';
import { RedisProvider } from '../common/redis.provider';

@Module({
  imports: [
    BillingModule,
    UsersModule,
    AgentsModule,
    OrganisationsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:         config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') || '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers:   [AuthService, JwtStrategy, RedisProvider],
  exports:     [AuthService],
})
export class AuthModule {}
