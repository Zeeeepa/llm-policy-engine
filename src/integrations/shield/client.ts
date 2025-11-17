/**
 * LLM-Shield Integration Client
 * Integration with LLM-Shield for security scanning
 */
import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import logger from '@utils/logger';

export interface ShieldScanRequest {
  prompt: string;
  model?: string;
  context?: Record<string, any>;
}

export interface ShieldScanResult {
  safe: boolean;
  threats: ShieldThreat[];
  score: number;
  scanTimeMs: number;
}

export interface ShieldThreat {
  type: 'prompt_injection' | 'jailbreak' | 'data_exfiltration' | 'pii_leakage' | 'toxic_content';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  details: string;
  location?: {
    start: number;
    end: number;
  };
}

export class ShieldClient {
  private client: AxiosInstance;
  private enabled: boolean;

  constructor() {
    this.enabled = !!config.integrations.llmShieldUrl;

    this.client = axios.create({
      baseURL: config.integrations.llmShieldUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LLM-Policy-Engine/1.0',
      },
    });
  }

  /**
   * Scan prompt for security threats
   */
  async scanPrompt(request: ShieldScanRequest): Promise<ShieldScanResult> {
    if (!this.enabled) {
      logger.debug('LLM-Shield integration disabled, skipping scan');
      return {
        safe: true,
        threats: [],
        score: 1.0,
        scanTimeMs: 0,
      };
    }

    const startTime = Date.now();

    try {
      const response = await this.client.post('/api/v1/scan', {
        prompt: request.prompt,
        model: request.model,
        context: request.context,
      });

      const scanTimeMs = Date.now() - startTime;

      const result: ShieldScanResult = {
        safe: response.data.safe,
        threats: response.data.threats || [],
        score: response.data.score || 1.0,
        scanTimeMs,
      };

      logger.info(
        {
          safe: result.safe,
          threatCount: result.threats.length,
          score: result.score,
          scanTimeMs,
        },
        'LLM-Shield scan completed',
      );

      return result;
    } catch (error) {
      logger.error({ error }, 'LLM-Shield scan failed');

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          logger.warn('LLM-Shield service unavailable, allowing request');
          return {
            safe: true,
            threats: [],
            score: 1.0,
            scanTimeMs: Date.now() - startTime,
          };
        }
      }

      throw new Error(`Shield scan failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Batch scan multiple prompts
   */
  async scanBatch(requests: ShieldScanRequest[]): Promise<ShieldScanResult[]> {
    if (!this.enabled) {
      return requests.map(() => ({
        safe: true,
        threats: [],
        score: 1.0,
        scanTimeMs: 0,
      }));
    }

    try {
      const response = await this.client.post('/api/v1/scan/batch', {
        requests: requests.map((r) => ({
          prompt: r.prompt,
          model: r.model,
          context: r.context,
        })),
      });

      return response.data.results || [];
    } catch (error) {
      logger.error({ error }, 'LLM-Shield batch scan failed');
      throw new Error(`Shield batch scan failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check Shield service health
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error({ error }, 'LLM-Shield health check failed');
      return false;
    }
  }
}

export const shieldClient = new ShieldClient();
