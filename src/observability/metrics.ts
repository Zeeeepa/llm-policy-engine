/**
 * Metrics Collection using Prometheus
 * Production-grade metrics for monitoring and observability
 */
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import express, { Express } from 'express';
import { config } from '@utils/config';
import logger from '@utils/logger';

export class MetricsCollector {
  private registry: Registry;

  public policyEvaluations: Counter;
  public policyEvaluationDuration: Histogram;
  public policyEvaluationErrors: Counter;
  public activePolicies: Gauge;
  public cacheHits: Counter;
  public cacheMisses: Counter;
  public dbQueries: Counter;
  public dbQueryDuration: Histogram;
  public apiRequests: Counter;
  public apiRequestDuration: Histogram;
  public apiErrors: Counter;

  constructor() {
    this.registry = new Registry();

    collectDefaultMetrics({
      register: this.registry,
      prefix: 'llm_policy_engine_',
    });

    this.policyEvaluations = new Counter({
      name: 'llm_policy_evaluations_total',
      help: 'Total number of policy evaluations',
      labelNames: ['decision', 'cached'],
      registers: [this.registry],
    });

    this.policyEvaluationDuration = new Histogram({
      name: 'llm_policy_evaluation_duration_ms',
      help: 'Policy evaluation duration in milliseconds',
      labelNames: ['decision'],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.registry],
    });

    this.policyEvaluationErrors = new Counter({
      name: 'llm_policy_evaluation_errors_total',
      help: 'Total number of policy evaluation errors',
      labelNames: ['error_type'],
      registers: [this.registry],
    });

    this.activePolicies = new Gauge({
      name: 'llm_policy_active_policies',
      help: 'Number of active policies',
      registers: [this.registry],
    });

    this.cacheHits = new Counter({
      name: 'llm_policy_cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['layer'],
      registers: [this.registry],
    });

    this.cacheMisses = new Counter({
      name: 'llm_policy_cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['layer'],
      registers: [this.registry],
    });

    this.dbQueries = new Counter({
      name: 'llm_policy_db_queries_total',
      help: 'Total number of database queries',
      labelNames: ['operation'],
      registers: [this.registry],
    });

    this.dbQueryDuration = new Histogram({
      name: 'llm_policy_db_query_duration_ms',
      help: 'Database query duration in milliseconds',
      labelNames: ['operation'],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000],
      registers: [this.registry],
    });

    this.apiRequests = new Counter({
      name: 'llm_policy_api_requests_total',
      help: 'Total number of API requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    });

    this.apiRequestDuration = new Histogram({
      name: 'llm_policy_api_request_duration_ms',
      help: 'API request duration in milliseconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
      registers: [this.registry],
    });

    this.apiErrors = new Counter({
      name: 'llm_policy_api_errors_total',
      help: 'Total number of API errors',
      labelNames: ['method', 'path', 'error_type'],
      registers: [this.registry],
    });
  }

  /**
   * Get registry for exporting
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Record policy evaluation
   */
  recordEvaluation(decision: string, durationMs: number, cached: boolean = false): void {
    this.policyEvaluations.inc({ decision, cached: String(cached) });
    this.policyEvaluationDuration.observe({ decision }, durationMs);
  }

  /**
   * Record policy evaluation error
   */
  recordEvaluationError(errorType: string): void {
    this.policyEvaluationErrors.inc({ error_type: errorType });
  }

  /**
   * Set active policies count
   */
  setActivePolicies(count: number): void {
    this.activePolicies.set(count);
  }

  /**
   * Record cache hit
   */
  recordCacheHit(layer: 'L1' | 'L2'): void {
    this.cacheHits.inc({ layer });
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(layer: 'L1' | 'L2'): void {
    this.cacheMisses.inc({ layer });
  }

  /**
   * Record database query
   */
  recordDbQuery(operation: string, durationMs: number): void {
    this.dbQueries.inc({ operation });
    this.dbQueryDuration.observe({ operation }, durationMs);
  }

  /**
   * Record API request
   */
  recordApiRequest(method: string, path: string, status: number, durationMs: number): void {
    this.apiRequests.inc({ method, path, status: String(status) });
    this.apiRequestDuration.observe({ method, path, status: String(status) }, durationMs);
  }

  /**
   * Record API error
   */
  recordApiError(method: string, path: string, errorType: string): void {
    this.apiErrors.inc({ method, path, error_type: errorType });
  }
}

export const metricsCollector = new MetricsCollector();

/**
 * Start metrics server
 */
export function startMetricsServer(port?: number): void {
  const app: Express = express();
  const metricsPort = port || config.observability.metricsPort;

  app.get(config.observability.metricsPath, async (_req, res) => {
    try {
      res.set('Content-Type', metricsCollector.getRegistry().contentType);
      const metrics = await metricsCollector.getMetrics();
      res.send(metrics);
    } catch (error) {
      logger.error({ error }, 'Failed to export metrics');
      res.status(500).send('Failed to export metrics');
    }
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'healthy' });
  });

  app.listen(metricsPort, () => {
    logger.info(
      {
        port: metricsPort,
        path: config.observability.metricsPath,
      },
      'Metrics server started',
    );
  });
}
