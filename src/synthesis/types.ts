/**
 * Executive Synthesis Types
 * Types for policy validation executive summaries
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type Recommendation = 'APPROVE' | 'DEFER' | 'REJECT';

export interface DeployReference {
  environment: string;
  timestamp: string;
  version?: string;
  commit_sha?: string;
}

export interface IterationMetrics {
  success_rate: number;
  failed_iterations: number;
  blocking_issues: BlockingIssue[];
  steps_executed: string[];
}

export interface BlockingIssue {
  type: 'deny_action' | 'conflicting_priorities' | 'missing_conditions' | 'validation_error' | 'security_risk';
  severity: RiskLevel;
  description: string;
  location?: string;
  rule_id?: string;
}

export interface ExecutiveSummary {
  deploy_reference: DeployReference;
  iteration_metrics: IterationMetrics;
  risk_level: RiskLevel;
  recommendation: Recommendation;
  rationale: string;
}

export interface PolicyCreateResult {
  policy_id: string;
  version: string;
  status: string;
  rules_count: number;
  validation_errors: string[];
  synthesis?: ExecutiveSummary;
}

export interface PolicyEditResult {
  policy_id: string;
  version: string;
  previous_version: string;
  changes_applied: string[];
  validation_errors: string[];
  synthesis?: ExecutiveSummary;
}

export interface PolicyToggleResult {
  policy_id: string;
  previous_status: string;
  new_status: string;
  affected_rules: number;
  /** Decision packet with conflict analysis and enforcement impact */
  decision_packet?: DecisionPacket;
  synthesis?: ExecutiveSummary;
}

export interface PolicyDeleteResult {
  policy_id: string;
  deleted: boolean;
  synthesis?: ExecutiveSummary;
}

/**
 * Decision Packet - Core synthesis output for policy operations
 * Contains conflict analysis, resource impact, and enforcement projection
 */
export interface DecisionPacket {
  /** Policy conflict analysis */
  conflict_analysis: ConflictAnalysis;
  /** Count of resources affected by this policy operation */
  affected_resource_count: number;
  /** Enforcement impact projection */
  enforcement_impact: EnforcementImpact;
  /** Rollback instructions (for enable/disable operations) */
  rollback_instructions?: RollbackInstructions;
}

export interface ConflictAnalysis {
  /** Whether conflicts were detected */
  has_conflicts: boolean;
  /** List of conflicting rule pairs */
  conflicts: PolicyConflict[];
  /** Severity of most severe conflict */
  max_severity: RiskLevel;
  /** Summary description */
  summary: string;
}

export interface PolicyConflict {
  /** Source rule ID */
  rule_a_id: string;
  /** Conflicting rule ID */
  rule_b_id: string;
  /** Type of conflict */
  conflict_type: 'priority' | 'decision' | 'condition_overlap' | 'circular_reference';
  /** Description of the conflict */
  description: string;
  /** Severity level */
  severity: RiskLevel;
  /** Resolution suggestion */
  resolution?: string;
}

export interface EnforcementImpact {
  /** Predicted number of requests that would be ALLOWED */
  allowed_predictions: number;
  /** Predicted number of requests that would be DENIED */
  denied_predictions: number;
  /** Predicted number of requests that would be WARNED */
  warned_predictions: number;
  /** Predicted number of requests that would be MODIFIED */
  modified_predictions: number;
  /** Confidence level of predictions (0-1) */
  confidence: number;
  /** Impact assessment */
  impact_level: 'minimal' | 'moderate' | 'significant' | 'critical';
  /** Human-readable impact description */
  description: string;
}

export interface RollbackInstructions {
  /** Previous status before the operation */
  previous_status: string;
  /** Command to rollback this operation */
  rollback_command: string;
  /** Steps to verify rollback success */
  verification_steps: string[];
  /** Estimated time window for safe rollback */
  safe_rollback_window: string;
  /** Warnings about rollback side effects */
  warnings: string[];
}

/**
 * Policy Dry-Run Result
 * Evaluates policy impact against current state without making changes
 */
export interface PolicyDryRunResult {
  policy_id: string;
  /** Policy is valid and could be applied */
  can_apply: boolean;
  /** Validation errors that would block application */
  validation_errors: string[];
  /** Predicted violations based on current traffic patterns */
  violation_predictions: ViolationPrediction[];
  /** Decision packet with full analysis */
  decision_packet: DecisionPacket;
  /** Executive synthesis */
  synthesis: ExecutiveSummary;
}

export interface ViolationPrediction {
  /** Rule that would trigger */
  rule_id: string;
  /** Rule name */
  rule_name: string;
  /** Predicted action (DENY, WARN, MODIFY) */
  predicted_action: 'DENY' | 'WARN' | 'MODIFY';
  /** Estimated frequency of this violation */
  estimated_frequency: 'rare' | 'occasional' | 'frequent' | 'very_frequent';
  /** Estimated number of requests affected per hour */
  estimated_affected_requests_per_hour: number;
  /** Sample conditions that would trigger this rule */
  sample_trigger_conditions: string[];
  /** Risk level of this violation pattern */
  risk_level: RiskLevel;
}
