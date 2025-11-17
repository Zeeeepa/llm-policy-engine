/**
 * Cache Manager - Unified L1 + L2 cache interface
 * Implements cache-aside pattern with memory (L1) and Redis (L2) layers
 */
import { MemoryCache } from './l1/memory-cache';
import { RedisCache } from './l2/redis-cache';
import { config } from '@utils/config';
import logger from '@utils/logger';

export class CacheManager {
  private l1Cache: MemoryCache;
  private l2Cache: RedisCache;
  private enabled: boolean;
  private defaultTTL: number;

  constructor() {
    this.enabled = config.cache.enabled !== false;
    this.defaultTTL = config.cache.ttl;
    this.l1Cache = new MemoryCache(config.cache.maxSize, this.defaultTTL);
    this.l2Cache = new RedisCache(this.defaultTTL);

    if (this.enabled) {
      logger.info({ l1MaxSize: config.cache.maxSize, ttl: this.defaultTTL }, 'Cache manager initialized');
    } else {
      logger.warn('Cache is disabled');
    }
  }

  /**
   * Get value from cache (L1 -> L2 -> null)
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) return null;

    try {
      // Try L1 first
      const l1Value = await this.l1Cache.get<T>(key);
      if (l1Value !== null) {
        logger.debug({ key, layer: 'L1' }, 'Cache hit');
        return l1Value;
      }

      // Try L2 if L1 miss
      const l2Value = await this.l2Cache.get<T>(key);
      if (l2Value !== null) {
        // Populate L1 on L2 hit
        await this.l1Cache.set(key, l2Value, this.defaultTTL);
        logger.debug({ key, layer: 'L2' }, 'Cache hit');
        return l2Value;
      }

      logger.debug({ key }, 'Cache miss');
      return null;
    } catch (error) {
      logger.error({ key, error }, 'Cache get error, falling through');
      return null;
    }
  }

  /**
   * Set value in cache (L1 + L2)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.enabled) return;

    const cacheTTL = ttl || this.defaultTTL;

    try {
      // Set in both layers
      await Promise.all([
        this.l1Cache.set(key, value, cacheTTL),
        this.l2Cache.set(key, value, cacheTTL),
      ]);

      logger.debug({ key, ttl: cacheTTL }, 'Cache set');
    } catch (error) {
      logger.error({ key, error }, 'Cache set error');
      // Don't throw - cache errors shouldn't break application
    }
  }

  /**
   * Delete value from cache (L1 + L2)
   */
  async delete(key: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const [l1Deleted, l2Deleted] = await Promise.all([
        this.l1Cache.delete(key),
        this.l2Cache.delete(key),
      ]);

      logger.debug({ key, l1Deleted, l2Deleted }, 'Cache delete');
      return l1Deleted || l2Deleted;
    } catch (error) {
      logger.error({ key, error }, 'Cache delete error');
      return false;
    }
  }

  /**
   * Delete multiple keys
   */
  async deleteMany(keys: string[]): Promise<number> {
    if (!this.enabled || keys.length === 0) return 0;

    let deleted = 0;
    for (const key of keys) {
      const wasDeleted = await this.delete(key);
      if (wasDeleted) deleted++;
    }

    return deleted;
  }

  /**
   * Delete keys matching pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.enabled) return 0;

    try {
      // For simplicity, only clear L2 by pattern
      // L1 will naturally expire
      const fullPattern = `${config.redis.keyPrefix}${pattern}`;
      logger.info({ pattern: fullPattern }, 'Deleting cache keys by pattern');

      // Get all matching keys
      const keys = await (this.l2Cache as any).client.keys(fullPattern);
      if (keys.length > 0) {
        await (this.l2Cache as any).client.del(...keys);
      }

      return keys.length;
    } catch (error) {
      logger.error({ pattern, error }, 'Cache pattern delete error');
      return 0;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (!this.enabled) return;

    try {
      await Promise.all([this.l1Cache.clear(), this.l2Cache.clear()]);
      logger.info('Cache cleared');
    } catch (error) {
      logger.error({ error }, 'Cache clear error');
    }
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const l1Has = await this.l1Cache.has(key);
      if (l1Has) return true;

      return await this.l2Cache.has(key);
    } catch (error) {
      logger.error({ key, error }, 'Cache has check error');
      return false;
    }
  }

  /**
   * Get or set pattern - fetch from cache or compute and cache
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Wrap a function with caching
   */
  wrap<T>(
    keyGenerator: (...args: any[]) => string,
    ttl?: number,
  ): (fn: (...args: any[]) => Promise<T>) => (...args: any[]) => Promise<T> {
    return (fn: (...args: any[]) => Promise<T>) => {
      return async (...args: any[]): Promise<T> => {
        const key = keyGenerator(...args);
        return this.getOrSet(key, () => fn(...args), ttl);
      };
    };
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const l1Stats = this.l1Cache.getStats();
    return {
      enabled: this.enabled,
      l1: l1Stats,
      l2: {
        connected: this.l2Cache.isReady(),
      },
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const l2Healthy = await this.l2Cache.ping();
      const stats = this.getStats();

      return {
        healthy: l2Healthy,
        details: {
          ...stats,
          l2Healthy,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  /**
   * Cleanup expired entries in L1
   */
  async cleanup(): Promise<void> {
    try {
      await this.l1Cache.cleanup();
    } catch (error) {
      logger.error({ error }, 'Cache cleanup error');
    }
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    try {
      await this.l2Cache.close();
      logger.info('Cache manager closed');
    } catch (error) {
      logger.error({ error }, 'Cache close error');
    }
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
export default cacheManager;
