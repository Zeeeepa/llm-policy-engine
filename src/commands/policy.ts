/**
 * Policy Command Module
 * Handles policy CRUD operations with executive synthesis integration
 */

import { readFileSync } from 'fs';
import { PolicyRepository } from '@db/models/policy-repository';
import { YAMLParser } from '@core/parser/yaml-parser';
import { JSONParser } from '@core/parser/json-parser';
import { SchemaValidator } from '@core/validator/schema-validator';
import { Policy, PolicyStatus, DecisionType } from '../types/policy';
import {
  ExecutiveSummary,
  PolicyCreateResult,
  PolicyEditResult,
  PolicyToggleResult,
  PolicyDeleteResult,
  buildPolicyCreateSynthesis,
  buildPolicyEditSynthesis,
  buildPolicyToggleSynthesis,
  buildExecutiveSummary,
  elevateRiskForProduction,
  extractBlockingIssues,
  isProductionTarget,
  calculateSuccessRate,
} from '../synthesis';

const policyRepository = new PolicyRepository();
const yamlParser = new YAMLParser();
const jsonParser = new JSONParser();
const validator = new SchemaValidator();

/**
 * Determine the environment from policy namespace or metadata
 */
function determineEnvironment(policy: Policy): string {
  const namespace = policy.metadata.namespace.toLowerCase();

  if (namespace.includes('prod') || namespace.includes('production')) {
    return 'production';
  }
  if (namespace.includes('staging') || namespace.includes('stage')) {
    return 'staging';
  }
  if (namespace.includes('dev') || namespace.includes('development')) {
    return 'development';
  }
  if (namespace.includes('test')) {
    return 'test';
  }

  // Policies affect all environments by default
  return 'production';
}

/**
 * Parse a policy file (YAML or JSON)
 */
function parsePolicy(filePath: string): Policy {
  const content = readFileSync(filePath, 'utf-8');
  const isYaml = filePath.endsWith('.yaml') || filePath.endsWith('.yml');
  return isYaml ? yamlParser.parse(content) : jsonParser.parse(content);
}

/**
 * Create a new policy
 */
export async function createPolicy(
  filePath: string,
  createdBy?: string,
): Promise<PolicyCreateResult> {
  const policy = parsePolicy(filePath);
  const validation = validator.validate(policy);

  let created: Policy | null = null;
  let success = false;

  if (validation.valid) {
    created = await policyRepository.create(policy, createdBy);
    success = true;
  }

  const synthesis = buildPolicyCreateSynthesis(
    created || policy,
    validation.errors,
    success,
  );

  // Elevate risk for production targets
  if (isProductionTarget(policy.metadata.namespace)) {
    elevateRiskForProduction(synthesis);
  }

  return {
    policy_id: created?.metadata.id || policy.metadata.id,
    version: created?.metadata.version || policy.metadata.version,
    status: created?.status || policy.status,
    rules_count: policy.rules.length,
    validation_errors: validation.errors,
    synthesis,
  };
}

/**
 * Update an existing policy
 */
export async function updatePolicy(
  policyId: string,
  filePath: string,
): Promise<PolicyEditResult> {
  const existingPolicy = await policyRepository.findById(policyId);
  if (!existingPolicy) {
    throw new Error(`Policy not found: ${policyId}`);
  }

  const updates = parsePolicy(filePath);
  const validation = validator.validate(updates);

  let updated: Policy | null = null;
  let success = false;
  const changesApplied: string[] = [];

  if (validation.valid) {
    updated = await policyRepository.update(policyId, updates);
    success = true;

    // Track what changed
    if (updates.rules) {
      changesApplied.push('rules');
    }
    if (updates.metadata) {
      changesApplied.push('metadata');
    }
    if (updates.status) {
      changesApplied.push('status');
    }
  }

  const synthesis = buildPolicyEditSynthesis(
    updated || updates,
    validation.errors,
    success,
  );

  if (isProductionTarget((updated || updates).metadata.namespace)) {
    elevateRiskForProduction(synthesis);
  }

  return {
    policy_id: policyId,
    version: updated?.metadata.version || updates.metadata?.version || existingPolicy.metadata.version,
    previous_version: existingPolicy.metadata.version,
    changes_applied: changesApplied,
    validation_errors: validation.errors,
    synthesis,
  };
}

/**
 * Toggle policy status (enable/disable/deprecate)
 */
export async function togglePolicyStatus(
  policyId: string,
  newStatus: PolicyStatus,
): Promise<PolicyToggleResult> {
  const existingPolicy = await policyRepository.findById(policyId);
  if (!existingPolicy) {
    throw new Error(`Policy not found: ${policyId}`);
  }

  const previousStatus = existingPolicy.status;
  const updated = await policyRepository.update(policyId, { status: newStatus });

  const synthesis = buildPolicyToggleSynthesis(
    updated,
    previousStatus,
    newStatus,
  );

  if (isProductionTarget(updated.metadata.namespace)) {
    elevateRiskForProduction(synthesis);
  }

  return {
    policy_id: policyId,
    previous_status: previousStatus,
    new_status: newStatus,
    affected_rules: updated.rules.filter(r => r.enabled !== false).length,
    synthesis,
  };
}

/**
 * Delete a policy
 */
export async function deletePolicy(policyId: string): Promise<PolicyDeleteResult> {
  const existingPolicy = await policyRepository.findById(policyId);
  if (!existingPolicy) {
    throw new Error(`Policy not found: ${policyId}`);
  }

  await policyRepository.delete(policyId);

  const synthesis = buildExecutiveSummary(
    {
      environment: determineEnvironment(existingPolicy),
      timestamp: new Date().toISOString(),
      version: existingPolicy.metadata.version,
      commit_sha: process.env['GIT_SHA'],
    },
    {
      success_rate: 1.0,
      failed_iterations: 0,
      blocking_issues: [],
    },
    ['policy lookup', 'deletion', 'cache invalidation'],
  );

  // Deleting production policies is high risk
  if (isProductionTarget(existingPolicy.metadata.namespace)) {
    synthesis.risk_level = 'high';
    synthesis.recommendation = 'DEFER';
    synthesis.rationale = `[Production Policy Deletion] Policy ${existingPolicy.metadata.name} removed from production environment`;
  }

  return {
    policy_id: policyId,
    deleted: true,
    synthesis,
  };
}

/**
 * Validate a policy without persisting
 */
export async function validatePolicy(filePath: string): Promise<{
  valid: boolean;
  policy: Policy;
  errors: string[];
  synthesis: ExecutiveSummary;
}> {
  const policy = parsePolicy(filePath);
  const validation = validator.validate(policy);

  const blockingIssues = extractBlockingIssues(policy, validation.errors);

  const synthesis = buildExecutiveSummary(
    {
      environment: determineEnvironment(policy),
      timestamp: new Date().toISOString(),
      version: policy.metadata.version,
      commit_sha: process.env['GIT_SHA'],
    },
    {
      success_rate: calculateSuccessRate(validation.errors, policy.rules.length),
      failed_iterations: validation.errors.length,
      blocking_issues: blockingIssues,
    },
    ['policy parsing', 'schema validation', 'rule validation'],
  );

  return {
    valid: validation.valid,
    policy,
    errors: validation.errors,
    synthesis,
  };
}

/**
 * Get policy with synthesis analysis
 */
export async function analyzePolicy(policyId: string): Promise<{
  policy: Policy;
  synthesis: ExecutiveSummary;
}> {
  const policy = await policyRepository.findById(policyId);
  if (!policy) {
    throw new Error(`Policy not found: ${policyId}`);
  }

  const validation = validator.validate(policy);
  const blockingIssues = extractBlockingIssues(policy, validation.errors);

  const synthesis = buildExecutiveSummary(
    {
      environment: determineEnvironment(policy),
      timestamp: new Date().toISOString(),
      version: policy.metadata.version,
    },
    {
      success_rate: validation.valid ? 1.0 : calculateSuccessRate(validation.errors, policy.rules.length),
      failed_iterations: validation.errors.length,
      blocking_issues: blockingIssues,
    },
    ['policy retrieval', 'validation', 'analysis'],
  );

  // Add security risk analysis
  const securityRisks = analyzeSecurityRisks(policy);
  if (securityRisks.length > 0) {
    synthesis.iteration_metrics.blocking_issues.push(...securityRisks);
    if (securityRisks.some(r => r.severity === 'critical')) {
      synthesis.risk_level = 'critical';
      synthesis.recommendation = 'REJECT';
    } else if (securityRisks.some(r => r.severity === 'high')) {
      synthesis.risk_level = 'high';
      synthesis.recommendation = 'DEFER';
    }
    synthesis.rationale = `Security risks detected: ${securityRisks.length}. ${synthesis.rationale}`;
  }

  return {
    policy,
    synthesis,
  };
}

/**
 * Analyze security risks in a policy
 */
function analyzeSecurityRisks(policy: Policy): Array<{
  type: 'security_risk';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  rule_id?: string;
}> {
  const risks: Array<{
    type: 'security_risk';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    rule_id?: string;
  }> = [];

  for (const rule of policy.rules) {
    // Check for overly permissive rules
    if (rule.action.decision === DecisionType.ALLOW) {
      if (!rule.condition.field && !rule.condition.conditions) {
        risks.push({
          type: 'security_risk',
          severity: 'high',
          description: `Rule ${rule.name} allows all without conditions`,
          rule_id: rule.id,
        });
      }
    }

    // Check for disabled security rules
    if (rule.enabled === false && rule.action.decision === DecisionType.DENY) {
      risks.push({
        type: 'security_risk',
        severity: 'medium',
        description: `Security deny rule ${rule.name} is disabled`,
        rule_id: rule.id,
      });
    }
  }

  return risks;
}

export default {
  createPolicy,
  updatePolicy,
  togglePolicyStatus,
  deletePolicy,
  validatePolicy,
  analyzePolicy,
};
