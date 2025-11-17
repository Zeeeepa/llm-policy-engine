/**
 * Rate Limiting Middleware
 * Protect API endpoints from abuse
 */
import rateLimit from 'express-rate-limit';
import { RedisCache } from '@cache/l2/redis-cache';
import { config } from '@utils/config';
import logger from '@utils/logger';

/**
 * In-memory rate limiter (default)
 */
export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: 'Too Many Requests',
    message: 'You have exceeded the rate limit. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(
      {
        ip: req.ip,
        path: req.path,
        method: req.method,
      },
      'Rate limit exceeded',
    );

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter: (req as any).rateLimit?.resetTime,
    });
  },
});

/**
 * Strict rate limiter for authentication endpoints
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    error: 'Too Many Requests',
    message: 'Too many authentication attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

/**
 * Relaxed rate limiter for read-only endpoints
 */
export const readOnlyRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests * 2,
  message: {
    error: 'Too Many Requests',
    message: 'You have exceeded the rate limit. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for write endpoints
 */
export const writeRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: Math.floor(config.rateLimit.maxRequests / 2),
  message: {
    error: 'Too Many Requests',
    message: 'You have exceeded the rate limit for write operations.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Redis-based distributed rate limiter
 * Use this in production with multiple instances
 */
export class RedisRateLimiter {
  private redis: RedisCache;
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = config.rateLimit.windowMs, maxRequests: number = config.rateLimit.maxRequests) {
    this.redis = new RedisCache();
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check and increment rate limit
   */
  async check(key: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    resetTime: number;
  }> {
    const now = Date.now();
    const windowKey = `ratelimit:${key}:${Math.floor(now / this.windowMs)}`;

    try {
      const current = await this.redis.incr(windowKey);

      if (current === 1) {
        await this.redis.expire(windowKey, Math.ceil(this.windowMs / 1000));
      }

      const resetTime = Math.ceil(now / this.windowMs) * this.windowMs;

      return {
        allowed: current <= this.maxRequests,
        current,
        limit: this.maxRequests,
        resetTime,
      };
    } catch (error) {
      logger.error({ error, key }, 'Redis rate limiter error, allowing request');
      return {
        allowed: true,
        current: 0,
        limit: this.maxRequests,
        resetTime: now + this.windowMs,
      };
    }
  }

  /**
   * Express middleware
   */
  middleware() {
    return async (req: any, res: any, next: any) => {
      const key = req.ip || req.connection.remoteAddress;
      const result = await this.check(key);

      res.set({
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': Math.max(0, result.limit - result.current).toString(),
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
      });

      if (!result.allowed) {
        logger.warn(
          {
            ip: key,
            path: req.path,
            method: req.method,
            current: result.current,
            limit: result.limit,
          },
          'Rate limit exceeded (Redis)',
        );

        res.status(429).json({
          error: 'Too Many Requests',
          message: 'You have exceeded the rate limit. Please try again later.',
          retryAfter: new Date(result.resetTime).toISOString(),
        });
        return;
      }

      next();
    };
  }
}
