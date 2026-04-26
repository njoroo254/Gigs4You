import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkillsService } from './skills.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Skills')
@Controller('skills')
export class SkillsController {
  constructor(private skillsService: SkillsService) {}

  // Public — no token required (used by mobile app on first load)
  @Get()
  @ApiOperation({ summary: 'List all skills (public)' })
  findAll(
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.skillsService.findAll(category, search);
  }

  // Public — no token required (one-time setup endpoint)
  // POST /skills — create or find a skill (for "other" selections)
  @Post()
  @ApiOperation({ summary: 'Create a new skill or return existing one (for dynamic "other" input)' })
  create(@Body('name') name: string, @Body('category') category?: string) {
    return this.skillsService.findOrCreate(name, category || 'general');
  }

  @Get('seed')
  @ApiOperation({ summary: 'Seed default Kenyan market skills — run once, no auth required' })
  seed() {
    return this.skillsService
      .seedSkills()
      .then(() => ({ message: 'Skills seeded successfully' }));
  }

  // POST /skills/custom — worker/agent submits a custom "Other" skill
  // It gets added to the shared skills DB and becomes visible to everyone
  @Post('custom')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Submit a custom skill (user selected Other) — added to global pool' })
  createCustom(@Body() body: { name: string; category?: string }) {
    return this.skillsService.findOrCreate(body.name, body.category || 'general');
  }
}
