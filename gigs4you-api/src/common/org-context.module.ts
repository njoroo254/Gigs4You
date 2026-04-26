import { Module } from '@nestjs/common';
import { OrgContextService } from './org-context.service';

@Module({
  providers: [OrgContextService],
  exports:   [OrgContextService],
})
export class OrgContextModule {}
