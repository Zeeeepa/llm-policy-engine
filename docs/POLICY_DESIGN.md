# Policy Design Guide

## Overview

This guide provides best practices, patterns, and examples for designing effective policies for the LLM-Policy-Engine.

## Table of Contents

1. [Policy Design Principles](#policy-design-principles)
2. [Policy Structure](#policy-structure)
3. [Condition Patterns](#condition-patterns)
4. [Action Strategies](#action-strategies)
5. [Common Policy Patterns](#common-policy-patterns)
6. [Performance Optimization](#performance-optimization)
7. [Testing Policies](#testing-policies)
8. [Migration Guide](#migration-guide)

---

## Policy Design Principles

### 1. Principle of Least Privilege

Start with deny-by-default and explicitly allow permitted actions.

```yaml
config:
  default_action: deny  # Deny by default

rules:
  # Explicitly allow specific cases
  - id: "allow-basic-queries"
    priority: 100
    conditions:
      match: |
        request.model in ["gpt-3.5-turbo"] &&
        user.tier in ["basic", "premium"] &&
        request.estimated_cost <= 0.01
    actions:
      - type: allow
```

### 2. Defense in Depth

Layer multiple security controls.

```yaml
rules:
  # Layer 1: Input validation
  - id: "validate-input"
    priority: 100
    conditions:
      match: |
        request.prompt.length() > 10000 ||
        request.prompt.contains_suspicious_patterns()
    actions:
      - type: deny
        reason: "Input validation failed"

  # Layer 2: Content filtering
  - id: "content-filter"
    priority: 90
    conditions:
      match: "shield.scan_prompt(request.prompt).passed == false"
    actions:
      - type: deny
        reason: "Content policy violation"

  # Layer 3: User authorization
  - id: "check-authorization"
    priority: 80
    conditions:
      match: "!user.has_permission('llm.access')"
    actions:
      - type: deny
        reason: "Unauthorized"
```

### 3. Fail Secure

Handle errors securely.

```yaml
fallback:
  action: deny
  reason: "Policy evaluation failed - failing secure"
  audit: true
  alert: true

exceptions:
  - id: "emergency-override"
    enabled: false  # Disabled by default
    conditions:
      match: "request.context.emergency == true && user.role == 'admin'"
    action: allow_all
    audit: true
    requires_approval: true
```

### 4. Auditability

Log all policy decisions for compliance.

```yaml
config:
  audit_all_decisions: true

rules:
  - id: "sensitive-operation"
    actions:
      - type: allow
      - type: audit
        severity: high
        metadata:
          compliance: "SOC2"
          category: "data-access"
```

### 5. Performance First

Design policies for efficient evaluation.

```yaml
rules:
  # Fast checks first (priority 100)
  - id: "rate-limit-check"
    priority: 100
    conditions:
      match: "rate_limiter.check(user.id, 100)"
    actions:
      - type: throttle

  # Expensive checks last (priority 50)
  - id: "ml-content-scan"
    priority: 50
    conditions:
      match: "ml_model.scan(request.prompt).score < 0.7"
    actions:
      - type: deny
```

---

## Policy Structure

### Minimal Policy

```yaml
version: "1.0"
metadata:
  name: "minimal-policy"
  namespace: "default"

rules:
  - id: "allow-all"
    priority: 0
    enabled: true
    conditions:
      match: "true"
    actions:
      - type: allow
```

### Production-Grade Policy

```yaml
version: "1.0"
metadata:
  name: "production-security-policy"
  namespace: "production"
  description: "Comprehensive security and compliance policy"
  tags:
    - security
    - compliance
    - pii-protection
  created_at: "2025-11-17T00:00:00Z"
  updated_at: "2025-11-17T00:00:00Z"
  revision: 1

config:
  default_action: deny
  fail_open: false
  audit_all_decisions: true
  cache_ttl_seconds: 300

rules:
  # Critical security rules (priority 100)
  - id: "block-injection-attacks"
    priority: 100
    enabled: true
    metadata:
      owner: "security-team"
      severity: "critical"
      compliance: ["SOC2", "ISO27001"]
    conditions:
      match: |
        request.prompt.contains_sql_injection() ||
        request.prompt.contains_xss() ||
        request.prompt.contains_command_injection()
    actions:
      - type: deny
        reason: "Security threat detected"
      - type: audit
        severity: critical
        alert: true
      - type: log
        level: error

  # Business rules (priority 50-90)
  - id: "enforce-budget"
    priority: 80
    enabled: true
    metadata:
      owner: "finance-team"
      category: "cost-control"
    conditions:
      match: |
        request.estimated_cost > user.budget.remaining
    actions:
      - type: deny
        reason: "Budget exceeded"
      - type: suggest_alternative
        model: "gpt-3.5-turbo"
      - type: audit
        severity: medium

  # Default allow (priority 0)
  - id: "default-allow"
    priority: 0
    enabled: true
    conditions:
      match: "true"
    actions:
      - type: allow
      - type: audit
        severity: info

fallback:
  action: deny
  reason: "Evaluation failed"
  audit: true
  alert: true
```

---

## Condition Patterns

### Simple Conditions

```yaml
# Equality check
conditions:
  match: "user.role == 'admin'"

# Membership check
conditions:
  match: "request.model in ['gpt-4', 'claude-3-opus']"

# Numeric comparison
conditions:
  match: "request.estimated_cost > 1.0"

# String operations
conditions:
  match: "request.prompt.contains('SQL')"

# Boolean logic
conditions:
  match: "user.tier == 'premium' && request.estimated_cost <= 10.0"
```

### Complex Conditions

```yaml
# Multiple conditions with AND
conditions:
  match: |
    user.tier == 'premium' &&
    request.model == 'gpt-4' &&
    request.estimated_cost <= user.budget.remaining &&
    !request.prompt.contains_pii()

# Multiple conditions with OR
conditions:
  match: |
    user.role == 'admin' ||
    (user.tier == 'premium' && user.team == 'research')

# Nested conditions
conditions:
  match: |
    (user.tier == 'premium' || user.role == 'admin') &&
    (request.estimated_cost <= 10.0 || request.context.approved == true)
```

### Time-Based Conditions

```yaml
# Business hours only
conditions:
  match: |
    now().hour >= 9 &&
    now().hour < 17 &&
    now().weekday() < 5

# Date range
conditions:
  match: |
    now() >= timestamp('2025-01-01T00:00:00Z') &&
    now() < timestamp('2025-12-31T23:59:59Z')

# Time window
conditions:
  match: |
    duration_since(user.last_request) > duration('1m')
```

### Function-Based Conditions

```yaml
# Built-in functions
conditions:
  match: |
    contains_pii(request.prompt) &&
    user.role != 'admin'

# Custom functions
conditions:
  match: |
    custom_validator.check_prompt(request.prompt, user.permissions)

# Integration functions
conditions:
  match: |
    shield.scan_prompt(request.prompt).score >= 0.7 &&
    costops.estimate_cost(request.model, request.estimated_tokens) <= user.budget.remaining
```

### Pattern Matching

```yaml
# Regex matching
conditions:
  match: |
    request.prompt.matches('SELECT.*FROM.*WHERE')

# Glob matching
conditions:
  match: |
    request.model.matches_glob('gpt-4*')

# List operations
conditions:
  match: |
    request.tags.any(tag => tag.starts_with('sensitive'))
```

---

## Action Strategies

### Allow Actions

```yaml
# Simple allow
actions:
  - type: allow

# Allow with metadata
actions:
  - type: allow
    metadata:
      reason: "Premium user"
      approved_by: "auto"

# Allow with warning
actions:
  - type: allow
  - type: warn
    message: "Approaching budget limit"
```

### Deny Actions

```yaml
# Simple deny
actions:
  - type: deny
    reason: "Insufficient permissions"

# Deny with alternative
actions:
  - type: deny
    reason: "Model not available"
  - type: suggest_alternative
    models: ["gpt-3.5-turbo", "claude-3-haiku"]

# Deny with redaction
actions:
  - type: deny
    reason: "PII detected"
  - type: redact
    fields: ["request.prompt"]
    pattern: "pii"
```

### Throttle Actions

```yaml
# Simple throttle
actions:
  - type: throttle
    delay_ms: 1000

# Throttle with retry
actions:
  - type: throttle
    delay_ms: 1000
    max_retries: 3
  - type: log
    level: warning
```

### Audit Actions

```yaml
# Basic audit
actions:
  - type: audit
    severity: info

# Detailed audit
actions:
  - type: audit
    severity: high
    alert: true
    metadata:
      compliance: "SOC2"
      category: "data-access"
      reviewer: "security-team"
```

### Composite Actions

```yaml
# Multiple actions
actions:
  - type: allow
  - type: audit
    severity: medium
  - type: log
    level: info
  - type: custom
    handler: "update_user_quota"
    metadata:
      tokens_used: "{{ request.estimated_tokens }}"
```

---

## Common Policy Patterns

### 1. PII Protection

```yaml
rules:
  - id: "block-pii-in-prompts"
    priority: 100
    conditions:
      match: |
        contains_pii(request.prompt) &&
        !user.has_permission('pii.access')
    actions:
      - type: deny
        reason: "PII detected in prompt"
      - type: audit
        severity: high
        alert: true
      - type: redact
        fields: ["request.prompt"]
        pattern: "pii"
```

### 2. Budget Management

```yaml
rules:
  - id: "enforce-daily-budget"
    priority: 90
    conditions:
      match: |
        user.budget.daily_spent + request.estimated_cost > user.budget.daily_limit
    actions:
      - type: deny
        reason: "Daily budget limit reached"
        metadata:
          daily_limit: "{{ user.budget.daily_limit }}"
          daily_spent: "{{ user.budget.daily_spent }}"
          requested_cost: "{{ request.estimated_cost }}"
      - type: suggest_alternative
        model: "gpt-3.5-turbo"

  - id: "warn-approaching-budget"
    priority: 85
    conditions:
      match: |
        user.budget.daily_spent + request.estimated_cost > user.budget.daily_limit * 0.8
    actions:
      - type: allow
      - type: warn
        message: "Approaching daily budget limit (80%)"
```

### 3. Rate Limiting

```yaml
rules:
  - id: "rate-limit-per-minute"
    priority: 95
    conditions:
      match: |
        rate_limit.count(user.id, '1m') > user.quota.requests_per_minute
    actions:
      - type: throttle
        delay_ms: 1000
        max_retries: 3
      - type: audit
        severity: medium

  - id: "rate-limit-per-hour"
    priority: 94
    conditions:
      match: |
        rate_limit.count(user.id, '1h') > user.quota.requests_per_hour
    actions:
      - type: deny
        reason: "Hourly rate limit exceeded"
      - type: audit
        severity: high
```

### 4. Model Access Control

```yaml
rules:
  - id: "restrict-premium-models"
    priority: 80
    conditions:
      match: |
        request.model in ['gpt-4', 'claude-3-opus'] &&
        user.tier != 'premium'
    actions:
      - type: deny
        reason: "Premium model requires premium tier"
      - type: suggest_alternative
        models: ["gpt-3.5-turbo", "claude-3-haiku"]

  - id: "team-model-allowlist"
    priority: 75
    conditions:
      match: |
        !request.model in user.team.allowed_models
    actions:
      - type: deny
        reason: "Model not allowed for your team"
```

### 5. Time-Based Access

```yaml
rules:
  - id: "business-hours-only"
    priority: 70
    conditions:
      match: |
        request.model in ['gpt-4', 'claude-3-opus'] &&
        (now().hour < 9 || now().hour >= 17) &&
        user.tier != 'premium'
    actions:
      - type: deny
        reason: "Premium models only available during business hours (9 AM - 5 PM) for non-premium users"
      - type: suggest_alternative
        models: ["gpt-3.5-turbo"]
```

### 6. Content Filtering

```yaml
rules:
  - id: "content-safety-check"
    priority: 100
    conditions:
      match: |
        content_safety.score(request.prompt) < 0.7
    actions:
      - type: deny
        reason: "Content safety score below threshold"
      - type: audit
        severity: high
        alert: true
        metadata:
          safety_score: "{{ content_safety.score(request.prompt) }}"

  - id: "toxicity-filter"
    priority: 99
    conditions:
      match: |
        toxicity.score(request.prompt) > 0.5
    actions:
      - type: deny
        reason: "Toxic content detected"
      - type: audit
        severity: high
```

### 7. Compliance Controls

```yaml
rules:
  - id: "gdpr-data-residency"
    priority: 100
    conditions:
      match: |
        user.region == 'EU' &&
        !request.model_region in ['eu-west-1', 'eu-central-1']
    actions:
      - type: deny
        reason: "GDPR compliance: data must remain in EU"
      - type: suggest_alternative
        models: ["gpt-4-eu", "claude-3-eu"]

  - id: "hipaa-audit"
    priority: 95
    conditions:
      match: |
        request.tags.contains('healthcare') ||
        contains_phi(request.prompt)
    actions:
      - type: allow
      - type: audit
        severity: high
        alert: true
        metadata:
          compliance: "HIPAA"
          category: "protected-health-information"
```

### 8. A/B Testing

```yaml
rules:
  - id: "ab-test-new-model"
    priority: 60
    conditions:
      match: |
        request.model == 'gpt-4' &&
        user.id.hash() % 100 < 10  # 10% of users
    actions:
      - type: allow
      - type: log
        metadata:
          ab_test: "new-model-rollout"
          cohort: "experimental"
```

### 9. Emergency Circuit Breaker

```yaml
rules:
  - id: "circuit-breaker"
    priority: 100
    conditions:
      match: |
        system.error_rate > 0.1 ||
        system.latency_p99 > 5000
    actions:
      - type: deny
        reason: "Circuit breaker triggered due to high error rate or latency"
      - type: audit
        severity: critical
        alert: true
```

### 10. Progressive Rollout

```yaml
rules:
  - id: "progressive-rollout-new-policy"
    priority: 90
    enabled: true
    metadata:
      rollout_stage: "phase-1"
    conditions:
      match: |
        user.team in ['team-alpha', 'team-beta']  # Phase 1: specific teams
    actions:
      - type: apply_new_policy
      - type: audit
        metadata:
          rollout_phase: "1"

  # Future phases:
  # Phase 2: 10% of users
  # Phase 3: 50% of users
  # Phase 4: 100% of users
```

---

## Performance Optimization

### 1. Rule Ordering

Place fast, high-rejection rules first:

```yaml
rules:
  # Fast check, high rejection rate (priority 100)
  - id: "rate-limit"
    priority: 100
    conditions:
      match: "rate_limit.exceeded(user.id)"
    actions:
      - type: deny

  # Medium speed (priority 90)
  - id: "budget-check"
    priority: 90
    conditions:
      match: "request.estimated_cost > user.budget.remaining"
    actions:
      - type: deny

  # Slow check, low rejection rate (priority 50)
  - id: "ml-content-scan"
    priority: 50
    conditions:
      match: "ml_model.scan(request.prompt).score < 0.7"
    actions:
      - type: deny
```

### 2. Caching Strategy

```yaml
config:
  cache_ttl_seconds: 300  # Cache decisions for 5 minutes

rules:
  - id: "cacheable-rule"
    # Simple, deterministic rules are highly cacheable
    conditions:
      match: |
        user.tier == 'basic' &&
        request.model == 'gpt-3.5-turbo' &&
        request.estimated_cost <= 0.01
    actions:
      - type: allow
```

### 3. Avoid Expensive Operations

```yaml
# BAD: Multiple expensive calls
conditions:
  match: |
    shield.scan_prompt(request.prompt).passed &&
    costops.estimate_cost(request.model, request.tokens).total < 10.0 &&
    ml_model.classify(request.prompt).category != 'harmful'

# GOOD: Guard with cheap checks first
conditions:
  match: |
    request.estimated_cost < 10.0 &&  # Cheap check first
    request.model in allowed_models &&
    shield.scan_prompt(request.prompt).passed  # Expensive check last
```

### 4. Precompute Values

```yaml
# Use precomputed values from context
conditions:
  match: |
    request.estimated_cost > user.budget.remaining  # Precomputed in context

# Instead of computing inline
conditions:
  match: |
    costops.estimate_cost(request.model, request.tokens).total > costops.get_budget(user.id).remaining
```

---

## Testing Policies

### Unit Testing

```yaml
# test/policies/security_test.yaml

tests:
  - name: "Block PII in prompts"
    policy: "security-policy"
    context:
      request:
        prompt: "My SSN is 123-45-6789"
        model: "gpt-4"
      user:
        id: "user-123"
        role: "developer"
        tier: "basic"
    expected:
      decision: "deny"
      reason: "PII detected in prompt"
      matched_rules: ["block-pii"]

  - name: "Allow safe prompts"
    policy: "security-policy"
    context:
      request:
        prompt: "What is the weather today?"
        model: "gpt-3.5-turbo"
      user:
        id: "user-123"
        role: "developer"
        tier: "basic"
    expected:
      decision: "allow"
      matched_rules: ["default-allow"]
```

### Integration Testing

```bash
# Test policy evaluation
policy-engine test \
  --policy ./policies/production.yaml \
  --test-cases ./test/test-cases.yaml \
  --verbose

# Benchmark policy performance
policy-engine benchmark \
  --policy ./policies/production.yaml \
  --iterations 10000 \
  --report ./benchmark-report.json
```

### Validation

```bash
# Validate policy syntax
policy-engine validate ./policies/production.yaml

# Validate with strict checks
policy-engine validate \
  --policy ./policies/production.yaml \
  --strict \
  --check-conflicts \
  --check-coverage
```

---

## Migration Guide

### From OpenPolicyAgent (OPA)

OPA Rego:

```rego
package example

default allow = false

allow {
    input.user.role == "admin"
}

allow {
    input.user.tier == "premium"
    input.request.cost <= input.user.budget
}
```

LLM-Policy-Engine equivalent:

```yaml
version: "1.0"
metadata:
  name: "migrated-from-opa"
  namespace: "default"

config:
  default_action: deny

rules:
  - id: "allow-admins"
    priority: 100
    conditions:
      match: "user.role == 'admin'"
    actions:
      - type: allow

  - id: "allow-premium-within-budget"
    priority: 90
    conditions:
      match: |
        user.tier == 'premium' &&
        request.estimated_cost <= user.budget.remaining
    actions:
      - type: allow
```

### Version Migration

```yaml
# Old version (v0.9)
version: "0.9"
rules:
  - name: "rule-1"  # Old field name
    condition: "user.role == 'admin'"  # Old field name
    action: "allow"  # Old field name

# New version (v1.0)
version: "1.0"
rules:
  - id: "rule-1"  # New field name
    conditions:  # New structure
      match: "user.role == 'admin'"
    actions:  # New structure
      - type: allow
```

---

This policy design guide provides comprehensive patterns and best practices for creating effective, performant, and maintainable policies for the LLM-Policy-Engine.
