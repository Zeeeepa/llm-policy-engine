/**
 * Custom Error Classes
 */

export class PolicyEngineError extends Error {
  constructor(
    message: string,
    public code: string = 'POLICY_ENGINE_ERROR',
    public statusCode: number = 500,
    public details?: any,
  ) {
    super(message);
    this.name = 'PolicyEngineError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class PolicyParseError extends PolicyEngineError {
  constructor(message: string, details?: any) {
    super(message, 'POLICY_PARSE_ERROR', 400, details);
    this.name = 'PolicyParseError';
  }
}

export class PolicyValidationError extends PolicyEngineError {
  constructor(message: string, details?: any) {
    super(message, 'POLICY_VALIDATION_ERROR', 400, details);
    this.name = 'PolicyValidationError';
  }
}

export class PolicyEvaluationError extends PolicyEngineError {
  constructor(message: string, details?: any) {
    super(message, 'POLICY_EVALUATION_ERROR', 500, details);
    this.name = 'PolicyEvaluationError';
  }
}

export class PolicyNotFoundError extends PolicyEngineError {
  constructor(policyId: string) {
    super(`Policy not found: ${policyId}`, 'POLICY_NOT_FOUND', 404, { policyId });
    this.name = 'PolicyNotFoundError';
  }
}

export class CacheError extends PolicyEngineError {
  constructor(message: string, details?: any) {
    super(message, 'CACHE_ERROR', 500, details);
    this.name = 'CacheError';
  }
}

export class DatabaseError extends PolicyEngineError {
  constructor(message: string, details?: any) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class AuthenticationError extends PolicyEngineError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends PolicyEngineError {
  constructor(message: string = 'Unauthorized access') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class RateLimitError extends PolicyEngineError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_ERROR', 429);
    this.name = 'RateLimitError';
  }
}
