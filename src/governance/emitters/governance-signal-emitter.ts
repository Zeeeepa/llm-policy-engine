/**
 * Phase 4 Layer 1 - Governance Signal Emitter
 *
 * Emits governance signals WITHOUT auto-enforcement or auto-approval.
 * All signals are advisory and persisted via ruvector-service.
 *
 * AGENT PHASE: phase4
 * AGENT LAYER: layer1
 */
import { v4 as uuidv4 } from 'uuid';
import {
  GovernanceSignal,
  CostRiskSignal,
  BudgetThresholdSignal,
  PolicyViolationSignal,
  ApprovalRequiredSignal,
  GovernanceSignalAck,
  SignalSeverity,
  validatePerformanceBudget,
} from '../contracts/governance-signals';
import { ruvectorServiceClient } from '../../integrations/ruvector-service';
import logger from '@utils/logger';
import { config } from '@utils/config';

/**
 * Agent identification
 */
const AGENT_ID = 'governance-signal-emitter';
const AGENT_VERSION = '1.0.0';

/**
 * Governance Signal Emitter
 *
 * Responsible for creating and emitting governance signals.
 * DOES NOT enforce policies or auto-approve actions.
 */
export class GovernanceSignalEmitter {
  private environment: string;

  constructor() {
    this.environment = config.environment || 'development';
  }

  /**
   * Emit a cost risk signal
   * Advisory only - does NOT block or throttle
   */
  async emitCostRiskSignal(params: {
    requestId: string;
    traceId?: string;
    estimatedCost: number;
    currency?: 'USD' | 'EUR' | 'GBP';
    thresholdTriggered?: number;
    anomalyDetected?: boolean;
    anomalyScore?: number;
    costBreakdown?: {
      input_tokens_cost: number;
      output_tokens_cost: number;
      compute_cost?: number;
      storage_cost?: number;
    };
    scope: {
      user_id?: string;
      team_id?: string;
      project_id?: string;
      provider?: string;
      model?: string;
    };
    tokensUsed: number;
    latencyMs: number;
  }): Promise<GovernanceSignalAck> {
    const startTime = Date.now();

    // Calculate severity based on cost
    const severity = this.calculateCostSeverity(
      params.estimatedCost,
      params.thresholdTriggered
    );

    // Generate suggestions (advisory only)
    const suggestions = this.generateCostSuggestions(
      params.estimatedCost,
      params.anomalyDetected,
      params.scope
    );

    // Validate performance budget
    const perfBudget = validatePerformanceBudget(params.tokensUsed, params.latencyMs);

    const signal: CostRiskSignal = {
      signal_id: uuidv4(),
      signal_type: 'cost_risk_signal',
      agent_id: AGENT_ID,
      agent_version: AGENT_VERSION,
      severity,
      risk_category: 'cost',
      timestamp: new Date().toISOString(),
      execution_ref: {
        request_id: params.requestId,
        trace_id: params.traceId || uuidv4(),
        environment: this.environment,
      },
      performance: {
        tokens_used: params.tokensUsed,
        latency_ms: params.latencyMs,
        within_budget: perfBudget.withinBudget,
      },
      payload: {
        estimated_cost: params.estimatedCost,
        currency: params.currency || 'USD',
        threshold_triggered: params.thresholdTriggered,
        anomaly_detected: params.anomalyDetected || false,
        anomaly_score: params.anomalyScore,
        cost_breakdown: params.costBreakdown,
        scope: params.scope,
        suggestions,
      },
      advisory_only: true,
    };

    return this.persistSignal(signal, startTime);
  }

  /**
   * Emit a budget threshold signal
   * Advisory only - does NOT block requests
   */
  async emitBudgetThresholdSignal(params: {
    requestId: string;
    traceId?: string;
    budgetId: string;
    budgetLimit: number;
    currentSpend: number;
    projectedSpend?: number;
    period: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    currency?: 'USD' | 'EUR' | 'GBP';
    scope: {
      user_id?: string;
      team_id?: string;
      project_id?: string;
    };
    resetInHours?: number;
    tokensUsed: number;
    latencyMs: number;
  }): Promise<GovernanceSignalAck> {
    const startTime = Date.now();

    const percentageUsed = (params.currentSpend / params.budgetLimit) * 100;
    const thresholdLevel = this.determineBudgetThresholdLevel(percentageUsed);
    const severity = this.mapThresholdToSeverity(thresholdLevel);

    // Generate recommendations (advisory only)
    const recommendations = this.generateBudgetRecommendations(
      percentageUsed,
      thresholdLevel,
      params.budgetLimit - params.currentSpend
    );

    // Validate performance budget
    const perfBudget = validatePerformanceBudget(params.tokensUsed, params.latencyMs);

    const signal: BudgetThresholdSignal = {
      signal_id: uuidv4(),
      signal_type: 'budget_threshold_signal',
      agent_id: AGENT_ID,
      agent_version: AGENT_VERSION,
      severity,
      risk_category: 'budget',
      timestamp: new Date().toISOString(),
      execution_ref: {
        request_id: params.requestId,
        trace_id: params.traceId || uuidv4(),
        environment: this.environment,
      },
      performance: {
        tokens_used: params.tokensUsed,
        latency_ms: params.latencyMs,
        within_budget: perfBudget.withinBudget,
      },
      payload: {
        budget_id: params.budgetId,
        budget_limit: params.budgetLimit,
        current_spend: params.currentSpend,
        projected_spend: params.projectedSpend,
        percentage_used: Math.round(percentageUsed * 100) / 100,
        threshold_level: thresholdLevel,
        period: params.period,
        currency: params.currency || 'USD',
        scope: params.scope,
        reset_in_hours: params.resetInHours,
        recommendations,
      },
      advisory_only: true,
    };

    return this.persistSignal(signal, startTime);
  }

  /**
   * Emit a policy violation signal
   * Advisory only - does NOT enforce or block
   */
  async emitPolicyViolationSignal(params: {
    requestId: string;
    traceId?: string;
    policyId: string;
    policyName: string;
    ruleId: string;
    ruleName: string;
    violationDescription: string;
    evidence: {
      field: string;
      expected?: string;
      actual?: string;
      context?: Record<string, unknown>;
    };
    severity: SignalSeverity;
    riskCategory?: 'security' | 'compliance' | 'operational' | 'data_governance';
    complianceFramework?: 'SOC2' | 'HIPAA' | 'GDPR' | 'PCI-DSS' | 'ISO27001' | 'custom';
    relatedSignals?: string[];
    tokensUsed: number;
    latencyMs: number;
  }): Promise<GovernanceSignalAck> {
    const startTime = Date.now();

    // Generate remediation guidance (advisory only)
    const remediationGuidance = this.generateRemediationGuidance(
      params.policyId,
      params.ruleId,
      params.violationDescription
    );

    // Validate performance budget
    const perfBudget = validatePerformanceBudget(params.tokensUsed, params.latencyMs);

    const signal: PolicyViolationSignal = {
      signal_id: uuidv4(),
      signal_type: 'policy_violation_signal',
      agent_id: AGENT_ID,
      agent_version: AGENT_VERSION,
      severity: params.severity,
      risk_category: params.riskCategory || 'compliance',
      timestamp: new Date().toISOString(),
      execution_ref: {
        request_id: params.requestId,
        trace_id: params.traceId || uuidv4(),
        environment: this.environment,
      },
      performance: {
        tokens_used: params.tokensUsed,
        latency_ms: params.latencyMs,
        within_budget: perfBudget.withinBudget,
      },
      payload: {
        policy_id: params.policyId,
        policy_name: params.policyName,
        rule_id: params.ruleId,
        rule_name: params.ruleName,
        violation_description: params.violationDescription,
        evidence: params.evidence,
        compliance_framework: params.complianceFramework,
        remediation_guidance: remediationGuidance,
        related_signals: params.relatedSignals,
      },
      advisory_only: true,
    };

    return this.persistSignal(signal, startTime);
  }

  /**
   * Emit an approval required signal
   * Advisory only - does NOT auto-approve
   */
  async emitApprovalRequiredSignal(params: {
    requestId: string;
    traceId?: string;
    actionType: string;
    actionDescription: string;
    approvalReason: string;
    suggestedApprovers: string[];
    escalationPath: string[];
    timeoutSeconds?: number;
    riskLevel: SignalSeverity;
    impactedResources: string[];
    estimatedImpact?: string;
    rollbackPossible: boolean;
    requestDetails: Record<string, unknown>;
    tokensUsed: number;
    latencyMs: number;
  }): Promise<GovernanceSignalAck> {
    const startTime = Date.now();

    // Validate performance budget
    const perfBudget = validatePerformanceBudget(params.tokensUsed, params.latencyMs);

    const signal: ApprovalRequiredSignal = {
      signal_id: uuidv4(),
      signal_type: 'approval_required_signal',
      agent_id: AGENT_ID,
      agent_version: AGENT_VERSION,
      severity: params.riskLevel,
      risk_category: 'operational',
      timestamp: new Date().toISOString(),
      execution_ref: {
        request_id: params.requestId,
        trace_id: params.traceId || uuidv4(),
        environment: this.environment,
      },
      performance: {
        tokens_used: params.tokensUsed,
        latency_ms: params.latencyMs,
        within_budget: perfBudget.withinBudget,
      },
      payload: {
        action_type: params.actionType,
        action_description: params.actionDescription,
        approval_reason: params.approvalReason,
        // CRITICAL: Status MUST NOT be 'approved' or 'rejected'
        approval_status: 'pending',
        suggested_approvers: params.suggestedApprovers,
        escalation_path: params.escalationPath,
        timeout_seconds: params.timeoutSeconds || 3600,
        approval_context: {
          risk_level: params.riskLevel,
          impacted_resources: params.impactedResources,
          estimated_impact: params.estimatedImpact,
          rollback_possible: params.rollbackPossible,
        },
        request_details: params.requestDetails,
        // CRITICAL: Always true - no auto-approval
        requires_human_decision: true,
      },
      advisory_only: true,
    };

    return this.persistSignal(signal, startTime);
  }

  /**
   * Persist signal to ruvector-service
   */
  private async persistSignal(
    signal: GovernanceSignal,
    startTime: number
  ): Promise<GovernanceSignalAck> {
    try {
      const ack = await ruvectorServiceClient.persistGovernanceSignal(signal);

      logger.info(
        {
          signal_id: signal.signal_id,
          signal_type: signal.signal_type,
          severity: signal.severity,
          latency_ms: Date.now() - startTime,
          advisory_only: true,
        },
        'Governance signal emitted'
      );

      return ack;
    } catch (error) {
      logger.error(
        { error, signal_id: signal.signal_id },
        'Failed to persist governance signal'
      );

      return {
        accepted: false,
        signal_id: signal.signal_id,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Calculate cost severity
   */
  private calculateCostSeverity(
    estimatedCost: number,
    thresholdTriggered?: number
  ): SignalSeverity {
    if (thresholdTriggered && estimatedCost >= thresholdTriggered * 2) {
      return 'critical';
    }
    if (thresholdTriggered && estimatedCost >= thresholdTriggered) {
      return 'high';
    }
    if (estimatedCost > 100) {
      return 'medium';
    }
    if (estimatedCost > 10) {
      return 'low';
    }
    return 'info';
  }

  /**
   * Generate cost suggestions (advisory only)
   */
  private generateCostSuggestions(
    estimatedCost: number,
    anomalyDetected?: boolean,
    scope?: { provider?: string; model?: string }
  ): string[] {
    const suggestions: string[] = [];

    if (anomalyDetected) {
      suggestions.push('Unusual cost pattern detected - review recent usage');
    }

    if (estimatedCost > 50) {
      suggestions.push('Consider using a smaller model for non-critical tasks');
      suggestions.push('Review prompt efficiency to reduce token usage');
    }

    if (scope?.model?.includes('opus') || scope?.model?.includes('gpt-4')) {
      suggestions.push('Consider using a more cost-effective model tier');
    }

    return suggestions;
  }

  /**
   * Determine budget threshold level
   */
  private determineBudgetThresholdLevel(
    percentageUsed: number
  ): 'warning' | 'critical' | 'exceeded' {
    if (percentageUsed >= 100) {
      return 'exceeded';
    }
    if (percentageUsed >= 90) {
      return 'critical';
    }
    return 'warning';
  }

  /**
   * Map threshold level to severity
   */
  private mapThresholdToSeverity(
    level: 'warning' | 'critical' | 'exceeded'
  ): SignalSeverity {
    switch (level) {
      case 'exceeded':
        return 'critical';
      case 'critical':
        return 'high';
      case 'warning':
        return 'medium';
    }
  }

  /**
   * Generate budget recommendations (advisory only)
   */
  private generateBudgetRecommendations(
    percentageUsed: number,
    thresholdLevel: 'warning' | 'critical' | 'exceeded',
    remaining: number
  ): string[] {
    const recommendations: string[] = [];

    if (thresholdLevel === 'exceeded') {
      recommendations.push('Budget exceeded - request budget increase or reduce usage');
      recommendations.push('Review high-cost operations for optimization');
    } else if (thresholdLevel === 'critical') {
      recommendations.push(`Only $${remaining.toFixed(2)} remaining in budget`);
      recommendations.push('Prioritize critical operations');
    } else {
      recommendations.push(`Budget at ${percentageUsed.toFixed(1)}% - monitor usage`);
    }

    return recommendations;
  }

  /**
   * Generate remediation guidance (advisory only)
   */
  private generateRemediationGuidance(
    policyId: string,
    ruleId: string,
    violationDescription: string
  ): string[] {
    const guidance: string[] = [];

    guidance.push(`Review policy ${policyId} rule ${ruleId}`);
    guidance.push('Ensure request complies with policy requirements');
    guidance.push('Contact policy administrator if exception is needed');

    if (violationDescription.toLowerCase().includes('security')) {
      guidance.push('Security violations require security team review');
    }

    if (violationDescription.toLowerCase().includes('compliance')) {
      guidance.push('Compliance violations may require audit documentation');
    }

    return guidance;
  }
}

export const governanceSignalEmitter = new GovernanceSignalEmitter();
