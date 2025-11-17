/**
 * API Key Repository
 * Database operations for API key management with bcrypt hashing
 */
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { db } from '../client';
import logger from '@utils/logger';
import { DatabaseError } from '@utils/errors';

export interface APIKey {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  permissions: string[];
  rate_limit: number;
  expires_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
  created_by: string | null;
  revoked: boolean;
}

export interface CreateAPIKeyParams {
  name: string;
  permissions: string[];
  rateLimit?: number;
  expiresAt?: Date;
  createdBy?: string;
}

export interface GeneratedAPIKey {
  apiKey: APIKey;
  rawKey: string; // Only returned on creation, never stored
}

const BCRYPT_ROUNDS = 12;
const API_KEY_LENGTH = 32; // 256 bits
const API_KEY_PREFIX = 'llmpe_'; // LLM Policy Engine prefix

/**
 * API Key Repository
 */
export class APIKeyRepository {
  /**
   * Generate a secure API key
   * Format: llmpe_<random_bytes_hex>
   */
  private generateSecureKey(): string {
    const randomBytesHex = randomBytes(API_KEY_LENGTH).toString('hex');
    return `${API_KEY_PREFIX}${randomBytesHex}`;
  }

  /**
   * Extract key prefix for identification (first 12 chars)
   */
  private extractKeyPrefix(key: string): string {
    return key.substring(0, 12);
  }

  /**
   * Hash API key using bcrypt
   */
  async hashApiKey(key: string): Promise<string> {
    try {
      return await bcrypt.hash(key, BCRYPT_ROUNDS);
    } catch (error) {
      throw new DatabaseError(
        `Failed to hash API key: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Validate API key against stored hash
   */
  private async compareKey(key: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(key, hash);
    } catch (error) {
      logger.error({ error }, 'Failed to compare API key');
      return false;
    }
  }

  /**
   * Create a new API key
   */
  async createApiKey(params: CreateAPIKeyParams): Promise<GeneratedAPIKey> {
    const rawKey = this.generateSecureKey();
    const keyHash = await this.hashApiKey(rawKey);
    const keyPrefix = this.extractKeyPrefix(rawKey);

    try {
      const result = await db.query<APIKey>(
        `INSERT INTO api_keys (
          name, key_hash, key_prefix, permissions, rate_limit, expires_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          params.name,
          keyHash,
          keyPrefix,
          params.permissions,
          params.rateLimit || 100,
          params.expiresAt || null,
          params.createdBy || null,
        ],
      );

      if (result.rows.length === 0) {
        throw new DatabaseError('Failed to create API key');
      }

      const apiKey = result.rows[0];

      logger.info(
        {
          keyId: apiKey.id,
          name: apiKey.name,
          keyPrefix: apiKey.key_prefix,
          permissions: apiKey.permissions,
        },
        'API key created',
      );

      return {
        apiKey,
        rawKey, // Only returned once, never stored
      };
    } catch (error) {
      throw new DatabaseError(
        `Failed to create API key: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Validate API key and return key details if valid
   * Returns null if key is invalid, expired, or revoked
   */
  async validateApiKey(key: string): Promise<APIKey | null> {
    // Validate key format
    if (!key || !key.startsWith(API_KEY_PREFIX)) {
      logger.debug('Invalid API key format');
      return null;
    }

    const keyPrefix = this.extractKeyPrefix(key);

    try {
      // Find API keys with matching prefix
      const result = await db.query<APIKey>(
        `SELECT * FROM api_keys
         WHERE key_prefix = $1
         AND revoked = false
         AND (expires_at IS NULL OR expires_at > NOW())`,
        [keyPrefix],
      );

      // Check each matching key with bcrypt
      for (const apiKey of result.rows) {
        const isValid = await this.compareKey(key, apiKey.key_hash);

        if (isValid) {
          // Update last_used_at timestamp asynchronously
          this.updateLastUsed(apiKey.id).catch((err) => {
            logger.warn({ error: err, keyId: apiKey.id }, 'Failed to update last_used_at');
          });

          logger.debug(
            {
              keyId: apiKey.id,
              keyPrefix: apiKey.key_prefix,
              permissions: apiKey.permissions,
            },
            'API key validated successfully',
          );

          return apiKey;
        }
      }

      logger.debug({ keyPrefix }, 'API key validation failed');
      return null;
    } catch (error) {
      logger.error({ error, keyPrefix }, 'Error validating API key');
      return null;
    }
  }

  /**
   * Update last_used_at timestamp for API key
   */
  async updateLastUsed(id: string): Promise<void> {
    try {
      await db.query(
        `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
        [id],
      );
    } catch (error) {
      throw new DatabaseError(
        `Failed to update last_used_at: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(id: string): Promise<void> {
    try {
      const result = await db.query(
        `UPDATE api_keys SET revoked = true WHERE id = $1 RETURNING *`,
        [id],
      );

      if (result.rowCount === 0) {
        throw new DatabaseError(`API key not found: ${id}`);
      }

      logger.info({ keyId: id }, 'API key revoked');
    } catch (error) {
      throw new DatabaseError(
        `Failed to revoke API key: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get API key by ID
   */
  async getApiKeyById(id: string): Promise<APIKey | null> {
    try {
      const result = await db.query<APIKey>(
        `SELECT * FROM api_keys WHERE id = $1`,
        [id],
      );

      return result.rows[0] || null;
    } catch (error) {
      throw new DatabaseError(
        `Failed to get API key: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * List all API keys (excluding hashes)
   */
  async listApiKeys(filters?: {
    revoked?: boolean;
    createdBy?: string;
  }): Promise<Omit<APIKey, 'key_hash'>[]> {
    try {
      let query = `SELECT
        id, name, key_prefix, permissions, rate_limit,
        expires_at, last_used_at, created_at, created_by, revoked
        FROM api_keys WHERE 1=1`;
      const params: any[] = [];
      let paramCount = 1;

      if (filters?.revoked !== undefined) {
        query += ` AND revoked = $${paramCount}`;
        params.push(filters.revoked);
        paramCount++;
      }

      if (filters?.createdBy) {
        query += ` AND created_by = $${paramCount}`;
        params.push(filters.createdBy);
        paramCount++;
      }

      query += ` ORDER BY created_at DESC`;

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new DatabaseError(
        `Failed to list API keys: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete an API key permanently
   */
  async deleteApiKey(id: string): Promise<void> {
    try {
      const result = await db.query(
        `DELETE FROM api_keys WHERE id = $1 RETURNING *`,
        [id],
      );

      if (result.rowCount === 0) {
        throw new DatabaseError(`API key not found: ${id}`);
      }

      logger.info({ keyId: id }, 'API key deleted');
    } catch (error) {
      throw new DatabaseError(
        `Failed to delete API key: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Rotate an API key (revoke old, create new)
   */
  async rotateApiKey(id: string): Promise<GeneratedAPIKey> {
    const oldKey = await this.getApiKeyById(id);

    if (!oldKey) {
      throw new DatabaseError(`API key not found: ${id}`);
    }

    // Create new key with same properties
    const newKey = await this.createApiKey({
      name: `${oldKey.name} (rotated)`,
      permissions: oldKey.permissions,
      rateLimit: oldKey.rate_limit,
      expiresAt: oldKey.expires_at || undefined,
      createdBy: oldKey.created_by || undefined,
    });

    // Revoke old key
    await this.revokeApiKey(id);

    logger.info(
      { oldKeyId: id, newKeyId: newKey.apiKey.id },
      'API key rotated',
    );

    return newKey;
  }
}

// Export singleton instance
export const apiKeyRepository = new APIKeyRepository();
export default apiKeyRepository;
