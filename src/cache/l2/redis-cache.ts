/**
 * L2 Redis Distributed Cache
 * Shared cache across multiple instances
 */
import Redis from 'ioredis';
import { config } from '@utils/config';
import { CacheError } from '@utils/errors';
import logger from '@utils/logger';

export class RedisCache {
  private client: Redis;
  private isConnected: boolean = false;
  private defaultTTL: number;

  constructor(ttl: number = 300) {
    this.defaultTTL = ttl;

    this.client = new Redis(config.redis.url, {
      password: config.redis.password,
      db: config.redis.db,
      keyPrefix: config.redis.keyPrefix,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      lazyConnect: false,
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis cache connected');
    });

    this.client.on('error', (error) => {
      logger.error({ error }, 'Redis cache error');
      this.isConnected = false;
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis cache connection closed');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis cache reconnecting');
    });
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) {
        logger.debug({ key, result: 'miss' }, 'Redis cache miss');
        return null;
      }

      logger.debug({ key, result: 'hit' }, 'Redis cache hit');
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error({ key, error }, 'Redis get failed');
      throw new CacheError(
        `Redis get failed: ${error instanceof Error ? error.message : String(error)}`,
        { key },
      );
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const ttlSeconds = ttl || this.defaultTTL;
      const serialized = JSON.stringify(value);

      if (ttlSeconds > 0) {
        await this.client.setex(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }

      logger.debug({ key, ttl: ttlSeconds }, 'Redis cache set');
    } catch (error) {
      logger.error({ key, error }, 'Redis set failed');
      throw new CacheError(
        `Redis set failed: ${error instanceof Error ? error.message : String(error)}`,
        { key },
      );
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      logger.debug({ key, deleted: result > 0 }, 'Redis cache delete');
      return result > 0;
    } catch (error) {
      logger.error({ key, error }, 'Redis delete failed');
      throw new CacheError(
        `Redis delete failed: ${error instanceof Error ? error.message : String(error)}`,
        { key },
      );
    }
  }

  /**
   * Clear all cache entries with prefix
   */
  async clear(): Promise<void> {
    try {
      const pattern = `${config.redis.keyPrefix}*`;
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.info({ count: keys.length }, 'Redis cache cleared');
      }
    } catch (error) {
      logger.error({ error }, 'Redis clear failed');
      throw new CacheError(
        `Redis clear failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ key, error }, 'Redis exists check failed');
      return false;
    }
  }

  /**
   * Get multiple values
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      if (keys.length === 0) return [];

      const values = await this.client.mget(...keys);
      return values.map((v) => (v ? (JSON.parse(v) as T) : null));
    } catch (error) {
      logger.error({ keys, error }, 'Redis mget failed');
      throw new CacheError(
        `Redis mget failed: ${error instanceof Error ? error.message : String(error)}`,
        { keys },
      );
    }
  }

  /**
   * Set multiple values
   */
  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    try {
      const pipeline = this.client.pipeline();

      for (const entry of entries) {
        const serialized = JSON.stringify(entry.value);
        const ttlSeconds = entry.ttl || this.defaultTTL;

        if (ttlSeconds > 0) {
          pipeline.setex(entry.key, ttlSeconds, serialized);
        } else {
          pipeline.set(entry.key, serialized);
        }
      }

      await pipeline.exec();
      logger.debug({ count: entries.length }, 'Redis mset completed');
    } catch (error) {
      logger.error({ error }, 'Redis mset failed');
      throw new CacheError(
        `Redis mset failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Increment counter
   */
  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error({ key, error }, 'Redis incr failed');
      throw new CacheError(
        `Redis incr failed: ${error instanceof Error ? error.message : String(error)}`,
        { key },
      );
    }
  }

  /**
   * Decrement counter
   */
  async decr(key: string): Promise<number> {
    try {
      return await this.client.decr(key);
    } catch (error) {
      logger.error({ key, error }, 'Redis decr failed');
      throw new CacheError(
        `Redis decr failed: ${error instanceof Error ? error.message : String(error)}`,
        { key },
      );
    }
  }

  /**
   * Set expiration time
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      logger.error({ key, error }, 'Redis expire failed');
      return false;
    }
  }

  /**
   * Get time to live
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error({ key, error }, 'Redis ttl failed');
      return -1;
    }
  }

  /**
   * Check connection status
   */
  isReady(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  /**
   * Ping Redis
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error({ error }, 'Redis ping failed');
      return false;
    }
  }

  /**
   * Get Redis info
   */
  async info(): Promise<string> {
    try {
      return await this.client.info();
    } catch (error) {
      logger.error({ error }, 'Redis info failed');
      return '';
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.client.quit();
    logger.info('Redis cache connection closed');
  }
}
