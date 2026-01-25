/**
 * Phase 4 Layer 1 - Governance & FinOps Signal Contracts
 *
 * GOVERNANCE RULES:
 * - Agents MUST emit cost signals
 * - Agents MUST emit policy evaluation signals
 * - Agents MUST emit approval requirements
 * - Agents MUST NOT auto-enforce policy
 * - Agents MUST NOT auto-approve actions
 *
 * All events persisted via ruvector-service (never direct SQL)
 */

/**
 * Phase 4 Governance DecisionEvent Types
 */
export type GovernanceSignalType =
  | 'cost_risk_signal'
  | 'budget_threshold_signal'
  | 'policy_violation_signal'
  | 'approval_required_signal';

/**
 * Signal severity levels
 */
export type SignalSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Risk category classification
 */
export type RiskCategory =
  | 'cost'
  | 'budget'
  | 'security'
  | 'compliance'
  | 'operational'
  | 'data_governance';

/**
 * Approval status - agents MUST NOT auto-approve
 */
export type ApprovalStatus =
  | 'pending'
  | 'awaiting_review'
  | 'escalated'
  | 'deferred';

/**
 * Base Governance Signal
 */
export interface GovernanceSignalBase {
  /** Unique signal identifier */
  signal_id: string;
  /** Signal type classification */
  signal_type: GovernanceSignalType;
  /** Emitting agent identifier */
  agent_id: string;
  /** Agent version */
  agent_version: string;
  /** Severity level */
  severity: SignalSeverity;
  /** Risk category */
  risk_category: RiskCategory;
  /** UTC timestamp */
  timestamp: string;
  /** Execution reference */
  execution_ref: {
    request_id: string;
    trace_id?: string;
    span_id?: string;
    environment: string;
    session_id?: string;
  };
  /** Performance metrics */
  performance: {
    tokens_used: number;
    latency_ms: number;
    within_budget: boolean;
  };
}

/**
 * Cost Risk Signal
 * Emitted when cost thresholds or anomalies are detected
 */
export interface CostRiskSignal extends GovernanceSignalBase {
  signal_type: 'cost_risk_signal';
  payload: {
    /** Estimated cost for the operation */
    estimated_cost: number;
    /** Currency code */
    currency: 'USD' | 'EUR' | 'GBP';
    /** Cost threshold that triggered the signal */
    threshold_triggered?: number;
    /** Cost anomaly detection result */
    anomaly_detected: boolean;
    /** Anomaly score (0-1) if detected */
    anomaly_score?: number;
    /** Cost breakdown by component */
    cost_breakdown?: {
      input_tokens_cost: number;
      output_tokens_cost: number;
      compute_cost?: number;
      storage_cost?: number;
    };
    /** Scope of the cost risk */
    scope: {
      user_id?: string;
      team_id?: string;
      project_id?: string;
      provider?: string;
      model?: string;
    };
    /** Risk mitigation suggestions (advisory only) */
    suggestions: string[];
  };
  /** MUST NOT contain enforcement action - signal only */
  advisory_only: true;
}

/**
 * Budget Threshold Signal
 * Emitted when budget thresholds are approached or breached
 */
export interface BudgetThresholdSignal extends GovernanceSignalBase {
  signal_type: 'budget_threshold_signal';
  payload: {
    /** Budget identifier */
    budget_id: string;
    /** Budget limit */
    budget_limit: number;
    /** Current spend */
    current_spend: number;
    /** Projected spend */
    projected_spend?: number;
    /** Percentage used */
    percentage_used: number;
    /** Threshold level triggered */
    threshold_level: 'warning' | 'critical' | 'exceeded';
    /** Budget period */
    period: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    /** Currency */
    currency: 'USD' | 'EUR' | 'GBP';
    /** Scope */
    scope: {
      user_id?: string;
      team_id?: string;
      project_id?: string;
    };
    /** Time until budget reset */
    reset_in_hours?: number;
    /** Recommendations (advisory only) */
    recommendations: string[];
  };
  /** MUST NOT contain enforcement action - signal only */
  advisory_only: true;
}

/**
 * Policy Violation Signal
 * Emitted when policy violations are detected - DOES NOT ENFORCE
 */
export interface PolicyViolationSignal extends GovernanceSignalBase {
  signal_type: 'policy_violation_signal';
  payload: {
    /** Policy that was violated */
    policy_id: string;
    /** Policy name */
    policy_name: string;
    /** Specific rule violated */
    rule_id: string;
    /** Rule name */
    rule_name: string;
    /** Violation description */
    violation_description: string;
    /** Violation evidence */
    evidence: {
      field: string;
      expected?: string;
      actual?: string;
      context?: Record<string, unknown>;
    };
    /** Compliance framework affected (if any) */
    compliance_framework?: 'SOC2' | 'HIPAA' | 'GDPR' | 'PCI-DSS' | 'ISO27001' | 'custom';
    /** Remediation guidance (advisory only) */
    remediation_guidance: string[];
    /** Related signals */
    related_signals?: string[];
  };
  /** MUST NOT contain enforcement action - signal only */
  advisory_only: true;
}

/**
 * Approval Required Signal
 * Emitted when human approval is required - DOES NOT AUTO-APPROVE
 */
export interface ApprovalRequiredSignal extends GovernanceSignalBase {
  signal_type: 'approval_required_signal';
  payload: {
    /** Action requiring approval */
    action_type: string;
    /** Action description */
    action_description: string;
    /** Reason approval is required */
    approval_reason: string;
    /** Approval status - MUST NOT be 'approved' or 'rejected' */
    approval_status: ApprovalStatus;
    /** Suggested approvers */
    suggested_approvers: string[];
    /** Escalation path */
    escalation_path: string[];
    /** Approval timeout (seconds) */
    timeout_seconds: number;
    /** Context for approver */
    approval_context: {
      risk_level: SignalSeverity;
      impacted_resources: string[];
      estimated_impact?: string;
      rollback_possible: boolean;
    };
    /** Request details for human review */
    request_details: Record<string, unknown>;
    /** DO NOT include auto-approval logic */
    requires_human_decision: true;
  };
  /** MUST NOT contain approval decision - signal only */
  advisory_only: true;
}

/**
 * Union type for all governance signals
 */
export type GovernanceSignal =
  | CostRiskSignal
  | BudgetThresholdSignal
  | PolicyViolationSignal
  | ApprovalRequiredSignal;

/**
 * Governance signal acknowledgment
 */
export interface GovernanceSignalAck {
  accepted: boolean;
  signal_id: string;
  persisted_at?: string;
  error?: string;
}

/**
 * Performance budget constraints (Phase 4 Layer 1)
 */
export const PERFORMANCE_BUDGETS = {
  MAX_TOKENS: 1200,
  MAX_LATENCY_MS: 2500,
} as const;

/**
 * Validate performance is within budget
 */
export function validatePerformanceBudget(
  tokensUsed: number,
  latencyMs: number
): { withinBudget: boolean; violations: string[] } {
  const violations: string[] = [];

  if (tokensUsed > PERFORMANCE_BUDGETS.MAX_TOKENS) {
    violations.push(
      `Token usage ${tokensUsed} exceeds budget ${PERFORMANCE_BUDGETS.MAX_TOKENS}`
    );
  }

  if (latencyMs > PERFORMANCE_BUDGETS.MAX_LATENCY_MS) {
    violations.push(
      `Latency ${latencyMs}ms exceeds budget ${PERFORMANCE_BUDGETS.MAX_LATENCY_MS}ms`
    );
  }

  return {
    withinBudget: violations.length === 0,
    violations,
  };
}
