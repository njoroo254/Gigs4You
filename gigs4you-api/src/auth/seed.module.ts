import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedController } from './seed.controller';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [SeedController],
  // DataSource is provided globally by TypeOrmModule.forRootAsync in AppModule
  // and is available for injection anywhere in the application
})
export class SeedModule {}
