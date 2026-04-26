import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { createDependencyFailure } from '../common/errors/dependency-failure';

export interface AgentExecutionRequest {
  agent_type: string;
  task: string;
  context?: Record<string, any>;
  priority?: string;
}

export interface AgentExecutionResponse {
  agent_id: string;
  status: string;
  result?: any;
  execution_time: number;
  timestamp: string;
}

export interface JobWorkerMatch {
  job_id: string;
  matches: Array<{
    worker_id: string;
    score: number;
    reasoning: string;
  }>;
  total_candidates: number;
}

export interface ChatAssistanceRequest {
  conversation_id: string;
  message: string;
  user_context?: Record<string, any>;
  platform?: string;
}

export interface ChatAssistanceResponse {
  conversation_id: string;
  response: string;
  platform: string;
  timestamp: string;
}

export interface RecommendationRequest {
  user_id: string;
  user_type: string;
  context?: Record<string, any>;
}

export interface RecommendationResponse {
  user_id: string;
  user_type: string;
  recommendations: Array<{
    type: string;
    title: string;
    description: string;
    confidence: number;
  }>;
  timestamp: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8001');
  }

  private async postToAi<T>(
    path: string,
    payload: unknown,
    operation: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const target = `${this.aiServiceUrl}${path}`;
    try {
      const response = await firstValueFrom<AxiosResponse<T>>(
        this.httpService.post(target, payload, config),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `AI dependency failure during ${operation} (${target}): ${error?.message || 'unknown error'}`,
      );
      throw createDependencyFailure('AI service', operation, target, error);
    }
  }

  private async getFromAi<T>(path: string, operation: string): Promise<T> {
    const target = `${this.aiServiceUrl}${path}`;
    try {
      const response = await firstValueFrom<AxiosResponse<T>>(
        this.httpService.get(target),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `AI dependency failure during ${operation} (${target}): ${error?.message || 'unknown error'}`,
      );
      throw createDependencyFailure('AI service', operation, target, error);
    }
  }

/**
   * Execute an AI agent for a specific task with timeout and retry logic
   */
  async executeAgent(request: AgentExecutionRequest): Promise<AgentExecutionResponse> {
    const axiosConfig: AxiosRequestConfig = {
      timeout: 10000, // 10 seconds timeout
    };
    
    // Retry logic: try up to 2 times (initial attempt + 1 retry)
    let lastError: any;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await this.postToAi<AgentExecutionResponse>(
          '/agents/execute',
          request,
          `execute agent ${request.agent_type} (attempt ${attempt})`,
          axiosConfig,
        );
        this.logger.log(`Agent executed: ${request.agent_type} - ${request.task}`);
        return response;
      } catch (error: any) {
        lastError = error;
        if (attempt === 2) {
          // Final attempt failed, log and rethrow
          this.logger.error(
            `AI agent execution failed after 2 attempts: ${request.agent_type} - ${request.task}`,
          );
          throw error;
        }
        // Wait briefly before retry (exponential backoff could be implemented here)
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
    // This should never be reached due to the throw above, but TypeScript needs it
    throw lastError;
  }

  /**
   * Get AI-powered job-to-worker matching
   */
  async matchJobToWorkers(
    jobId: string,
    workerPool: Array<Record<string, any>>,
    constraints: Record<string, any> = {}
  ): Promise<JobWorkerMatch> {
    const request = {
      job_id: jobId,
      worker_pool: workerPool,
      constraints,
    };

    const response = await this.postToAi<JobWorkerMatch>(
      '/matching/job-worker',
      request,
      `match workers for job ${jobId}`,
    );

    this.logger.log(`Job matching completed for job: ${jobId}`);
    return response;
  }

  /**
   * Get AI-powered chat assistance
   */
  async getChatAssistance(request: ChatAssistanceRequest, jwt?: string): Promise<ChatAssistanceResponse> {
    const headers = jwt ? { Authorization: `Bearer ${jwt}` } : {};
    const response = await this.postToAi<ChatAssistanceResponse>(
      '/chat/assist',
      request,
      `chat assistance for conversation ${request.conversation_id}`,
      { headers },
    );

    this.logger.log(`Chat assistance provided for conversation: ${request.conversation_id}`);
    return response;
  }

  /**
   * Get personalized recommendations
   */
  async getPersonalizedRecommendations(request: RecommendationRequest): Promise<RecommendationResponse> {
    const response = await this.postToAi<RecommendationResponse>(
      '/recommendations/personalize',
      request,
      `personalized recommendations for user ${request.user_id}`,
    );

    this.logger.log(`Recommendations generated for user: ${request.user_id}`);
    return response;
  }

  /**
   * Parse a free-text job description into structured job fields.
   * Non-blocking — returns null on AI service unavailability so callers can proceed without suggestions.
   */
  async parseJobIntent(
    description: string,
    context?: { county?: string },
  ): Promise<{
    suggestedTitle: string | null;
    skills: string[];
    budgetMin: number | null;
    budgetMax: number | null;
    county: string | null;
    isUrgent: boolean;
    deadline: string | null;
    confidence: number;
  } | null> {
    try {
      return await this.postToAi('/ai/parse-job', { description, context: context ?? {} }, 'parse job intent', { timeout: 12000 });
    } catch {
      return null;
    }
  }

  /**
   * Parse a free-text task description into checklist, priority, estimated duration and required skills.
   * Non-blocking — returns null on AI service unavailability.
   */
  async parseTaskIntent(description: string): Promise<{
    checklist: string[];
    priority: 'low' | 'medium' | 'high' | 'urgent';
    estimatedMinutes: number | null;
    requiredSkills: string[];
    confidence: number;
  } | null> {
    try {
      return await this.postToAi('/ai/parse-task', { description }, 'parse task intent', { timeout: 12000 });
    } catch {
      return null;
    }
  }

  /**
   * Suggest a budget range for a job based on description, category and location.
   * Non-blocking — returns null on AI service unavailability.
   */
  async suggestJobPricing(
    description: string,
    category: string,
    county: string,
    isUrgent?: boolean,
    similarJobs?: Array<Record<string, any>>,
  ): Promise<{
    budgetMin: number | null;
    budgetMax: number | null;
    marketRate: number | null;
    rationale: string;
    confidence: number;
  } | null> {
    try {
      return await this.postToAi(
        '/ai/suggest-pricing',
        {
          description,
          category,
          county,
          is_urgent: isUrgent ?? false,
          similar_jobs: similarJobs ?? [],
        },
        'suggest job pricing',
        { timeout: 12000 },
      );
    } catch {
      return null;
    }
  }

  /**
   * Verify a task completion photo using Claude Vision.
   * Non-blocking — returns null on failure.
   */
  async verifyTaskPhoto(
    photoUrl: string,
    taskDescription: string,
    taskTitle?: string,
  ): Promise<{ verified: boolean | null; confidence: number; note: string } | null> {
    try {
      return await this.postToAi(
        '/ai/verify-photo',
        { photo_url: photoUrl, task_description: taskDescription, task_title: taskTitle ?? '' },
        'verify task photo',
        { timeout: 15000 },
      );
    } catch {
      return null;
    }
  }

  /**
   * Generate a short AI-written performance narrative for an agent.
   * Caller should cache; the Python layer also caches for 1 hour.
   */
  async getAgentNarrative(
    agentStats: Record<string, any>,
    periodDays = 30,
  ): Promise<string | null> {
    try {
      const resp = await this.postToAi<{ narrative: string }>(
        '/ai/agent-narrative',
        { agent_stats: agentStats, period_days: periodDays },
        'agent narrative',
        { timeout: 12000 },
      );
      return resp?.narrative ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Recommend a subscription plan based on organisation usage metrics.
   * Non-blocking — returns null on failure.
   */
  async recommendSubscriptionPlan(
    orgStats: Record<string, any>,
    currentPlan: string,
    availablePlans: Array<Record<string, any>>,
  ): Promise<{ recommendedPlan: string | null; reason: string; confidence: number } | null> {
    try {
      return await this.postToAi(
        '/ai/recommend-plan',
        { org_stats: orgStats, current_plan: currentPlan, available_plans: availablePlans },
        'recommend subscription plan',
        { timeout: 12000 },
      );
    } catch {
      return null;
    }
  }

  /**
   * Get AI service health status
   */
  async getHealthStatus(): Promise<any> {
    try {
      return await this.getFromAi<any>('/health', 'health check');
    } catch (error: any) {
      const response = error?.getResponse?.();
      const dependency = response?.dependency;
      const reason = response?.cause || error?.message || 'unknown error';
      this.logger.error(
        `AI service health check failed (${dependency?.code || 'unknown'}): ${reason}`,
      );
      return { status: 'unhealthy', error: reason, dependency };
    }
  }

  /**
   * Get status of all registered agents
   */
  async getAgentStatus(): Promise<any> {
    return this.getFromAi<any>('/agents/status', 'agent status lookup');
  }
}
