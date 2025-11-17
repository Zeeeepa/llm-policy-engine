/**
 * Evaluation Repository - Audit log repository for policy evaluations
 */
import { db } from '../client';
import { PolicyEvaluationRequest, PolicyEvaluationResponse, DecisionType } from '../../types/policy';
import { DatabaseError } from '@utils/errors';
import logger from '@utils/logger';

export interface EvaluationLog {
  id: string;
  requestId: string;
  policyIds: string[];
  decision: DecisionType;
  allowed: boolean;
  reason?: string;
  matchedPolicies: string[];
  matchedRules: string[];
  context: any;
  evaluationTimeMs: number;
  cached: boolean;
  createdAt: Date;
  metadata?: any;
}

export interface EvaluationFilters {
  requestId?: string;
  policyIds?: string[];
  decision?: DecisionType;
  allowed?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class EvaluationRepository {
  /**
   * Log a policy evaluation
   */
  async log(
    request: PolicyEvaluationRequest,
    response: PolicyEvaluationResponse,
  ): Promise<EvaluationLog> {
    try {
      const result = await db.query(
        `INSERT INTO policy_evaluations (
          request_id, policy_ids, decision, allowed, reason,
          matched_policies, matched_rules, context, evaluation_time_ms, cached, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          response.requestId,
          request.policies || [],
          response.decision.decision,
          response.decision.allowed,
          response.decision.reason,
          response.decision.matchedPolicies,
          response.decision.matchedRules,
          JSON.stringify(request.context),
          response.decision.evaluationTimeMs,
          response.cached || false,
          JSON.stringify(response.decision.metadata || {}),
        ],
      );

      logger.debug({ requestId: response.requestId }, 'Evaluation logged to database');

      return this.mapRowToEvaluationLog(result.rows[0]);
    } catch (error) {
      throw new DatabaseError(
        `Failed to log evaluation: ${error instanceof Error ? error.message : String(error)}`,
        { requestId: request.requestId },
      );
    }
  }

  /**
   * Get evaluation by request ID
   */
  async findByRequestId(requestId: string): Promise<EvaluationLog | null> {
    try {
      const result = await db.query(
        'SELECT * FROM policy_evaluations WHERE request_id = $1',
        [requestId],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEvaluationLog(result.rows[0]);
    } catch (error) {
      throw new DatabaseError(
        `Failed to find evaluation: ${error instanceof Error ? error.message : String(error)}`,
        { requestId },
      );
    }
  }

  /**
   * Find evaluations with filters
   */
  async find(filters: EvaluationFilters): Promise<EvaluationLog[]> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramCount = 1;

      if (filters.requestId) {
        conditions.push(`request_id = $${paramCount++}`);
        params.push(filters.requestId);
      }

      if (filters.policyIds && filters.policyIds.length > 0) {
        conditions.push(`policy_ids && $${paramCount++}`);
        params.push(filters.policyIds);
      }

      if (filters.decision) {
        conditions.push(`decision = $${paramCount++}`);
        params.push(filters.decision);
      }

      if (filters.allowed !== undefined) {
        conditions.push(`allowed = $${paramCount++}`);
        params.push(filters.allowed);
      }

      if (filters.startDate) {
        conditions.push(`created_at >= $${paramCount++}`);
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        conditions.push(`created_at <= $${paramCount++}`);
        params.push(filters.endDate);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = filters.limit || 100;
      const offset = filters.offset || 0;

      const query = `
        SELECT * FROM policy_evaluations
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount++} OFFSET $${paramCount++}
      `;

      params.push(limit, offset);

      const result = await db.query(query, params);

      return result.rows.map((row) => this.mapRowToEvaluationLog(row));
    } catch (error) {
      throw new DatabaseError(
        `Failed to find evaluations: ${error instanceof Error ? error.message : String(error)}`,
        { filters },
      );
    }
  }

  /**
   * Get evaluations by policy ID
   */
  async findByPolicyId(policyId: string, limit: number = 100): Promise<EvaluationLog[]> {
    return this.find({ policyIds: [policyId], limit });
  }

  /**
   * Get evaluation statistics
   */
  async getStats(startDate?: Date, endDate?: Date): Promise<{
    total: number;
    allowed: number;
    denied: number;
    warned: number;
    modified: number;
    avgEvaluationTimeMs: number;
    cacheHitRate: number;
  }> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramCount = 1;

      if (startDate) {
        conditions.push(`created_at >= $${paramCount++}`);
        params.push(startDate);
      }

      if (endDate) {
        conditions.push(`created_at <= $${paramCount++}`);
        params.push(endDate);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await db.query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN allowed = true THEN 1 ELSE 0 END) as allowed,
          SUM(CASE WHEN decision = 'deny' THEN 1 ELSE 0 END) as denied,
          SUM(CASE WHEN decision = 'warn' THEN 1 ELSE 0 END) as warned,
          SUM(CASE WHEN decision = 'modify' THEN 1 ELSE 0 END) as modified,
          AVG(evaluation_time_ms) as avg_evaluation_time_ms,
          SUM(CASE WHEN cached = true THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as cache_hit_rate
        FROM policy_evaluations
        ${whereClause}`,
        params,
      );

      const row = result.rows[0];

      return {
        total: parseInt(row.total, 10),
        allowed: parseInt(row.allowed, 10),
        denied: parseInt(row.denied, 10),
        warned: parseInt(row.warned, 10),
        modified: parseInt(row.modified, 10),
        avgEvaluationTimeMs: parseFloat(row.avg_evaluation_time_ms) || 0,
        cacheHitRate: parseFloat(row.cache_hit_rate) || 0,
      };
    } catch (error) {
      throw new DatabaseError(
        `Failed to get evaluation stats: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete old evaluations
   */
  async deleteOlderThan(days: number): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await db.query(
        'DELETE FROM policy_evaluations WHERE created_at < $1',
        [cutoffDate],
      );

      logger.info(
        { deletedCount: result.rowCount, days },
        'Old evaluations deleted from database',
      );

      return result.rowCount || 0;
    } catch (error) {
      throw new DatabaseError(
        `Failed to delete old evaluations: ${error instanceof Error ? error.message : String(error)}`,
        { days },
      );
    }
  }

  /**
   * Map database row to EvaluationLog object
   */
  private mapRowToEvaluationLog(row: any): EvaluationLog {
    return {
      id: row.id,
      requestId: row.request_id,
      policyIds: row.policy_ids || [],
      decision: row.decision as DecisionType,
      allowed: row.allowed,
      reason: row.reason,
      matchedPolicies: row.matched_policies || [],
      matchedRules: row.matched_rules || [],
      context: row.context,
      evaluationTimeMs: row.evaluation_time_ms,
      cached: row.cached,
      createdAt: row.created_at,
      metadata: row.metadata,
    };
  }
}
