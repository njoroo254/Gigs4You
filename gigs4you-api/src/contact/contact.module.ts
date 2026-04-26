import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';

@Module({
  controllers: [ContactController],
  providers: [],
})
export class ContactModule {}
