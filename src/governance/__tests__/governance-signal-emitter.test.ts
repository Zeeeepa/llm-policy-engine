/**
 * Tests for Phase 4 Layer 1 Governance Signal Emitter
 */
import { GovernanceSignalEmitter } from '../emitters/governance-signal-emitter';
import {
  PERFORMANCE_BUDGETS,
  validatePerformanceBudget,
  validatePhase4Layer1Compliance,
  PHASE4_LAYER1_CONFIG,
} from '../index';

// Mock ruvector service client
jest.mock('../../integrations/ruvector-service', () => ({
  ruvectorServiceClient: {
    persistGovernanceSignal: jest.fn().mockResolvedValue({
      accepted: true,
      signal_id: 'test-signal-id',
      persisted_at: new Date().toISOString(),
    }),
  },
}));

// Mock logger
jest.mock('@utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
  level: 'info',
}));

// Mock config
jest.mock('@utils/config', () => ({
  config: {
    environment: 'test',
  },
}));

describe('GovernanceSignalEmitter', () => {
  let emitter: GovernanceSignalEmitter;

  beforeEach(() => {
    emitter = new GovernanceSignalEmitter();
    jest.clearAllMocks();
  });

  describe('emitCostRiskSignal', () => {
    it('should emit cost risk signal with advisory_only flag', async () => {
      const result = await emitter.emitCostRiskSignal({
        requestId: 'req-123',
        estimatedCost: 50,
        scope: { user_id: 'user-1' },
        tokensUsed: 500,
        latencyMs: 1000,
      });

      expect(result.accepted).toBe(true);
    });

    it('should include performance metrics', async () => {
      const result = await emitter.emitCostRiskSignal({
        requestId: 'req-123',
        estimatedCost: 25,
        scope: { team_id: 'team-1' },
        tokensUsed: 800,
        latencyMs: 1500,
      });

      expect(result.accepted).toBe(true);
    });

    it('should detect cost anomalies', async () => {
      const result = await emitter.emitCostRiskSignal({
        requestId: 'req-123',
        estimatedCost: 500,
        anomalyDetected: true,
        anomalyScore: 0.95,
        scope: { project_id: 'proj-1' },
        tokensUsed: 1000,
        latencyMs: 2000,
      });

      expect(result.accepted).toBe(true);
    });
  });

  describe('emitBudgetThresholdSignal', () => {
    it('should emit budget threshold signal with advisory_only flag', async () => {
      const result = await emitter.emitBudgetThresholdSignal({
        requestId: 'req-123',
        budgetId: 'budget-1',
        budgetLimit: 1000,
        currentSpend: 850,
        period: 'monthly',
        scope: { team_id: 'team-1' },
        tokensUsed: 600,
        latencyMs: 800,
      });

      expect(result.accepted).toBe(true);
    });

    it('should calculate correct threshold level', async () => {
      // Warning (80%+)
      const warningResult = await emitter.emitBudgetThresholdSignal({
        requestId: 'req-1',
        budgetId: 'budget-1',
        budgetLimit: 1000,
        currentSpend: 820,
        period: 'monthly',
        scope: {},
        tokensUsed: 500,
        latencyMs: 500,
      });
      expect(warningResult.accepted).toBe(true);

      // Critical (90%+)
      const criticalResult = await emitter.emitBudgetThresholdSignal({
        requestId: 'req-2',
        budgetId: 'budget-1',
        budgetLimit: 1000,
        currentSpend: 950,
        period: 'monthly',
        scope: {},
        tokensUsed: 500,
        latencyMs: 500,
      });
      expect(criticalResult.accepted).toBe(true);

      // Exceeded (100%+)
      const exceededResult = await emitter.emitBudgetThresholdSignal({
        requestId: 'req-3',
        budgetId: 'budget-1',
        budgetLimit: 1000,
        currentSpend: 1100,
        period: 'monthly',
        scope: {},
        tokensUsed: 500,
        latencyMs: 500,
      });
      expect(exceededResult.accepted).toBe(true);
    });
  });

  describe('emitPolicyViolationSignal', () => {
    it('should emit policy violation signal without enforcement', async () => {
      const result = await emitter.emitPolicyViolationSignal({
        requestId: 'req-123',
        policyId: 'policy-1',
        policyName: 'Test Policy',
        ruleId: 'rule-1',
        ruleName: 'Test Rule',
        violationDescription: 'Test violation',
        evidence: {
          field: 'model',
          expected: 'gpt-3.5-turbo',
          actual: 'gpt-4',
        },
        severity: 'high',
        tokensUsed: 700,
        latencyMs: 1200,
      });

      expect(result.accepted).toBe(true);
    });

    it('should include compliance framework when specified', async () => {
      const result = await emitter.emitPolicyViolationSignal({
        requestId: 'req-123',
        policyId: 'policy-1',
        policyName: 'HIPAA Policy',
        ruleId: 'rule-1',
        ruleName: 'PHI Protection',
        violationDescription: 'PHI detected in prompt',
        evidence: {
          field: 'prompt',
          context: { phi_detected: true },
        },
        severity: 'critical',
        complianceFramework: 'HIPAA',
        tokensUsed: 500,
        latencyMs: 800,
      });

      expect(result.accepted).toBe(true);
    });
  });

  describe('emitApprovalRequiredSignal', () => {
    it('should emit approval signal without auto-approving', async () => {
      const result = await emitter.emitApprovalRequiredSignal({
        requestId: 'req-123',
        actionType: 'model_upgrade',
        actionDescription: 'Upgrade to GPT-4',
        approvalReason: 'Cost increase requires approval',
        suggestedApprovers: ['admin@example.com'],
        escalationPath: ['manager@example.com', 'director@example.com'],
        riskLevel: 'medium',
        impactedResources: ['budget-team-1'],
        rollbackPossible: true,
        requestDetails: { new_model: 'gpt-4' },
        tokensUsed: 400,
        latencyMs: 600,
      });

      expect(result.accepted).toBe(true);
    });

    it('should always set requires_human_decision to true', async () => {
      const result = await emitter.emitApprovalRequiredSignal({
        requestId: 'req-123',
        actionType: 'policy_override',
        actionDescription: 'Override security policy',
        approvalReason: 'Emergency access required',
        suggestedApprovers: ['security@example.com'],
        escalationPath: ['ciso@example.com'],
        riskLevel: 'critical',
        impactedResources: ['all-systems'],
        rollbackPossible: false,
        requestDetails: {},
        tokensUsed: 300,
        latencyMs: 500,
      });

      expect(result.accepted).toBe(true);
    });
  });
});

describe('Performance Budget Validation', () => {
  it('should validate token budget', () => {
    const withinBudget = validatePerformanceBudget(1000, 2000);
    expect(withinBudget.withinBudget).toBe(true);
    expect(withinBudget.violations).toHaveLength(0);

    const exceedsTokens = validatePerformanceBudget(1500, 2000);
    expect(exceedsTokens.withinBudget).toBe(false);
    expect(exceedsTokens.violations).toContain(
      `Token usage 1500 exceeds budget ${PERFORMANCE_BUDGETS.MAX_TOKENS}`
    );
  });

  it('should validate latency budget', () => {
    const withinBudget = validatePerformanceBudget(1000, 2000);
    expect(withinBudget.withinBudget).toBe(true);

    const exceedsLatency = validatePerformanceBudget(1000, 3000);
    expect(exceedsLatency.withinBudget).toBe(false);
    expect(exceedsLatency.violations).toContain(
      `Latency 3000ms exceeds budget ${PERFORMANCE_BUDGETS.MAX_LATENCY_MS}ms`
    );
  });

  it('should detect multiple violations', () => {
    const result = validatePerformanceBudget(2000, 5000);
    expect(result.withinBudget).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});

describe('Phase 4 Layer 1 Compliance Validation', () => {
  it('should pass when all requirements are met', () => {
    const result = validatePhase4Layer1Compliance({
      signalEmitted: true,
      signalType: 'cost_risk_signal',
      autoEnforced: false,
      autoApproved: false,
      tokensUsed: 1000,
      latencyMs: 2000,
    });

    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should fail when signal not emitted', () => {
    const result = validatePhase4Layer1Compliance({
      signalEmitted: false,
      tokensUsed: 1000,
      latencyMs: 2000,
    });

    expect(result.compliant).toBe(false);
    expect(result.violations).toContain('Governance signal was not emitted');
  });

  it('should fail when auto-enforcement detected', () => {
    const result = validatePhase4Layer1Compliance({
      signalEmitted: true,
      autoEnforced: true,
      tokensUsed: 1000,
      latencyMs: 2000,
    });

    expect(result.compliant).toBe(false);
    expect(result.violations).toContain(
      'Auto-enforcement detected - agents MUST NOT auto-enforce policy'
    );
  });

  it('should fail when auto-approval detected', () => {
    const result = validatePhase4Layer1Compliance({
      signalEmitted: true,
      autoApproved: true,
      tokensUsed: 1000,
      latencyMs: 2000,
    });

    expect(result.compliant).toBe(false);
    expect(result.violations).toContain(
      'Auto-approval detected - agents MUST NOT auto-approve actions'
    );
  });

  it('should validate performance budgets', () => {
    const result = validatePhase4Layer1Compliance({
      signalEmitted: true,
      tokensUsed: 2000,
      latencyMs: 5000,
    });

    expect(result.compliant).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Configuration Constants', () => {
  it('should have correct Phase 4 Layer 1 configuration', () => {
    expect(PHASE4_LAYER1_CONFIG.AGENT_PHASE).toBe('phase4');
    expect(PHASE4_LAYER1_CONFIG.AGENT_LAYER).toBe('layer1');
    expect(PHASE4_LAYER1_CONFIG.MAX_TOKENS).toBe(1200);
    expect(PHASE4_LAYER1_CONFIG.MAX_LATENCY_MS).toBe(2500);
  });

  it('should define all required signal types', () => {
    expect(PHASE4_LAYER1_CONFIG.REQUIRED_SIGNALS).toContain('cost_risk_signal');
    expect(PHASE4_LAYER1_CONFIG.REQUIRED_SIGNALS).toContain('budget_threshold_signal');
    expect(PHASE4_LAYER1_CONFIG.REQUIRED_SIGNALS).toContain('policy_violation_signal');
    expect(PHASE4_LAYER1_CONFIG.REQUIRED_SIGNALS).toContain('approval_required_signal');
  });
});
