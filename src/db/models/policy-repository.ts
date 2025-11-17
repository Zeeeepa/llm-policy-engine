/**
 * Policy Repository - Database operations for policies
 */
import { db } from '../client';
import { Policy, PolicyStatus } from '../../types/policy';
import { DatabaseError, PolicyNotFoundError } from '@utils/errors';
import logger from '@utils/logger';

export class PolicyRepository {
  /**
   * Create a new policy
   */
  async create(policy: Policy, createdBy?: string): Promise<Policy> {
    try {
      const result = await db.query(
        `INSERT INTO policies (
          id, name, description, version, namespace, tags, priority, status, rules, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          policy.metadata.id,
          policy.metadata.name,
          policy.metadata.description,
          policy.metadata.version,
          policy.metadata.namespace,
          policy.metadata.tags || [],
          policy.metadata.priority || 0,
          policy.status,
          JSON.stringify(policy.rules),
          createdBy,
        ],
      );

      logger.info({ policyId: policy.metadata.id }, 'Policy created in database');

      return this.mapRowToPolicy(result.rows[0]);
    } catch (error) {
      throw new DatabaseError(
        `Failed to create policy: ${error instanceof Error ? error.message : String(error)}`,
        { policyId: policy.metadata.id },
      );
    }
  }

  /**
   * Get policy by ID
   */
  async findById(id: string): Promise<Policy | null> {
    try {
      const result = await db.query(
        'SELECT * FROM policies WHERE id = $1',
        [id],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToPolicy(result.rows[0]);
    } catch (error) {
      throw new DatabaseError(
        `Failed to find policy: ${error instanceof Error ? error.message : String(error)}`,
        { policyId: id },
      );
    }
  }

  /**
   * Get all active policies
   */
  async findActive(): Promise<Policy[]> {
    try {
      const result = await db.query(
        'SELECT * FROM policies WHERE status = $1 ORDER BY priority DESC, created_at DESC',
        ['active'],
      );

      return result.rows.map((row) => this.mapRowToPolicy(row));
    } catch (error) {
      throw new DatabaseError(
        `Failed to find active policies: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get policies by namespace
   */
  async findByNamespace(namespace: string): Promise<Policy[]> {
    try {
      const result = await db.query(
        'SELECT * FROM policies WHERE namespace = $1 ORDER BY priority DESC, created_at DESC',
        [namespace],
      );

      return result.rows.map((row) => this.mapRowToPolicy(row));
    } catch (error) {
      throw new DatabaseError(
        `Failed to find policies by namespace: ${error instanceof Error ? error.message : String(error)}`,
        { namespace },
      );
    }
  }

  /**
   * Update policy
   */
  async update(id: string, updates: Partial<Policy>): Promise<Policy> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new PolicyNotFoundError(id);
      }

      const updatedPolicy = {
        ...existing,
        ...updates,
        metadata: {
          ...existing.metadata,
          ...updates.metadata,
        },
      };

      const result = await db.query(
        `UPDATE policies SET
          name = $1, description = $2, version = $3, namespace = $4,
          tags = $5, priority = $6, status = $7, rules = $8
        WHERE id = $9
        RETURNING *`,
        [
          updatedPolicy.metadata.name,
          updatedPolicy.metadata.description,
          updatedPolicy.metadata.version,
          updatedPolicy.metadata.namespace,
          updatedPolicy.metadata.tags || [],
          updatedPolicy.metadata.priority || 0,
          updatedPolicy.status,
          JSON.stringify(updatedPolicy.rules),
          id,
        ],
      );

      logger.info({ policyId: id }, 'Policy updated in database');

      return this.mapRowToPolicy(result.rows[0]);
    } catch (error) {
      if (error instanceof PolicyNotFoundError) {
        throw error;
      }
      throw new DatabaseError(
        `Failed to update policy: ${error instanceof Error ? error.message : String(error)}`,
        { policyId: id },
      );
    }
  }

  /**
   * Delete policy
   */
  async delete(id: string): Promise<void> {
    try {
      const result = await db.query(
        'DELETE FROM policies WHERE id = $1',
        [id],
      );

      if (result.rowCount === 0) {
        throw new PolicyNotFoundError(id);
      }

      logger.info({ policyId: id }, 'Policy deleted from database');
    } catch (error) {
      if (error instanceof PolicyNotFoundError) {
        throw error;
      }
      throw new DatabaseError(
        `Failed to delete policy: ${error instanceof Error ? error.message : String(error)}`,
        { policyId: id },
      );
    }
  }

  /**
   * Map database row to Policy object
   */
  private mapRowToPolicy(row: any): Policy {
    return {
      metadata: {
        id: row.id,
        name: row.name,
        description: row.description,
        version: row.version,
        namespace: row.namespace,
        tags: row.tags || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by,
        priority: row.priority,
      },
      rules: row.rules,
      status: row.status as PolicyStatus,
    };
  }
}
