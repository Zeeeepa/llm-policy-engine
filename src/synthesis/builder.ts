/**
 * Executive Synthesis Builder
 * Builds executive summaries for policy operations
 */

import {
  ExecutiveSummary,
  DeployReference,
  IterationMetrics,
  RiskLevel,
  Recommendation,
  BlockingIssue,
  DecisionPacket,
  ConflictAnalysis,
  PolicyConflict,
  EnforcementImpact,
  RollbackInstructions,
  ViolationPrediction,
} from './types';
import { Policy, PolicyRule, DecisionType, PolicyStatus } from '../types/policy';

/**
 * Build an executive summary for policy operations
 */
export function buildExecutiveSummary(
  deployRef: Partial<DeployReference>,
  metrics: Partial<IterationMetrics>,
  stepsExecuted: string[],
): ExecutiveSummary {
  const deploy_reference: DeployReference = {
    environment: deployRef.environment || 'production',
    timestamp: deployRef.timestamp || new Date().toISOString(),
    version: deployRef.version,
    commit_sha: deployRef.commit_sha,
  };

  const iteration_metrics: IterationMetrics = {
    success_rate: metrics.success_rate ?? 1.0,
    failed_iterations: metrics.failed_iterations ?? 0,
    blocking_issues: metrics.blocking_issues ?? [],
    steps_executed: stepsExecuted,
  };

  const risk_level = calculateRiskLevel(iteration_metrics);
  const recommendation = determineRecommendation(iteration_metrics, risk_level);
  const rationale = buildRationale(iteration_metrics, risk_level, recommendation);

  return {
    deploy_reference,
    iteration_metrics,
    risk_level,
    recommendation,
    rationale,
  };
}

/**
 * Elevate risk level for production environments
 */
export function elevateRiskForProduction(summary: ExecutiveSummary): void {
  if (summary.deploy_reference.environment === 'production') {
    if (summary.risk_level === 'low') {
      summary.risk_level = 'medium';
    } else if (summary.risk_level === 'medium') {
      summary.risk_level = 'high';
    }
    summary.rationale = `[Production Environment] ${summary.rationale}`;
  }
}

/**
 * Elevate risk for security and compliance policy types
 */
export function elevateRiskForPolicyType(
  summary: ExecutiveSummary,
  policyType: string | undefined,
): void {
  if (policyType === 'security' || policyType === 'compliance') {
    if (summary.risk_level === 'low') {
      summary.risk_level = 'high';
    } else if (summary.risk_level === 'medium') {
      summary.risk_level = 'high';
    }
    summary.rationale = `[${policyType.charAt(0).toUpperCase() + policyType.slice(1)} Policy] ${summary.rationale}`;
  }
}

/**
 * Elevate risk when enabling a policy (vs creating draft)
 */
export function elevateRiskForEnabling(summary: ExecutiveSummary): void {
  if (summary.risk_level === 'low') {
    summary.risk_level = 'medium';
  } else if (summary.risk_level === 'medium') {
    summary.risk_level = 'high';
  }
  summary.rationale = `[Enabling Policy] ${summary.rationale}`;
}

/**
 * Extract blocking issues from policy validation
 */
export function extractBlockingIssues(policy: Policy, validationErrors: string[]): BlockingIssue[] {
  const issues: BlockingIssue[] = [];

  // Check for validation errors
  for (const error of validationErrors) {
    issues.push({
      type: 'validation_error',
      severity: 'high',
      description: error,
    });
  }

  // Check for deny actions on critical resources
  for (const rule of policy.rules) {
    if (rule.action.decision === DecisionType.DENY) {
      const isCritical = isCriticalResource(rule);
      if (isCritical) {
        issues.push({
          type: 'deny_action',
          severity: 'critical',
          description: `Deny action on critical resource in rule: ${rule.name}`,
          rule_id: rule.id,
        });
      }
    }
  }

  // Check for conflicting rule priorities
  const priorityConflicts = findPriorityConflicts(policy.rules);
  for (const conflict of priorityConflicts) {
    issues.push({
      type: 'conflicting_priorities',
      severity: 'high',
      description: conflict.description,
      rule_id: conflict.rule_ids.join(', '),
    });
  }

  // Check for missing required conditions
  for (const rule of policy.rules) {
    if (!hasRequiredConditions(rule)) {
      issues.push({
        type: 'missing_conditions',
        severity: 'medium',
        description: `Rule ${rule.name} is missing required conditions`,
        rule_id: rule.id,
      });
    }
  }

  return issues;
}

/**
 * Build synthesis for policy creation
 */
export function buildPolicyCreateSynthesis(
  policy: Policy,
  validationErrors: string[],
  success: boolean,
): ExecutiveSummary {
  const blockingIssues = extractBlockingIssues(policy, validationErrors);

  const synthesis = buildExecutiveSummary(
    {
      environment: 'production',
      timestamp: new Date().toISOString(),
      version: policy.metadata.version,
      commit_sha: process.env['GIT_SHA'],
    },
    {
      success_rate: success ? 1.0 : 0.0,
      failed_iterations: validationErrors.length,
      blocking_issues: blockingIssues,
    },
    ['policy validation', 'rule parsing', 'persistence'],
  );

  // Apply policy type risk elevation
  const policyType = getPolicyType(policy);
  elevateRiskForPolicyType(synthesis, policyType);

  // Determine recommendation based on status and issues
  synthesis.recommendation = determinePolicyRecommendation(policy, blockingIssues);
  synthesis.rationale = buildPolicyRationale(policy, blockingIssues, synthesis.recommendation);

  return synthesis;
}

/**
 * Build synthesis for policy edit
 */
export function buildPolicyEditSynthesis(
  policy: Policy,
  validationErrors: string[],
  success: boolean,
): ExecutiveSummary {
  const blockingIssues = extractBlockingIssues(policy, validationErrors);

  const synthesis = buildExecutiveSummary(
    {
      environment: 'production',
      timestamp: new Date().toISOString(),
      version: policy.metadata.version,
      commit_sha: process.env['GIT_SHA'],
    },
    {
      success_rate: success ? 1.0 : 0.0,
      failed_iterations: validationErrors.length,
      blocking_issues: blockingIssues,
    },
    ['policy validation', 'rule parsing', 'update', 'persistence'],
  );

  const policyType = getPolicyType(policy);
  elevateRiskForPolicyType(synthesis, policyType);

  synthesis.recommendation = determinePolicyRecommendation(policy, blockingIssues);
  synthesis.rationale = buildPolicyRationale(policy, blockingIssues, synthesis.recommendation);

  return synthesis;
}

/**
 * Build synthesis for policy status toggle
 */
export function buildPolicyToggleSynthesis(
  policy: Policy,
  previousStatus: PolicyStatus,
  newStatus: PolicyStatus,
): ExecutiveSummary {
  const isEnabling = newStatus === PolicyStatus.ACTIVE && previousStatus !== PolicyStatus.ACTIVE;
  const blockingIssues: BlockingIssue[] = [];

  const synthesis = buildExecutiveSummary(
    {
      environment: 'production',
      timestamp: new Date().toISOString(),
      version: policy.metadata.version,
      commit_sha: process.env['GIT_SHA'],
    },
    {
      success_rate: 1.0,
      failed_iterations: 0,
      blocking_issues: blockingIssues,
    },
    ['status validation', 'policy toggle', 'persistence'],
  );

  const policyType = getPolicyType(policy);
  elevateRiskForPolicyType(synthesis, policyType);

  // Enabling a policy has higher risk
  if (isEnabling) {
    elevateRiskForEnabling(synthesis);

    // Security policies require review when enabling
    if (policyType === 'security') {
      synthesis.recommendation = 'DEFER';
      synthesis.rationale = `Enabling security policy requires additional review. Policy: ${policy.metadata.name}`;
    } else {
      synthesis.recommendation = 'APPROVE';
      synthesis.rationale = `Policy ${policy.metadata.name} is being enabled. All rules validated.`;
    }
  } else {
    synthesis.recommendation = 'APPROVE';
    synthesis.rationale = `Policy status changed from ${previousStatus} to ${newStatus}`;
  }

  return synthesis;
}

/**
 * Calculate success rate based on validation results
 */
export function calculateSuccessRate(validationErrors: string[], totalRules: number): number {
  if (totalRules === 0) return 1.0;
  const invalidRules = validationErrors.length;
  return Math.max(0, (totalRules - invalidRules) / totalRules);
}

/**
 * Determine if this is a production target
 */
export function isProductionTarget(namespace: string | undefined): boolean {
  if (!namespace) return true;
  const prodIndicators = ['prod', 'production', 'live', 'main'];
  return prodIndicators.some(indicator =>
    namespace.toLowerCase().includes(indicator)
  );
}

// --- Private helper functions ---

function calculateRiskLevel(metrics: IterationMetrics): RiskLevel {
  const criticalIssues = metrics.blocking_issues.filter(i => i.severity === 'critical').length;
  const highIssues = metrics.blocking_issues.filter(i => i.severity === 'high').length;

  if (criticalIssues > 0) return 'critical';
  if (highIssues > 0 || metrics.success_rate < 0.5) return 'high';
  if (metrics.failed_iterations > 0 || metrics.success_rate < 0.8) return 'medium';
  return 'low';
}

function determineRecommendation(metrics: IterationMetrics, riskLevel: RiskLevel): Recommendation {
  if (riskLevel === 'critical') return 'REJECT';
  if (riskLevel === 'high') return 'DEFER';
  if (metrics.failed_iterations > 0) return 'DEFER';
  return 'APPROVE';
}

function determinePolicyRecommendation(policy: Policy, blockingIssues: BlockingIssue[]): Recommendation {
  const criticalIssues = blockingIssues.filter(i => i.severity === 'critical');
  const highIssues = blockingIssues.filter(i => i.severity === 'high');

  // Invalid rules -> REJECT
  if (criticalIssues.length > 0) return 'REJECT';
  if (highIssues.length > 0) return 'REJECT';

  // Draft status with valid rules -> APPROVE
  if (policy.status === PolicyStatus.DRAFT) return 'APPROVE';

  // Enabling security policy -> DEFER
  const policyType = getPolicyType(policy);
  if (policyType === 'security' && policy.status === PolicyStatus.ACTIVE) {
    return 'DEFER';
  }

  return 'APPROVE';
}

function buildRationale(
  metrics: IterationMetrics,
  riskLevel: RiskLevel,
  _recommendation: Recommendation,
): string {
  const parts: string[] = [];

  parts.push(`Risk level: ${riskLevel}`);
  parts.push(`Success rate: ${(metrics.success_rate * 100).toFixed(1)}%`);

  if (metrics.blocking_issues.length > 0) {
    parts.push(`Blocking issues: ${metrics.blocking_issues.length}`);
  }

  parts.push(`Steps executed: ${metrics.steps_executed.join(', ')}`);

  return parts.join('. ');
}

function buildPolicyRationale(
  policy: Policy,
  blockingIssues: BlockingIssue[],
  recommendation: Recommendation,
): string {
  const parts: string[] = [];

  parts.push(`Policy: ${policy.metadata.name} (v${policy.metadata.version})`);
  parts.push(`Status: ${policy.status}`);
  parts.push(`Rules: ${policy.rules.length}`);

  if (blockingIssues.length > 0) {
    parts.push(`Issues: ${blockingIssues.length} (${blockingIssues.map(i => i.type).join(', ')})`);
  }

  parts.push(`Recommendation: ${recommendation}`);

  return parts.join('. ');
}

function getPolicyType(policy: Policy): string | undefined {
  // Check tags for policy type
  const tags = policy.metadata.tags || [];
  if (tags.includes('security')) return 'security';
  if (tags.includes('compliance')) return 'compliance';

  // Check namespace for type hints
  const namespace = policy.metadata.namespace.toLowerCase();
  if (namespace.includes('security') || namespace.includes('sec')) return 'security';
  if (namespace.includes('compliance') || namespace.includes('audit')) return 'compliance';

  // Check rule actions for security patterns
  const hasDenyRules = policy.rules.some(r => r.action.decision === DecisionType.DENY);
  if (hasDenyRules) return 'security';

  return undefined;
}

function isCriticalResource(rule: PolicyRule): boolean {
  const criticalPatterns = [
    'admin', 'root', 'system', 'database', 'credentials',
    'secret', 'key', 'token', 'password', 'auth',
  ];

  const ruleName = rule.name.toLowerCase();
  const ruleDesc = (rule.description || '').toLowerCase();

  return criticalPatterns.some(pattern =>
    ruleName.includes(pattern) || ruleDesc.includes(pattern)
  );
}

interface PriorityConflict {
  rule_ids: string[];
  description: string;
}

function findPriorityConflicts(rules: PolicyRule[]): PriorityConflict[] {
  const conflicts: PriorityConflict[] = [];

  // Group rules by their condition field (simplified conflict detection)
  const rulesByField = new Map<string, PolicyRule[]>();

  for (const rule of rules) {
    if (rule.condition.field) {
      const field = rule.condition.field;
      if (!rulesByField.has(field)) {
        rulesByField.set(field, []);
      }
      rulesByField.get(field)!.push(rule);
    }
  }

  // Check for conflicting decisions on same field
  for (const [field, fieldRules] of rulesByField) {
    if (fieldRules.length > 1) {
      const decisions = new Set(fieldRules.map(r => r.action.decision));
      if (decisions.has(DecisionType.ALLOW) && decisions.has(DecisionType.DENY)) {
        conflicts.push({
          rule_ids: fieldRules.map(r => r.id),
          description: `Conflicting ALLOW and DENY decisions on field: ${field}`,
        });
      }
    }
  }

  return conflicts;
}

function hasRequiredConditions(rule: PolicyRule): boolean {
  // A valid rule must have a condition with either a field or nested conditions
  if (!rule.condition) return false;
  if (rule.condition.field) return true;
  if (rule.condition.conditions && rule.condition.conditions.length > 0) return true;
  return false;
}

// --- Decision Packet Builders ---

/**
 * Build a complete Decision Packet for policy operations
 */
export function buildDecisionPacket(
  policy: Policy,
  existingPolicies: Policy[] = [],
  options: {
    includeRollback?: boolean;
    previousStatus?: PolicyStatus;
    operationType?: 'create' | 'edit' | 'enable' | 'disable' | 'dry-run';
  } = {},
): DecisionPacket {
  const conflictAnalysis = buildConflictAnalysis(policy, existingPolicies);
  const enforcementImpact = buildEnforcementImpact(policy);
  const affectedResourceCount = calculateAffectedResources(policy, existingPolicies);

  const packet: DecisionPacket = {
    conflict_analysis: conflictAnalysis,
    affected_resource_count: affectedResourceCount,
    enforcement_impact: enforcementImpact,
  };

  // Add rollback instructions for enable/disable operations
  if (options.includeRollback && options.previousStatus !== undefined) {
    packet.rollback_instructions = buildRollbackInstructions(
      policy,
      options.previousStatus,
      options.operationType || 'enable',
    );
  }

  return packet;
}

/**
 * Build conflict analysis for a policy against existing policies
 */
export function buildConflictAnalysis(
  policy: Policy,
  existingPolicies: Policy[] = [],
): ConflictAnalysis {
  const conflicts: PolicyConflict[] = [];

  // Internal conflicts within the policy
  const internalConflicts = findPriorityConflicts(policy.rules);
  for (const conflict of internalConflicts) {
    conflicts.push({
      rule_a_id: conflict.rule_ids[0],
      rule_b_id: conflict.rule_ids[1] || conflict.rule_ids[0],
      conflict_type: 'decision',
      description: conflict.description,
      severity: 'high',
      resolution: 'Review rule priorities and ensure consistent decision logic',
    });
  }

  // Cross-policy conflicts
  for (const existingPolicy of existingPolicies) {
    if (existingPolicy.metadata.id === policy.metadata.id) continue;
    if (existingPolicy.status !== PolicyStatus.ACTIVE) continue;

    // Check for namespace overlap with conflicting decisions
    if (existingPolicy.metadata.namespace === policy.metadata.namespace) {
      const crossConflicts = findCrossPolicyConflicts(policy, existingPolicy);
      conflicts.push(...crossConflicts);
    }
  }

  const maxSeverity = conflicts.length > 0
    ? conflicts.reduce((max, c) =>
        severityOrder(c.severity) > severityOrder(max) ? c.severity : max,
        'low' as RiskLevel
      )
    : 'low';

  return {
    has_conflicts: conflicts.length > 0,
    conflicts,
    max_severity: maxSeverity,
    summary: conflicts.length > 0
      ? `Found ${conflicts.length} conflict(s): ${conflicts.map(c => c.conflict_type).join(', ')}`
      : 'No conflicts detected',
  };
}

/**
 * Build enforcement impact projection for a policy
 */
export function buildEnforcementImpact(policy: Policy): EnforcementImpact {
  // Analyze rules to project impact
  const denyRules = policy.rules.filter(r => r.action.decision === DecisionType.DENY && r.enabled !== false);
  const warnRules = policy.rules.filter(r => r.action.decision === DecisionType.WARN && r.enabled !== false);
  const modifyRules = policy.rules.filter(r => r.action.decision === DecisionType.MODIFY && r.enabled !== false);
  // Note: allowRules can be derived if needed for future analysis but not currently used

  // Estimate impact based on rule types and criticality
  const criticalDenyRules = denyRules.filter(r => isCriticalResource(r));

  // Base predictions on rule analysis (would be enhanced with real traffic data)
  const baseRate = 1000; // hypothetical requests per hour baseline
  const denyRate = denyRules.length > 0 ? Math.min(denyRules.length * 50, baseRate * 0.3) : 0;
  const warnRate = warnRules.length > 0 ? Math.min(warnRules.length * 100, baseRate * 0.2) : 0;
  const modifyRate = modifyRules.length > 0 ? Math.min(modifyRules.length * 75, baseRate * 0.15) : 0;

  // Determine impact level
  let impactLevel: 'minimal' | 'moderate' | 'significant' | 'critical';
  if (criticalDenyRules.length > 0 || denyRules.length > 5) {
    impactLevel = 'critical';
  } else if (denyRules.length > 2 || (denyRate / baseRate) > 0.2) {
    impactLevel = 'significant';
  } else if (denyRules.length > 0 || warnRules.length > 3) {
    impactLevel = 'moderate';
  } else {
    impactLevel = 'minimal';
  }

  // Calculate confidence based on rule specificity
  const hasSpecificConditions = policy.rules.every(r => hasRequiredConditions(r));
  const confidence = hasSpecificConditions ? 0.75 : 0.5;

  return {
    allowed_predictions: Math.round(baseRate - denyRate - warnRate - modifyRate),
    denied_predictions: Math.round(denyRate),
    warned_predictions: Math.round(warnRate),
    modified_predictions: Math.round(modifyRate),
    confidence,
    impact_level: impactLevel,
    description: buildImpactDescription(impactLevel, denyRules.length, warnRules.length, modifyRules.length),
  };
}

/**
 * Build rollback instructions for enable/disable operations
 */
export function buildRollbackInstructions(
  policy: Policy,
  previousStatus: PolicyStatus,
  operationType: string,
): RollbackInstructions {
  const policyId = policy.metadata.id;
  const policyType = getPolicyType(policy);

  // Determine appropriate rollback command
  let rollbackCommand: string;
  if (operationType === 'enable') {
    rollbackCommand = `agentics policy disable ${policyId}`;
  } else if (operationType === 'disable') {
    rollbackCommand = `agentics policy enable ${policyId}`;
  } else {
    rollbackCommand = `agentics policy edit ${policyId} --status ${previousStatus}`;
  }

  // Build verification steps
  const verificationSteps = [
    `Verify policy status: agentics policy inspect ${policyId}`,
    'Review recent evaluation logs for affected requests',
    'Check system health metrics for anomalies',
    'Confirm no pending requests are blocked unexpectedly',
  ];

  // Calculate safe rollback window based on policy type
  let safeRollbackWindow: string;
  if (policyType === 'security') {
    safeRollbackWindow = '5 minutes';
  } else if (policyType === 'compliance') {
    safeRollbackWindow = '15 minutes';
  } else {
    safeRollbackWindow = '30 minutes';
  }

  // Build warnings
  const warnings: string[] = [];
  if (policyType === 'security') {
    warnings.push('Rolling back security policies may expose vulnerabilities');
  }
  if (policy.status === PolicyStatus.ACTIVE) {
    warnings.push('Active policies may have cached evaluations that persist after rollback');
  }
  if (policy.rules.filter(r => r.action.decision === DecisionType.DENY).length > 0) {
    warnings.push('Rollback will re-enable/disable DENY rules which may affect blocked requests');
  }

  return {
    previous_status: previousStatus,
    rollback_command: rollbackCommand,
    verification_steps: verificationSteps,
    safe_rollback_window: safeRollbackWindow,
    warnings,
  };
}

/**
 * Build violation predictions for dry-run analysis
 */
export function buildViolationPredictions(policy: Policy): ViolationPrediction[] {
  const predictions: ViolationPrediction[] = [];

  for (const rule of policy.rules) {
    if (rule.enabled === false) continue;

    // Only predict for non-ALLOW decisions
    if (rule.action.decision === DecisionType.ALLOW) continue;

    const predictedAction = mapDecisionToAction(rule.action.decision);
    const riskLevel = assessRuleRisk(rule);
    const frequency = estimateViolationFrequency(rule);

    predictions.push({
      rule_id: rule.id,
      rule_name: rule.name,
      predicted_action: predictedAction,
      estimated_frequency: frequency,
      estimated_affected_requests_per_hour: estimateAffectedRequests(frequency),
      sample_trigger_conditions: buildSampleConditions(rule),
      risk_level: riskLevel,
    });
  }

  // Sort by risk level (critical first)
  predictions.sort((a, b) => severityOrder(b.risk_level) - severityOrder(a.risk_level));

  return predictions;
}

/**
 * Build synthesis for policy dry-run operation
 */
export function buildPolicyDryRunSynthesis(
  policy: Policy,
  validationErrors: string[],
  existingPolicies: Policy[] = [],
): {
  canApply: boolean;
  violationPredictions: ViolationPrediction[];
  decisionPacket: DecisionPacket;
  synthesis: ExecutiveSummary;
} {
  const canApply = validationErrors.length === 0;
  const violationPredictions = buildViolationPredictions(policy);
  const decisionPacket = buildDecisionPacket(policy, existingPolicies, {
    operationType: 'dry-run',
  });

  const blockingIssues = extractBlockingIssues(policy, validationErrors);

  // Add conflict issues to blocking issues
  for (const conflict of decisionPacket.conflict_analysis.conflicts) {
    if (conflict.severity === 'high' || conflict.severity === 'critical') {
      blockingIssues.push({
        type: 'conflicting_priorities',
        severity: conflict.severity,
        description: conflict.description,
        rule_id: conflict.rule_a_id,
      });
    }
  }

  const synthesis = buildExecutiveSummary(
    {
      environment: 'dry-run',
      timestamp: new Date().toISOString(),
      version: policy.metadata.version,
      commit_sha: process.env['GIT_SHA'],
    },
    {
      success_rate: canApply ? 1.0 : 0.0,
      failed_iterations: validationErrors.length,
      blocking_issues: blockingIssues,
    },
    ['policy parsing', 'schema validation', 'conflict analysis', 'impact projection'],
  );

  // Adjust recommendation based on dry-run results
  if (!canApply) {
    synthesis.recommendation = 'REJECT';
    synthesis.rationale = `Dry-run failed: ${validationErrors.length} validation error(s). ${synthesis.rationale}`;
  } else if (decisionPacket.conflict_analysis.has_conflicts) {
    synthesis.recommendation = 'DEFER';
    synthesis.rationale = `Dry-run detected ${decisionPacket.conflict_analysis.conflicts.length} conflict(s). Review before applying.`;
  } else if (decisionPacket.enforcement_impact.impact_level === 'critical') {
    synthesis.recommendation = 'DEFER';
    synthesis.rationale = `Dry-run shows critical enforcement impact. ${violationPredictions.length} violation(s) predicted.`;
  } else if (violationPredictions.length > 0) {
    const criticalViolations = violationPredictions.filter(v => v.risk_level === 'critical');
    if (criticalViolations.length > 0) {
      synthesis.recommendation = 'DEFER';
      synthesis.rationale = `Dry-run shows ${criticalViolations.length} critical violation prediction(s).`;
    }
  }

  return {
    canApply,
    violationPredictions,
    decisionPacket,
    synthesis,
  };
}

// --- Additional Helper Functions ---

function findCrossPolicyConflicts(policyA: Policy, policyB: Policy): PolicyConflict[] {
  const conflicts: PolicyConflict[] = [];

  for (const ruleA of policyA.rules) {
    for (const ruleB of policyB.rules) {
      // Check for same field with conflicting decisions
      if (ruleA.condition.field && ruleB.condition.field) {
        if (ruleA.condition.field === ruleB.condition.field) {
          const decisionsConflict = (
            (ruleA.action.decision === DecisionType.ALLOW && ruleB.action.decision === DecisionType.DENY) ||
            (ruleA.action.decision === DecisionType.DENY && ruleB.action.decision === DecisionType.ALLOW)
          );

          if (decisionsConflict) {
            conflicts.push({
              rule_a_id: ruleA.id,
              rule_b_id: ruleB.id,
              conflict_type: 'decision',
              description: `Rule "${ruleA.name}" (${policyA.metadata.name}) conflicts with "${ruleB.name}" (${policyB.metadata.name}) on field "${ruleA.condition.field}"`,
              severity: 'high',
              resolution: 'Review priority ordering or consolidate into single policy',
            });
          }
        }
      }
    }
  }

  return conflicts;
}

function severityOrder(severity: RiskLevel): number {
  const order: Record<RiskLevel, number> = {
    'low': 0,
    'medium': 1,
    'high': 2,
    'critical': 3,
  };
  return order[severity];
}

function calculateAffectedResources(policy: Policy, existingPolicies: Policy[]): number {
  // Calculate resources affected based on namespace scope and rule count
  let baseCount = policy.rules.length * 10; // Base: each rule affects ~10 resource types

  // Broader namespace = more affected resources
  const namespace = policy.metadata.namespace.toLowerCase();
  if (namespace === 'global' || namespace === '*') {
    baseCount *= 5;
  } else if (namespace.includes('prod')) {
    baseCount *= 3;
  }

  // Cross-policy overlap increases affected resources
  const overlappingPolicies = existingPolicies.filter(
    p => p.metadata.namespace === policy.metadata.namespace && p.status === PolicyStatus.ACTIVE
  );
  baseCount += overlappingPolicies.length * 5;

  return Math.round(baseCount);
}

function buildImpactDescription(
  impactLevel: 'minimal' | 'moderate' | 'significant' | 'critical',
  denyCount: number,
  warnCount: number,
  modifyCount: number,
): string {
  const parts: string[] = [];

  if (denyCount > 0) {
    parts.push(`${denyCount} DENY rule(s)`);
  }
  if (warnCount > 0) {
    parts.push(`${warnCount} WARN rule(s)`);
  }
  if (modifyCount > 0) {
    parts.push(`${modifyCount} MODIFY rule(s)`);
  }

  const rulesDesc = parts.length > 0 ? parts.join(', ') : 'no enforcement rules';

  switch (impactLevel) {
    case 'critical':
      return `Critical impact expected: ${rulesDesc} affecting critical resources`;
    case 'significant':
      return `Significant impact expected: ${rulesDesc} will affect substantial traffic`;
    case 'moderate':
      return `Moderate impact expected: ${rulesDesc} with targeted enforcement`;
    case 'minimal':
    default:
      return `Minimal impact expected: ${rulesDesc} with limited scope`;
  }
}

function mapDecisionToAction(decision: DecisionType): 'DENY' | 'WARN' | 'MODIFY' {
  switch (decision) {
    case DecisionType.DENY:
      return 'DENY';
    case DecisionType.WARN:
      return 'WARN';
    case DecisionType.MODIFY:
      return 'MODIFY';
    default:
      return 'WARN';
  }
}

function assessRuleRisk(rule: PolicyRule): RiskLevel {
  // Critical resources always high risk
  if (isCriticalResource(rule)) {
    return rule.action.decision === DecisionType.DENY ? 'critical' : 'high';
  }

  // DENY rules are inherently higher risk
  if (rule.action.decision === DecisionType.DENY) {
    return hasRequiredConditions(rule) ? 'medium' : 'high';
  }

  // MODIFY rules can have unintended consequences
  if (rule.action.decision === DecisionType.MODIFY) {
    return 'medium';
  }

  return 'low';
}

function estimateViolationFrequency(rule: PolicyRule): 'rare' | 'occasional' | 'frequent' | 'very_frequent' {
  // Rules without specific conditions trigger more frequently
  if (!hasRequiredConditions(rule)) {
    return 'very_frequent';
  }

  // Check condition specificity using the actual enum values
  const condition = rule.condition;
  const op = condition.operator;

  // Array-based conditions are typically more targeted
  if (op === 'in' || op === 'not_in') {
    return 'occasional';
  }
  // Regex matches vary widely
  if (op === 'matches') {
    return 'frequent';
  }
  // Exact matches are usually specific
  if (op === 'eq' || op === 'ne') {
    return 'rare';
  }

  return 'occasional';
}

function estimateAffectedRequests(frequency: 'rare' | 'occasional' | 'frequent' | 'very_frequent'): number {
  const rates: Record<string, number> = {
    'rare': 5,
    'occasional': 25,
    'frequent': 100,
    'very_frequent': 500,
  };
  return rates[frequency] || 25;
}

function buildSampleConditions(rule: PolicyRule): string[] {
  const samples: string[] = [];
  const condition = rule.condition;

  if (condition.field && condition.value !== undefined) {
    samples.push(`${condition.field} ${condition.operator} ${JSON.stringify(condition.value)}`);
  }

  if (condition.conditions && condition.conditions.length > 0) {
    const nestedSamples = condition.conditions.slice(0, 2).map(c =>
      `${c.field} ${c.operator} ${JSON.stringify(c.value)}`
    );
    samples.push(...nestedSamples);
  }

  if (samples.length === 0) {
    samples.push('All requests (no specific conditions)');
  }

  return samples;
}
