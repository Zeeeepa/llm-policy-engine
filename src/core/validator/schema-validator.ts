/**
 * Policy Schema Validator using Zod
 */
import { z } from 'zod';
import { Policy } from '../../types/policy';
import { PolicyValidationError } from '@utils/errors';
import logger from '@utils/logger';

// Define Zod schemas for validation
const ConditionSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    operator: z.enum([
      'eq',
      'ne',
      'gt',
      'gte',
      'lt',
      'lte',
      'in',
      'not_in',
      'contains',
      'not_contains',
      'matches',
      'and',
      'or',
      'not',
    ]),
    field: z.string().optional(),
    value: z.any().optional(),
    conditions: z.array(ConditionSchema).optional(),
  }),
);

const ActionSchema = z.object({
  decision: z.enum(['allow', 'deny', 'warn', 'modify']),
  reason: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  modifications: z.record(z.any()).optional(),
});

const PolicyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  condition: ConditionSchema,
  action: ActionSchema,
  enabled: z.boolean().optional(),
});

const PolicyMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string(),
  namespace: z.string(),
  tags: z.array(z.string()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  createdBy: z.string().optional(),
  priority: z.number().optional(),
});

const PolicySchema = z.object({
  metadata: PolicyMetadataSchema,
  rules: z.array(PolicyRuleSchema),
  status: z.enum(['active', 'draft', 'deprecated']),
});

export class SchemaValidator {
  validate(policy: Policy): { valid: boolean; errors: string[] } {
    try {
      PolicySchema.parse(policy);
      logger.debug({ policyId: policy.metadata.id }, 'Policy schema validation passed');
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
        logger.error({ policyId: policy.metadata.id, errors }, 'Policy schema validation failed');
        return { valid: false, errors };
      }
      return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  validateMetadata(metadata: any): void {
    try {
      PolicyMetadataSchema.parse(metadata);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new PolicyValidationError('Metadata validation failed', { errors: error.errors });
      }
      throw error;
    }
  }

  validateRules(rules: any[]): void {
    try {
      z.array(PolicyRuleSchema).parse(rules);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new PolicyValidationError('Rules validation failed', { errors: error.errors });
      }
      throw error;
    }
  }
}
