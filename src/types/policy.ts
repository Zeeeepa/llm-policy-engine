/**
 * Core Policy Type Definitions
 * Following the SPARC specification for LLM-Policy-Engine
 */

export enum PolicyStatus {
  ACTIVE = 'active',
  DRAFT = 'draft',
  DEPRECATED = 'deprecated',
}

export enum DecisionType {
  ALLOW = 'allow',
  DENY = 'deny',
  WARN = 'warn',
  MODIFY = 'modify',
}

export enum ConditionOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'ne',
  GREATER_THAN = 'gt',
  GREATER_THAN_OR_EQUAL = 'gte',
  LESS_THAN = 'lt',
  LESS_THAN_OR_EQUAL = 'lte',
  IN = 'in',
  NOT_IN = 'not_in',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  MATCHES = 'matches',
  AND = 'and',
  OR = 'or',
  NOT = 'not',
}

export interface PolicyMetadata {
  id: string;
  name: string;
  description?: string;
  version: string;
  namespace: string;
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  priority?: number;
}

export interface Condition {
  operator: ConditionOperator;
  field?: string;
  value?: any;
  conditions?: Condition[]; // For nested AND/OR/NOT
}

export interface Action {
  decision: DecisionType;
  reason?: string;
  metadata?: Record<string, any>;
  modifications?: Record<string, any>; // For MODIFY decisions
}

export interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  condition: Condition;
  action: Action;
  enabled?: boolean;
}

export interface Policy {
  metadata: PolicyMetadata;
  rules: PolicyRule[];
  status: PolicyStatus;
}

export interface EvaluationContext {
  llm?: {
    provider: string;
    model: string;
    prompt?: string;
    maxTokens?: number;
    temperature?: number;
    functions?: any[];
  };
  user?: {
    id: string;
    email?: string;
    roles?: string[];
    permissions?: string[];
  };
  team?: {
    id: string;
    name?: string;
    tier?: string;
  };
  project?: {
    id: string;
    name?: string;
    environment?: string;
  };
  request?: {
    id: string;
    timestamp: number;
    ipAddress?: string;
    userAgent?: string;
  };
  metadata?: Record<string, any>;
}

export interface PolicyDecision {
  decision: DecisionType;
  allowed: boolean;
  reason?: string;
  matchedPolicies: string[];
  matchedRules: string[];
  evaluationTimeMs: number;
  modifications?: Record<string, any>;
  metadata?: Record<string, any>;
  trace?: EvaluationTrace;
}

export interface EvaluationTrace {
  policyId: string;
  ruleId: string;
  conditionEvaluations: ConditionEvaluation[];
  finalDecision: DecisionType;
  timestamp: number;
}

export interface ConditionEvaluation {
  condition: Condition;
  result: boolean;
  evaluationTimeMs: number;
  details?: string;
}

export interface PolicyEvaluationRequest {
  requestId: string;
  context: EvaluationContext;
  policies?: string[]; // Optional: specific policies to evaluate
  dryRun?: boolean;
  trace?: boolean;
}

export interface PolicyEvaluationResponse {
  requestId: string;
  decision: PolicyDecision;
  timestamp: number;
  cached?: boolean;
}

export interface CostEstimate {
  provider: string;
  model: string;
  estimatedTokens: number;
  estimatedCost: number;
  currency: string;
}

export interface SecurityViolation {
  type: 'prompt_injection' | 'pii_leakage' | 'data_exfiltration' | 'toxic_content';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  location?: string;
}
