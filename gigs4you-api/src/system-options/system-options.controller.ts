import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SystemOptionsService } from './system-options.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';

@ApiTags('System Options')
@Controller('system-options')
export class SystemOptionsController {
  constructor(private service: SystemOptionsService) {}

  @Get(':type')
  @ApiOperation({ summary: 'Get options for a type (industry, county, language …)' })
  getOptions(@Param('type') type: string) {
    return this.service.getByType(type);
  }

  @Post()
  @ApiOperation({ summary: 'Add a new custom option (called automatically on "Other" submission)' })
  addOption(@Body('type') type: string, @Body('value') value: string) {
    return this.service.addOption(type, value);
  }

  @Patch(':type')
  @ApiOperation({ summary: 'Update a system option value' })
  updateOption(
    @Param('type') type: string,
    @Body('value') value: string,
  ) {
    return this.service.set(type, value);
  }

  @Delete(':type')
  @ApiOperation({ summary: 'Delete a system option' })
  deleteOption(@Param('type') type: string) {
    return this.service.delete(type);
  }
}
