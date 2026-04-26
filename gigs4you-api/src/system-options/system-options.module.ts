import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemOption } from './system-option.entity';
import { SystemOptionsService } from './system-options.service';
import { SystemOptionsController } from './system-options.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SystemOption])],
  controllers: [SystemOptionsController],
  providers: [SystemOptionsService],
  exports: [SystemOptionsService],
})
export class SystemOptionsModule {}
