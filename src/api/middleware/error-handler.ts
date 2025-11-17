/**
 * Error Handling Middleware
 * Centralized error handling for Express
 */
import { Request, Response, NextFunction } from 'express';
import { PolicyEngineError } from '@utils/errors';
import logger from '@utils/logger';

/**
 * Global error handler
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Log error
  logger.error(
    {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      request: {
        method: req.method,
        path: req.path,
        query: req.query,
        body: req.body,
        ip: req.ip,
      },
    },
    'Request error',
  );

  // Handle PolicyEngineError
  if (error instanceof PolicyEngineError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: error.message,
    });
    return;
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Invalid authentication token',
    });
    return;
  }

  if (error.name === 'TokenExpiredError') {
    res.status(401).json({
      error: 'TOKEN_EXPIRED',
      message: 'Authentication token has expired',
    });
    return;
  }

  // Handle syntax errors (invalid JSON)
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      error: 'INVALID_JSON',
      message: 'Invalid JSON in request body',
    });
    return;
  }

  // Default to 500 Internal Server Error
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  logger.debug(
    {
      method: req.method,
      path: req.path,
      ip: req.ip,
    },
    'Route not found',
  );

  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  });
};

/**
 * Async handler wrapper to catch async errors
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Request timeout handler
 */
export const timeoutHandler = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      logger.warn(
        {
          method: req.method,
          path: req.path,
          timeout: timeoutMs,
        },
        'Request timeout',
      );

      if (!res.headersSent) {
        res.status(408).json({
          error: 'REQUEST_TIMEOUT',
          message: 'Request timed out',
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
};
