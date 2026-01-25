/**
 * Phase 4 Layer 1 - Governance & FinOps Module
 *
 * AGENT_PHASE: phase4
 * AGENT_LAYER: layer1
 *
 * GOVERNANCE RULES:
 * - Agents MUST emit cost signals
 * - Agents MUST emit policy evaluation signals
 * - Agents MUST emit approval requirements
 * - Agents MUST NOT auto-enforce policy
 * - Agents MUST NOT auto-approve actions
 *
 * PERFORMANCE BUDGETS:
 * - MAX_TOKENS: 1200
 * - MAX_LATENCY_MS: 2500
 */

// Contracts
export * from './contracts/governance-signals';

// Emitters
export { GovernanceSignalEmitter, governanceSignalEmitter } from './emitters/governance-signal-emitter';

/**
 * Phase 4 Layer 1 Configuration
 */
export const PHASE4_LAYER1_CONFIG = {
  /** Agent phase identifier */
  AGENT_PHASE: 'phase4',
  /** Agent layer identifier */
  AGENT_LAYER: 'layer1',
  /** Performance budget: maximum tokens */
  MAX_TOKENS: 1200,
  /** Performance budget: maximum latency in ms */
  MAX_LATENCY_MS: 2500,
  /** Required signal types */
  REQUIRED_SIGNALS: [
    'cost_risk_signal',
    'budget_threshold_signal',
    'policy_violation_signal',
    'approval_required_signal',
  ],
} as const;

/**
 * Validate Phase 4 Layer 1 compliance
 */
export function validatePhase4Layer1Compliance(params: {
  signalEmitted: boolean;
  signalType?: string;
  autoEnforced?: boolean;
  autoApproved?: boolean;
  tokensUsed: number;
  latencyMs: number;
}): { compliant: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check signal emission
  if (!params.signalEmitted) {
    violations.push('Governance signal was not emitted');
  }

  // Check auto-enforcement (MUST NOT)
  if (params.autoEnforced) {
    violations.push('Auto-enforcement detected - agents MUST NOT auto-enforce policy');
  }

  // Check auto-approval (MUST NOT)
  if (params.autoApproved) {
    violations.push('Auto-approval detected - agents MUST NOT auto-approve actions');
  }

  // Check performance budget
  if (params.tokensUsed > PHASE4_LAYER1_CONFIG.MAX_TOKENS) {
    violations.push(
      `Token usage ${params.tokensUsed} exceeds budget ${PHASE4_LAYER1_CONFIG.MAX_TOKENS}`
    );
  }

  if (params.latencyMs > PHASE4_LAYER1_CONFIG.MAX_LATENCY_MS) {
    violations.push(
      `Latency ${params.latencyMs}ms exceeds budget ${PHASE4_LAYER1_CONFIG.MAX_LATENCY_MS}ms`
    );
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}
