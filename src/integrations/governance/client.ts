/**
 * LLM-Governance Integration Client
 * Integration with LLM-Governance for compliance and auditing
 */
import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import logger from '@utils/logger';

export interface ComplianceCheckRequest {
  provider: string;
  model: string;
  prompt?: string;
  userId?: string;
  teamId?: string;
  region?: string;
  metadata?: Record<string, any>;
}

export interface ComplianceCheckResult {
  compliant: boolean;
  violations: ComplianceViolation[];
  recommendations: string[];
}

export interface ComplianceViolation {
  rule: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  regulation?: string;
}

export interface AuditLogEntry {
  eventType: string;
  userId?: string;
  teamId?: string;
  resource: string;
  action: string;
  result: 'success' | 'failure';
  metadata?: Record<string, any>;
}

export class GovernanceClient {
  private client: AxiosInstance;
  private enabled: boolean;

  constructor() {
    this.enabled = !!config.integrations.llmGovernanceUrl;

    this.client = axios.create({
      baseURL: config.integrations.llmGovernanceUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LLM-Policy-Engine/1.0',
      },
    });
  }

  /**
   * Check compliance requirements
   */
  async checkCompliance(request: ComplianceCheckRequest): Promise<ComplianceCheckResult> {
    if (!this.enabled) {
      logger.debug('LLM-Governance integration disabled, skipping compliance check');
      return {
        compliant: true,
        violations: [],
        recommendations: [],
      };
    }

    try {
      const response = await this.client.post('/api/v1/compliance/check', {
        provider: request.provider,
        model: request.model,
        prompt: request.prompt,
        userId: request.userId,
        teamId: request.teamId,
        region: request.region,
        metadata: request.metadata,
        timestamp: Date.now(),
      });

      const result: ComplianceCheckResult = {
        compliant: response.data.compliant,
        violations: response.data.violations || [],
        recommendations: response.data.recommendations || [],
      };

      logger.info(
        {
          compliant: result.compliant,
          violationCount: result.violations.length,
          provider: request.provider,
          model: request.model,
        },
        'Compliance check completed',
      );

      return result;
    } catch (error) {
      logger.error({ error }, 'LLM-Governance compliance check failed');

      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        logger.warn('LLM-Governance service unavailable, allowing request');
        return {
          compliant: true,
          violations: [],
          recommendations: [],
        };
      }

      throw new Error(`Compliance check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Log audit event
   */
  async logAuditEvent(entry: AuditLogEntry): Promise<void> {
    if (!this.enabled) {
      logger.debug('LLM-Governance integration disabled, skipping audit log');
      return;
    }

    try {
      await this.client.post('/api/v1/audit/log', {
        ...entry,
        timestamp: Date.now(),
      });

      logger.debug(
        {
          eventType: entry.eventType,
          resource: entry.resource,
          action: entry.action,
          result: entry.result,
        },
        'Audit event logged',
      );
    } catch (error) {
      logger.error({ error }, 'LLM-Governance audit log failed');
    }
  }

  /**
   * Get audit trail
   */
  async getAuditTrail(filters: {
    userId?: string;
    teamId?: string;
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this.client.get('/api/v1/audit/trail', {
        params: {
          userId: filters.userId,
          teamId: filters.teamId,
          eventType: filters.eventType,
          startDate: filters.startDate?.toISOString(),
          endDate: filters.endDate?.toISOString(),
          limit: filters.limit || 100,
        },
      });

      return response.data.entries || [];
    } catch (error) {
      logger.error({ error }, 'LLM-Governance audit trail failed');
      throw new Error(`Audit trail retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check model approval status
   */
  async isModelApproved(provider: string, model: string): Promise<boolean> {
    if (!this.enabled) {
      return true;
    }

    try {
      const response = await this.client.get('/api/v1/models/approved', {
        params: { provider, model },
      });

      return response.data.approved === true;
    } catch (error) {
      logger.error({ error }, 'LLM-Governance model approval check failed');
      return true;
    }
  }

  /**
   * Check Governance service health
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error({ error }, 'LLM-Governance health check failed');
      return false;
    }
  }
}

export const governanceClient = new GovernanceClient();
