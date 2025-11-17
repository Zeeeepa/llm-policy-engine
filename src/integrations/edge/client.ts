/**
 * LLM-Edge-Agent Integration Client
 * Integration with LLM-Edge-Agent for edge deployment
 */
import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import logger from '@utils/logger';
import { Policy } from '../../types/policy';

export interface EdgeDeploymentRequest {
  policy: Policy;
  regions: string[];
  priority?: number;
}

export interface EdgeDeploymentResult {
  deploymentId: string;
  status: 'pending' | 'deployed' | 'failed';
  regions: EdgeRegionStatus[];
}

export interface EdgeRegionStatus {
  region: string;
  status: 'pending' | 'deployed' | 'failed';
  endpoint?: string;
  error?: string;
}

export interface EdgeSyncRequest {
  policyIds?: string[];
  force?: boolean;
}

export interface EdgeSyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

export class EdgeClient {
  private client: AxiosInstance;
  private enabled: boolean;

  constructor() {
    this.enabled = !!config.integrations.llmEdgeAgentUrl;

    this.client = axios.create({
      baseURL: config.integrations.llmEdgeAgentUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LLM-Policy-Engine/1.0',
      },
    });
  }

  /**
   * Deploy policy to edge locations
   */
  async deployPolicy(request: EdgeDeploymentRequest): Promise<EdgeDeploymentResult> {
    if (!this.enabled) {
      logger.debug('LLM-Edge-Agent integration disabled, skipping edge deployment');
      return {
        deploymentId: 'local',
        status: 'deployed',
        regions: [],
      };
    }

    try {
      const response = await this.client.post('/api/v1/deploy', {
        policy: request.policy,
        regions: request.regions,
        priority: request.priority,
        timestamp: Date.now(),
      });

      const result: EdgeDeploymentResult = {
        deploymentId: response.data.deploymentId,
        status: response.data.status,
        regions: response.data.regions || [],
      };

      logger.info(
        {
          deploymentId: result.deploymentId,
          policyId: request.policy.metadata.id,
          regionCount: request.regions.length,
          status: result.status,
        },
        'Edge deployment initiated',
      );

      return result;
    } catch (error) {
      logger.error({ error }, 'LLM-Edge-Agent deployment failed');

      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        logger.warn('LLM-Edge-Agent service unavailable');
        return {
          deploymentId: 'failed',
          status: 'failed',
          regions: request.regions.map((region) => ({
            region,
            status: 'failed',
            error: 'Edge agent unavailable',
          })),
        };
      }

      throw new Error(`Edge deployment failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sync policies to edge locations
   */
  async syncPolicies(request: EdgeSyncRequest): Promise<EdgeSyncResult> {
    if (!this.enabled) {
      return {
        synced: 0,
        failed: 0,
        errors: [],
      };
    }

    try {
      const response = await this.client.post('/api/v1/sync', {
        policyIds: request.policyIds,
        force: request.force,
        timestamp: Date.now(),
      });

      const result: EdgeSyncResult = {
        synced: response.data.synced || 0,
        failed: response.data.failed || 0,
        errors: response.data.errors || [],
      };

      logger.info(
        {
          synced: result.synced,
          failed: result.failed,
          errorCount: result.errors.length,
        },
        'Edge sync completed',
      );

      return result;
    } catch (error) {
      logger.error({ error }, 'LLM-Edge-Agent sync failed');
      throw new Error(`Edge sync failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(deploymentId: string): Promise<EdgeDeploymentResult> {
    if (!this.enabled) {
      return {
        deploymentId,
        status: 'deployed',
        regions: [],
      };
    }

    try {
      const response = await this.client.get(`/api/v1/deployments/${deploymentId}`);

      return {
        deploymentId: response.data.deploymentId,
        status: response.data.status,
        regions: response.data.regions || [],
      };
    } catch (error) {
      logger.error({ error, deploymentId }, 'Failed to get deployment status');
      throw new Error(`Get deployment status failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get edge locations
   */
  async getEdgeLocations(): Promise<string[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this.client.get('/api/v1/locations');
      return response.data.locations || [];
    } catch (error) {
      logger.error({ error }, 'Failed to get edge locations');
      return [];
    }
  }

  /**
   * Remove policy from edge
   */
  async removePolicy(policyId: string, regions?: string[]): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      await this.client.delete('/api/v1/policies', {
        data: {
          policyId,
          regions,
        },
      });

      logger.info({ policyId, regions }, 'Policy removed from edge');
    } catch (error) {
      logger.error({ error, policyId }, 'Failed to remove policy from edge');
      throw new Error(`Edge removal failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check Edge service health
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error({ error }, 'LLM-Edge-Agent health check failed');
      return false;
    }
  }
}

export const edgeClient = new EdgeClient();
