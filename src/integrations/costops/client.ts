/**
 * LLM-CostOps Integration Client
 * Integration with LLM-CostOps for cost tracking and optimization
 */
import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import logger from '@utils/logger';

export interface CostTrackingRequest {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  userId?: string;
  teamId?: string;
  projectId?: string;
  metadata?: Record<string, any>;
}

export interface CostTrackingResult {
  cost: number;
  currency: string;
  breakdown: {
    inputCost: number;
    outputCost: number;
  };
  budgetStatus?: {
    remaining: number;
    limit: number;
    percentage: number;
  };
}

export interface BudgetCheckRequest {
  userId?: string;
  teamId?: string;
  projectId?: string;
  estimatedCost: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  percentage: number;
  warning?: string;
}

export class CostOpsClient {
  private client: AxiosInstance;
  private enabled: boolean;

  constructor() {
    this.enabled = !!config.integrations.llmCostOpsUrl;

    this.client = axios.create({
      baseURL: config.integrations.llmCostOpsUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LLM-Policy-Engine/1.0',
      },
    });
  }

  /**
   * Track LLM usage cost
   */
  async trackCost(request: CostTrackingRequest): Promise<CostTrackingResult> {
    if (!this.enabled) {
      logger.debug('LLM-CostOps integration disabled, skipping cost tracking');
      return {
        cost: 0,
        currency: 'USD',
        breakdown: {
          inputCost: 0,
          outputCost: 0,
        },
      };
    }

    try {
      const response = await this.client.post('/api/v1/track', {
        provider: request.provider,
        model: request.model,
        inputTokens: request.inputTokens,
        outputTokens: request.outputTokens,
        userId: request.userId,
        teamId: request.teamId,
        projectId: request.projectId,
        metadata: request.metadata,
        timestamp: Date.now(),
      });

      const result: CostTrackingResult = {
        cost: response.data.cost,
        currency: response.data.currency || 'USD',
        breakdown: response.data.breakdown,
        budgetStatus: response.data.budgetStatus,
      };

      logger.info(
        {
          provider: request.provider,
          model: request.model,
          cost: result.cost,
          userId: request.userId,
        },
        'LLM cost tracked',
      );

      return result;
    } catch (error) {
      logger.error({ error }, 'LLM-CostOps tracking failed');

      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        logger.warn('LLM-CostOps service unavailable, skipping tracking');
        return {
          cost: 0,
          currency: 'USD',
          breakdown: {
            inputCost: 0,
            outputCost: 0,
          },
        };
      }

      throw new Error(`Cost tracking failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check budget before operation
   */
  async checkBudget(request: BudgetCheckRequest): Promise<BudgetCheckResult> {
    if (!this.enabled) {
      return {
        allowed: true,
        remaining: Infinity,
        limit: Infinity,
        percentage: 0,
      };
    }

    try {
      const response = await this.client.post('/api/v1/budget/check', {
        userId: request.userId,
        teamId: request.teamId,
        projectId: request.projectId,
        estimatedCost: request.estimatedCost,
      });

      const result: BudgetCheckResult = {
        allowed: response.data.allowed,
        remaining: response.data.remaining,
        limit: response.data.limit,
        percentage: response.data.percentage,
        warning: response.data.warning,
      };

      logger.debug(
        {
          allowed: result.allowed,
          remaining: result.remaining,
          percentage: result.percentage,
        },
        'Budget check completed',
      );

      return result;
    } catch (error) {
      logger.error({ error }, 'LLM-CostOps budget check failed');

      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        logger.warn('LLM-CostOps service unavailable, allowing request');
        return {
          allowed: true,
          remaining: Infinity,
          limit: Infinity,
          percentage: 0,
        };
      }

      throw new Error(`Budget check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get cost summary
   */
  async getCostSummary(filters: {
    userId?: string;
    teamId?: string;
    projectId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    total: number;
    currency: string;
    breakdown: Record<string, number>;
  }> {
    if (!this.enabled) {
      return {
        total: 0,
        currency: 'USD',
        breakdown: {},
      };
    }

    try {
      const response = await this.client.get('/api/v1/summary', {
        params: {
          userId: filters.userId,
          teamId: filters.teamId,
          projectId: filters.projectId,
          startDate: filters.startDate?.toISOString(),
          endDate: filters.endDate?.toISOString(),
        },
      });

      return response.data;
    } catch (error) {
      logger.error({ error }, 'LLM-CostOps summary failed');
      throw new Error(`Cost summary failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check CostOps service health
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error({ error }, 'LLM-CostOps health check failed');
      return false;
    }
  }
}

export const costOpsClient = new CostOpsClient();
