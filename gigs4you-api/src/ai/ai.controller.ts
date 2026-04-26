import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AiService, AgentExecutionRequest, ChatAssistanceRequest, RecommendationRequest } from './ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('health')
  async getHealth() {
    return await this.aiService.getHealthStatus();
  }

  @UseGuards(JwtAuthGuard)
  @Get('agents/status')
  async getAgentStatus() {
    return await this.aiService.getAgentStatus();
  }

  @UseGuards(JwtAuthGuard)
  @Post('agents/execute')
  async executeAgent(@Body() request: AgentExecutionRequest) {
    return await this.aiService.executeAgent(request);
  }

  @UseGuards(JwtAuthGuard)
  @Post('matching/job-worker')
  async matchJobToWorkers(
    @Body() body: { jobId: string; workerPool: any[]; constraints?: any }
  ) {
    return await this.aiService.matchJobToWorkers(
      body.jobId,
      body.workerPool,
      body.constraints
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('chat/assist')
  async getChatAssistance(@Body() request: ChatAssistanceRequest, @Req() req: { headers: { authorization?: string } }) {
    const jwt = req.headers.authorization?.replace('Bearer ', '');
    return await this.aiService.getChatAssistance(request, jwt);
  }

  @UseGuards(JwtAuthGuard)
  @Post('recommendations')
  async getRecommendations(@Body() request: RecommendationRequest) {
    return await this.aiService.getPersonalizedRecommendations(request);
  }

  // Specialized endpoints for different platforms
  @UseGuards(JwtAuthGuard)
  @Post('mobile/chat')
  async mobileChat(@Body() request: ChatAssistanceRequest, @Req() req: { headers: { authorization?: string } }) {
    request.platform = 'mobile';
    const jwt = req.headers.authorization?.replace('Bearer ', '');
    return await this.aiService.getChatAssistance(request, jwt);
  }

  @Post('web/chat')
  async webChat(@Body() request: ChatAssistanceRequest) {
    request.platform = 'web';
    return await this.aiService.getChatAssistance(request);
  }

  @Post('dashboard/chat')
  async dashboardChat(@Body() request: ChatAssistanceRequest) {
    request.platform = 'dashboard';
    return await this.aiService.getChatAssistance(request);
  }
}