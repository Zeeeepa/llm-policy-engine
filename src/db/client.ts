/**
 * Database client using pg (PostgreSQL)
 */
import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '@utils/config';
import logger from '@utils/logger';
import { DatabaseError } from '@utils/errors';

class DatabaseClient {
  private pool: Pool;
  private isConnected: boolean = false;

  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      min: config.database.poolMin,
      max: config.database.poolMax,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      logger.error({ error: err }, 'Unexpected database pool error');
    });

    this.pool.on('connect', () => {
      if (!this.isConnected) {
        logger.info('Database pool connected');
        this.isConnected = true;
      }
    });
  }

  /**
   * Execute a query
   */
  async query<T extends Record<string, any> = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      logger.debug({ text, duration, rows: result.rowCount }, 'Query executed');

      return result;
    } catch (error) {
      logger.error({ text, params, error }, 'Query failed');
      throw new DatabaseError(
        `Query failed: ${error instanceof Error ? error.message : String(error)}`,
        { query: text, params },
      );
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      return client;
    } catch (error) {
      throw new DatabaseError(
        `Failed to get database client: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check database connection
   */
  async ping(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error({ error }, 'Database ping failed');
      return false;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
    logger.info('Database pool closed');
  }
}

// Export singleton instance
export const db = new DatabaseClient();
export default db;
