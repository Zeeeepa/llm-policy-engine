# LLM-Policy-Engine Architecture

## Executive Summary

The LLM-Policy-Engine is a high-performance, Rust-based policy enforcement system designed for distributed LLM operations. It provides real-time policy evaluation, sandboxed execution, and seamless integration with LLM infrastructure components.

## Table of Contents

1. [System Overview](#system-overview)
2. [Core Architecture](#core-architecture)
3. [Data Models](#data-models)
4. [Rule Evaluation Engine](#rule-evaluation-engine)
5. [Caching Architecture](#caching-architecture)
6. [Policy Registry & Sync](#policy-registry--sync)
7. [Integration APIs](#integration-apis)
8. [Deployment Models](#deployment-models)
9. [Security & Sandboxing](#security--sandboxing)
10. [Performance Characteristics](#performance-characteristics)

---

## System Overview

### Design Principles

1. **High Performance**: Sub-millisecond policy evaluation for real-time decisions
2. **Safety First**: Sandboxed policy execution with resource limits
3. **Distributed by Design**: Built for edge deployment and central coordination
4. **Observable**: Comprehensive audit trails and metrics
5. **Extensible**: Plugin architecture for custom policy logic

### Key Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    LLM-Policy-Engine Ecosystem                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ LLM-Shield   │  │ LLM-CostOps  │  │LLM-Governance│         │
│  │  (Security)  │  │   (Budget)   │  │  (Audit/UI)  │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │                                    │
│         ┌──────────────────▼────────────────────┐               │
│         │   Policy Engine Core (Rust)           │               │
│         │  ┌─────────────────────────────────┐  │               │
│         │  │  Policy Evaluation Runtime      │  │               │
│         │  │  • Rule Engine                  │  │               │
│         │  │  • Expression Evaluator         │  │               │
│         │  │  • Sandbox Manager              │  │               │
│         │  └─────────────────────────────────┘  │               │
│         │  ┌─────────────────────────────────┐  │               │
│         │  │  Policy Registry                │  │               │
│         │  │  • Version Control              │  │               │
│         │  │  • Hot Reload                   │  │               │
│         │  │  • Sync Protocol                │  │               │
│         │  └─────────────────────────────────┘  │               │
│         │  ┌─────────────────────────────────┐  │               │
│         │  │  Caching Layer                  │  │               │
│         │  │  • Decision Cache               │  │               │
│         │  │  • Policy Compilation Cache     │  │               │
│         │  └─────────────────────────────────┘  │               │
│         │  ┌─────────────────────────────────┐  │               │
│         │  │  Audit & Metrics                │  │               │
│         │  │  • Decision Logs                │  │               │
│         │  │  • Performance Metrics          │  │               │
│         │  └─────────────────────────────────┘  │               │
│         └───────────────────────────────────────┘               │
│                            │                                    │
│         ┌──────────────────▼────────────────────┐               │
│         │    LLM-Edge-Agent (Distributed)       │               │
│         │  • Local Policy Enforcement           │               │
│         │  • Offline Capability                 │               │
│         └───────────────────────────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Policy Engine Core                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              Public API Layer                          │    │
│  │  • PolicyEngine::evaluate()                            │    │
│  │  • PolicyEngine::load_policy()                         │    │
│  │  • PolicyEngine::subscribe_updates()                   │    │
│  └────────────┬───────────────────────────────────────────┘    │
│               │                                                 │
│  ┌────────────▼───────────────────────────────────────────┐    │
│  │         Policy Compiler & Validator                    │    │
│  │  ┌──────────────────┐  ┌──────────────────┐            │    │
│  │  │ YAML/JSON Parser │  │ DSL Compiler     │            │    │
│  │  └────────┬─────────┘  └────────┬─────────┘            │    │
│  │           │                     │                       │    │
│  │  ┌────────▼─────────────────────▼─────────┐            │    │
│  │  │      Semantic Validator               │            │    │
│  │  │  • Type Checking                       │            │    │
│  │  │  • Dependency Analysis                 │            │    │
│  │  │  • Conflict Detection                  │            │    │
│  │  └────────────────┬───────────────────────┘            │    │
│  └───────────────────┼────────────────────────────────────┘    │
│                      │                                         │
│  ┌───────────────────▼────────────────────────────────────┐    │
│  │         Compiled Policy Store (In-Memory)             │    │
│  │  • Arc<RwLock<PolicySet>>                             │    │
│  │  • Indexed by: namespace, tags, version               │    │
│  └────────────┬───────────────────────────────────────────┘    │
│               │                                                 │
│  ┌────────────▼───────────────────────────────────────────┐    │
│  │            Rule Evaluation Engine                      │    │
│  │  ┌──────────────────┐  ┌──────────────────┐            │    │
│  │  │ Context Builder  │  │ Expression       │            │    │
│  │  │ • Request Data   │  │ Evaluator (CEL)  │            │    │
│  │  │ • User Context   │  │ • Custom DSL     │            │    │
│  │  │ • Metadata       │  └──────────────────┘            │    │
│  │  └──────────────────┘                                  │    │
│  │  ┌──────────────────────────────────────┐              │    │
│  │  │ Sandbox Runtime (Wasmtime)           │              │    │
│  │  │ • Resource Limits (CPU, Memory)      │              │    │
│  │  │ • Execution Timeout                  │              │    │
│  │  │ • Capability-based Security          │              │    │
│  │  └──────────────────────────────────────┘              │    │
│  │  ┌──────────────────────────────────────┐              │    │
│  │  │ Decision Engine                      │              │    │
│  │  │ • Rule Matching                      │              │    │
│  │  │ • Priority Resolution                │              │    │
│  │  │ • Conflict Resolution                │              │    │
│  │  │ • Default Policy Application         │              │    │
│  │  └──────────────────┬───────────────────┘              │    │
│  └───────────────────┼──────────────────────────────────┘    │
│                      │                                         │
│  ┌───────────────────▼────────────────────────────────────┐    │
│  │              Caching Layer                             │    │
│  │  ┌──────────────────┐  ┌──────────────────┐            │    │
│  │  │ Decision Cache   │  │ Compilation Cache│            │    │
│  │  │ (LRU, TTL-based) │  │ (Arc-based)      │            │    │
│  │  └──────────────────┘  └──────────────────┘            │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Audit & Observability                      │   │
│  │  ┌──────────────────┐  ┌──────────────────┐             │   │
│  │  │ Decision Logger  │  │ Metrics Collector│             │   │
│  │  │ • Structured Log │  │ • Prometheus     │             │   │
│  │  │ • Trace Context  │  │ • OpenTelemetry  │             │   │
│  │  └──────────────────┘  └──────────────────┘             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Module Structure (Rust)

```
llm-policy-engine/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Main library entry point
│   │
│   ├── api/                      # Public API
│   │   ├── mod.rs
│   │   ├── engine.rs             # PolicyEngine struct
│   │   ├── context.rs            # EvaluationContext
│   │   ├── decision.rs           # PolicyDecision
│   │   └── errors.rs             # Error types
│   │
│   ├── core/                     # Core engine logic
│   │   ├── mod.rs
│   │   ├── evaluator.rs          # Rule evaluation
│   │   ├── compiler.rs           # Policy compilation
│   │   ├── validator.rs          # Policy validation
│   │   ├── matcher.rs            # Rule matching
│   │   └── resolver.rs           # Conflict resolution
│   │
│   ├── runtime/                  # Execution runtime
│   │   ├── mod.rs
│   │   ├── sandbox.rs            # WASM sandbox
│   │   ├── expression.rs         # Expression evaluation
│   │   ├── functions.rs          # Built-in functions
│   │   └── limits.rs             # Resource limits
│   │
│   ├── policy/                   # Policy representation
│   │   ├── mod.rs
│   │   ├── document.rs           # PolicyDocument
│   │   ├── rule.rs               # Rule definitions
│   │   ├── condition.rs          # Condition AST
│   │   └── action.rs             # Action definitions
│   │
│   ├── registry/                 # Policy registry
│   │   ├── mod.rs
│   │   ├── store.rs              # Policy storage
│   │   ├── sync.rs               # Sync protocol
│   │   ├── version.rs            # Version control
│   │   └── loader.rs             # Policy loading
│   │
│   ├── cache/                    # Caching layer
│   │   ├── mod.rs
│   │   ├── decision_cache.rs     # Decision caching
│   │   ├── compilation_cache.rs  # Compiled policy cache
│   │   └── strategies.rs         # Cache strategies
│   │
│   ├── integration/              # External integrations
│   │   ├── mod.rs
│   │   ├── shield.rs             # LLM-Shield integration
│   │   ├── costops.rs            # LLM-CostOps integration
│   │   ├── governance.rs         # LLM-Governance integration
│   │   └── edge_agent.rs         # LLM-Edge-Agent integration
│   │
│   ├── audit/                    # Audit and logging
│   │   ├── mod.rs
│   │   ├── logger.rs             # Decision logging
│   │   ├── metrics.rs            # Metrics collection
│   │   └── tracing.rs            # Distributed tracing
│   │
│   ├── transport/                # Network transport
│   │   ├── mod.rs
│   │   ├── grpc.rs               # gRPC server/client
│   │   ├── http.rs               # HTTP API
│   │   └── ipc.rs                # IPC for sidecar
│   │
│   └── daemon/                   # Standalone daemon
│       ├── mod.rs
│       ├── server.rs             # Policy server
│       ├── config.rs             # Configuration
│       └── cli.rs                # CLI interface
│
├── benches/                      # Performance benchmarks
├── examples/                     # Usage examples
└── tests/                        # Integration tests
```

---

## Data Models

### Policy Document Schema

#### YAML Format

```yaml
# policy.yaml
version: "1.0"
metadata:
  name: "llm-security-policy"
  namespace: "production"
  description: "Security and compliance policies for LLM operations"
  tags:
    - security
    - compliance
    - pii-protection
  created_at: "2025-11-17T00:00:00Z"
  updated_at: "2025-11-17T00:00:00Z"
  revision: 42

# Global configuration
config:
  default_action: deny
  fail_open: false
  audit_all_decisions: true
  cache_ttl_seconds: 300

# Policy rules (evaluated in order)
rules:
  # Rule 1: Block PII in prompts
  - id: "block-pii"
    priority: 100
    enabled: true
    metadata:
      owner: "security-team"
      severity: "critical"

    conditions:
      # CEL expression
      match: |
        request.prompt.contains_pii() &&
        request.user.role != "admin" &&
        !request.context.has_pii_exemption

      # Alternative: DSL syntax
      # all:
      #   - contains_pii: request.prompt
      #   - not_equals: [request.user.role, "admin"]
      #   - not: request.context.has_pii_exemption

    actions:
      - type: deny
        reason: "PII detected in prompt"

      - type: audit
        severity: high
        alert: true

      - type: redact
        fields: ["request.prompt"]
        pattern: "pii"

  # Rule 2: Cost budget enforcement
  - id: "enforce-budget"
    priority: 90
    enabled: true

    conditions:
      match: |
        request.estimated_cost > user.budget.remaining ||
        request.estimated_tokens > user.quota.tokens_remaining

    actions:
      - type: deny
        reason: "Budget exceeded"
        metadata:
          remaining_budget: "{{ user.budget.remaining }}"
          requested_cost: "{{ request.estimated_cost }}"

      - type: suggest_alternative
        model: "gpt-3.5-turbo"  # Cheaper alternative

  # Rule 3: Rate limiting
  - id: "rate-limit"
    priority: 80
    enabled: true

    conditions:
      match: |
        rate_limit.requests_per_minute(user.id) > 60

    actions:
      - type: throttle
        delay_ms: 1000
        max_retries: 3

      - type: audit
        severity: medium

  # Rule 4: Content filtering
  - id: "content-filter"
    priority: 70
    enabled: true

    conditions:
      match: |
        content_safety.score(request.prompt) < 0.7 ||
        request.prompt.contains_harmful_content()

    actions:
      - type: deny
        reason: "Content policy violation"

      - type: log
        level: warning

  # Rule 5: Model access control
  - id: "model-access"
    priority: 60
    enabled: true

    conditions:
      match: |
        request.model in ["gpt-4", "claude-3-opus"] &&
        user.tier != "premium"

    actions:
      - type: deny
        reason: "Insufficient tier for requested model"

      - type: suggest_alternative
        models: ["gpt-3.5-turbo", "claude-3-haiku"]

  # Rule 6: Time-based access
  - id: "business-hours"
    priority: 50
    enabled: true

    conditions:
      match: |
        request.model == "gpt-4" &&
        (now().hour < 9 || now().hour >= 17) &&
        user.team == "dev"

    actions:
      - type: warn
        message: "Using premium model outside business hours"

      - type: allow
        with_warning: true

  # Default rule (lowest priority)
  - id: "default-allow"
    priority: 0
    enabled: true

    conditions:
      match: "true"  # Always matches

    actions:
      - type: allow

      - type: audit
        severity: info

# Exception handling
exceptions:
  - id: "emergency-override"
    enabled: true
    conditions:
      match: "request.context.emergency_override == true"
    action: allow_all
    audit: true
    requires_approval: true

# Fallback behavior (if evaluation fails)
fallback:
  action: deny
  reason: "Policy evaluation failed"
  audit: true
  alert: true
```

#### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "LLM Policy Document",
  "type": "object",
  "required": ["version", "metadata", "rules"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+$"
    },
    "metadata": {
      "type": "object",
      "required": ["name", "namespace"],
      "properties": {
        "name": {"type": "string"},
        "namespace": {"type": "string"},
        "description": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
        "created_at": {"type": "string", "format": "date-time"},
        "updated_at": {"type": "string", "format": "date-time"},
        "revision": {"type": "integer"}
      }
    },
    "config": {
      "type": "object",
      "properties": {
        "default_action": {"enum": ["allow", "deny"]},
        "fail_open": {"type": "boolean"},
        "audit_all_decisions": {"type": "boolean"},
        "cache_ttl_seconds": {"type": "integer"}
      }
    },
    "rules": {
      "type": "array",
      "items": {"$ref": "#/definitions/rule"}
    },
    "exceptions": {
      "type": "array",
      "items": {"$ref": "#/definitions/exception"}
    },
    "fallback": {"$ref": "#/definitions/fallback"}
  },
  "definitions": {
    "rule": {
      "type": "object",
      "required": ["id", "conditions", "actions"],
      "properties": {
        "id": {"type": "string"},
        "priority": {"type": "integer"},
        "enabled": {"type": "boolean"},
        "metadata": {"type": "object"},
        "conditions": {"$ref": "#/definitions/conditions"},
        "actions": {
          "type": "array",
          "items": {"$ref": "#/definitions/action"}
        }
      }
    },
    "conditions": {
      "type": "object",
      "oneOf": [
        {"required": ["match"]},
        {"required": ["all"]},
        {"required": ["any"]},
        {"required": ["none"]}
      ],
      "properties": {
        "match": {"type": "string"},
        "all": {"type": "array"},
        "any": {"type": "array"},
        "none": {"type": "array"}
      }
    },
    "action": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": {
          "enum": [
            "allow", "deny", "throttle", "audit", "log",
            "redact", "suggest_alternative", "warn", "allow_all"
          ]
        },
        "reason": {"type": "string"},
        "metadata": {"type": "object"}
      }
    }
  }
}
```

### Rust Data Structures

```rust
// src/policy/document.rs

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDocument {
    pub version: String,
    pub metadata: PolicyMetadata,
    pub config: PolicyConfig,
    pub rules: Vec<Rule>,
    pub exceptions: Option<Vec<Exception>>,
    pub fallback: Option<Fallback>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyMetadata {
    pub name: String,
    pub namespace: String,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub revision: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyConfig {
    pub default_action: ActionType,
    pub fail_open: bool,
    pub audit_all_decisions: bool,
    pub cache_ttl_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub priority: i32,
    pub enabled: bool,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
    pub conditions: Conditions,
    pub actions: Vec<Action>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Conditions {
    Expression { match_expr: String },
    Composite { all: Option<Vec<Condition>>, any: Option<Vec<Condition>>, none: Option<Vec<Condition>> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Condition {
    // Flexible condition representation
    #[serde(flatten)]
    pub expr: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    #[serde(rename = "type")]
    pub action_type: ActionType,
    pub reason: Option<String>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,

    // Action-specific fields
    pub delay_ms: Option<u64>,
    pub max_retries: Option<u32>,
    pub severity: Option<String>,
    pub alert: Option<bool>,
    pub fields: Option<Vec<String>>,
    pub pattern: Option<String>,
    pub model: Option<String>,
    pub models: Option<Vec<String>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActionType {
    Allow,
    Deny,
    Throttle,
    Audit,
    Log,
    Redact,
    SuggestAlternative,
    Warn,
    AllowAll,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exception {
    pub id: String,
    pub enabled: bool,
    pub conditions: Conditions,
    pub action: ActionType,
    pub audit: bool,
    pub requires_approval: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fallback {
    pub action: ActionType,
    pub reason: String,
    pub audit: bool,
    pub alert: bool,
}
```

### Evaluation Context

```rust
// src/api/context.rs

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvaluationContext {
    pub request: RequestContext,
    pub user: UserContext,
    pub metadata: HashMap<String, serde_json::Value>,
    pub timestamp: DateTime<Utc>,
    pub trace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestContext {
    pub prompt: String,
    pub model: String,
    pub estimated_cost: f64,
    pub estimated_tokens: u64,
    pub context: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserContext {
    pub id: String,
    pub role: String,
    pub tier: String,
    pub team: String,
    pub budget: BudgetInfo,
    pub quota: QuotaInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetInfo {
    pub total: f64,
    pub remaining: f64,
    pub period: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaInfo {
    pub tokens_total: u64,
    pub tokens_remaining: u64,
    pub requests_per_minute: u32,
}
```

### Policy Decision

```rust
// src/api/decision.rs

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDecision {
    pub decision: DecisionType,
    pub reason: String,
    pub matched_rules: Vec<String>,
    pub actions: Vec<ActionResult>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub evaluation_time_us: u64,
    pub from_cache: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DecisionType {
    Allow,
    Deny,
    Throttle,
    AllowWithWarning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResult {
    pub action_type: ActionType,
    pub applied: bool,
    pub error: Option<String>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}
```

---

## Rule Evaluation Engine

### Evaluation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   Policy Evaluation Pipeline                    │
└─────────────────────────────────────────────────────────────────┘

  1. Request Received
     │
     ├─→ Parse EvaluationContext
     │
     ▼
  2. Cache Lookup
     │
     ├─→ [CACHE HIT] ─────────────────────────┐
     │                                         │
     ├─→ [CACHE MISS]                         │
     │                                         │
     ▼                                         │
  3. Load Applicable Policies                 │
     │                                         │
     ├─→ Filter by namespace                  │
     ├─→ Filter by tags                       │
     ├─→ Sort by priority                     │
     │                                         │
     ▼                                         │
  4. Rule Matching                             │
     │                                         │
     ├─→ For each rule (priority order):      │
     │   │                                     │
     │   ├─→ Check if enabled                 │
     │   ├─→ Evaluate conditions               │
     │   │   │                                 │
     │   │   ├─→ Parse expression (CEL)       │
     │   │   ├─→ Create sandbox                │
     │   │   ├─→ Execute with timeout         │
     │   │   ├─→ Return boolean result        │
     │   │   │                                 │
     │   │   └─→ [MATCH] ─────────┐           │
     │   │                        │           │
     │   └─→ [NO MATCH] ──────────┤           │
     │                            │           │
     ▼                            ▼           │
  5. Collect Matched Rules    Continue        │
     │                            │           │
     ▼                            │           │
  6. Conflict Resolution          │           │
     │                            │           │
     ├─→ Highest priority wins    │           │
     ├─→ Merge compatible actions │           │
     │                            │           │
     ▼                            ▼           │
  7. Apply Default Policy (if no matches)     │
     │                                         │
     ▼                                         │
  8. Execute Actions                           │
     │                                         │
     ├─→ Audit logging                        │
     ├─→ Metrics recording                    │
     ├─→ Alert triggering                     │
     │                                         │
     ▼                                         │
  9. Build PolicyDecision ◄───────────────────┘
     │
     ├─→ Cache result
     │
     ▼
  10. Return to caller

  Performance targets:
  - Cache hit: <100μs
  - Cache miss (simple rule): <500μs
  - Cache miss (complex rule): <2ms
  - P99 latency: <5ms
```

### Expression Evaluation

The engine supports two expression languages:

#### 1. CEL (Common Expression Language)

```rust
// src/runtime/expression.rs

use cel_interpreter::{Context, Program};

pub struct CelEvaluator {
    // Compiled CEL programs cache
    program_cache: Arc<RwLock<LruCache<String, Program>>>,
}

impl CelEvaluator {
    pub fn evaluate(
        &self,
        expression: &str,
        context: &EvaluationContext,
    ) -> Result<bool, EvaluationError> {
        // Get or compile program
        let program = self.get_or_compile(expression)?;

        // Create CEL context from evaluation context
        let cel_context = self.build_cel_context(context)?;

        // Execute with timeout
        let result = tokio::time::timeout(
            Duration::from_millis(100),
            async { program.execute(&cel_context) }
        ).await??;

        // Convert to boolean
        result.as_bool().ok_or(EvaluationError::TypeMismatch)
    }
}

// Example CEL expressions:
// - request.prompt.contains_pii()
// - request.estimated_cost > user.budget.remaining
// - rate_limit.requests_per_minute(user.id) > 60
```

#### 2. Custom DSL (YAML-based)

```rust
// Declarative condition matching

conditions:
  all:
    - field: "request.model"
      operator: "in"
      value: ["gpt-4", "claude-3-opus"]

    - field: "user.tier"
      operator: "not_equals"
      value: "premium"

    - any:
        - field: "request.estimated_cost"
          operator: "greater_than"
          value: 10.0

        - function: "rate_limit_exceeded"
          args:
            user: "{{ user.id }}"
            limit: 100
```

### Built-in Functions

```rust
// src/runtime/functions.rs

// PII Detection
pub fn contains_pii(text: &str) -> bool {
    // Use regex patterns or ML model
    PII_DETECTOR.scan(text).has_findings()
}

// Rate Limiting
pub fn rate_limit_exceeded(user_id: &str, limit: u32) -> bool {
    RATE_LIMITER.check(user_id, limit)
}

// Content Safety
pub fn content_safety_score(text: &str) -> f64 {
    SAFETY_CLASSIFIER.score(text)
}

// Cost Estimation
pub fn estimate_cost(model: &str, tokens: u64) -> f64 {
    COST_CALCULATOR.estimate(model, tokens)
}

// Time-based
pub fn is_business_hours() -> bool {
    let now = Local::now();
    now.hour() >= 9 && now.hour() < 17 && now.weekday().num_days_from_monday() < 5
}
```

### Sandbox Execution

```rust
// src/runtime/sandbox.rs

use wasmtime::*;

pub struct PolicySandbox {
    engine: Engine,
    resource_limits: ResourceLimits,
}

#[derive(Debug, Clone)]
pub struct ResourceLimits {
    pub max_memory_bytes: usize,
    pub max_execution_time_ms: u64,
    pub max_stack_size: usize,
}

impl PolicySandbox {
    pub fn new(limits: ResourceLimits) -> Result<Self> {
        let mut config = Config::new();
        config.max_wasm_stack(limits.max_stack_size);

        let engine = Engine::new(&config)?;

        Ok(Self { engine, resource_limits: limits })
    }

    pub async fn execute_policy(
        &self,
        wasm_module: &[u8],
        context: &EvaluationContext,
    ) -> Result<bool, SandboxError> {
        let store = Store::new(&self.engine, ());
        let module = Module::new(&self.engine, wasm_module)?;
        let instance = Instance::new(&mut store, &module, &[])?;

        // Get the evaluation function
        let eval_func = instance.get_typed_func::<(), i32>(&mut store, "evaluate")?;

        // Execute with timeout
        let result = tokio::time::timeout(
            Duration::from_millis(self.resource_limits.max_execution_time_ms),
            async { eval_func.call(&mut store, ()) }
        ).await??;

        Ok(result != 0)
    }
}
```

---

## Caching Architecture

### Multi-Level Cache Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                      Caching Architecture                       │
└─────────────────────────────────────────────────────────────────┘

L1: Thread-Local Cache (per-thread)
    ┌──────────────────────────────────────┐
    │  Recent Decisions (last 100)         │
    │  • No synchronization overhead       │
    │  • Ultra-fast lookup (<50ns)         │
    │  • TTL: 30 seconds                   │
    └──────────────────────────────────────┘
                     │
                     ▼
L2: Shared Decision Cache (process-wide)
    ┌──────────────────────────────────────┐
    │  LRU Cache (10,000 entries)          │
    │  • Arc<RwLock<LruCache>>             │
    │  • Content-addressed keys            │
    │  • TTL: 5 minutes                    │
    │  • Size: ~10MB                       │
    └──────────────────────────────────────┘
                     │
                     ▼
L3: Compiled Policy Cache (immutable)
    ┌──────────────────────────────────────┐
    │  Arc<CompiledPolicy>                 │
    │  • Zero-copy sharing                 │
    │  • Version-based invalidation        │
    │  • No TTL (version-based)            │
    └──────────────────────────────────────┘
                     │
                     ▼
L4: Distributed Cache (Redis - optional)
    ┌──────────────────────────────────────┐
    │  Shared across instances             │
    │  • TTL: 10 minutes                   │
    │  • Fallback on miss                  │
    │  • Async refresh                     │
    └──────────────────────────────────────┘
```

### Cache Key Generation

```rust
// src/cache/decision_cache.rs

use blake3::Hasher;

#[derive(Debug, Clone)]
pub struct CacheKey([u8; 32]);

impl CacheKey {
    pub fn from_context(
        policy_version: u64,
        context: &EvaluationContext,
    ) -> Self {
        let mut hasher = Hasher::new();

        // Include policy version
        hasher.update(&policy_version.to_le_bytes());

        // Hash deterministic context fields
        hasher.update(context.user.id.as_bytes());
        hasher.update(context.request.model.as_bytes());
        hasher.update(&context.request.estimated_cost.to_le_bytes());

        // Hash prompt (optional - might be large)
        if context.request.prompt.len() < 1024 {
            hasher.update(context.request.prompt.as_bytes());
        } else {
            // Hash only first 1KB for large prompts
            hasher.update(&context.request.prompt.as_bytes()[..1024]);
        }

        CacheKey(hasher.finalize().into())
    }
}
```

### Cache Implementation

```rust
// src/cache/decision_cache.rs

use lru::LruCache;
use parking_lot::RwLock;
use std::sync::Arc;
use std::time::{Duration, Instant};

pub struct DecisionCache {
    cache: Arc<RwLock<LruCache<CacheKey, CachedDecision>>>,
    ttl: Duration,
    metrics: CacheMetrics,
}

struct CachedDecision {
    decision: PolicyDecision,
    cached_at: Instant,
}

impl DecisionCache {
    pub fn new(capacity: usize, ttl: Duration) -> Self {
        Self {
            cache: Arc::new(RwLock::new(LruCache::new(capacity))),
            ttl,
            metrics: CacheMetrics::new(),
        }
    }

    pub fn get(&self, key: &CacheKey) -> Option<PolicyDecision> {
        let cache = self.cache.read();

        if let Some(cached) = cache.peek(key) {
            if cached.cached_at.elapsed() < self.ttl {
                self.metrics.hit();
                return Some(cached.decision.clone());
            }
        }

        self.metrics.miss();
        None
    }

    pub fn insert(&self, key: CacheKey, decision: PolicyDecision) {
        let mut cache = self.cache.write();
        cache.put(key, CachedDecision {
            decision,
            cached_at: Instant::now(),
        });
    }

    pub fn invalidate_all(&self) {
        let mut cache = self.cache.write();
        cache.clear();
    }
}
```

### Cache Warming

```rust
// Pre-warm cache with common patterns

impl PolicyEngine {
    pub async fn warm_cache(&self, patterns: Vec<EvaluationContext>) {
        for context in patterns {
            let _ = self.evaluate(&context).await;
        }
    }
}
```

---

## Policy Registry & Sync

### Registry Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Policy Registry System                      │
└─────────────────────────────────────────────────────────────────┘

                  Central Registry (Control Plane)
                  ┌─────────────────────────────┐
                  │  Policy Storage (S3/DB)     │
                  │  • Versioned policies       │
                  │  • Audit trail              │
                  │  • Access control           │
                  └─────────────┬───────────────┘
                                │
                  ┌─────────────▼───────────────┐
                  │  Registry API (gRPC)        │
                  │  • Publish policies         │
                  │  • Subscribe to updates     │
                  │  • Query by tags/namespace  │
                  └─────────────┬───────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
        ┌───────────┐   ┌───────────┐   ┌───────────┐
        │ Engine 1  │   │ Engine 2  │   │ Engine N  │
        │ (Daemon)  │   │ (Sidecar) │   │ (Embedded)│
        └───────────┘   └───────────┘   └───────────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                        Local Cache
                  ┌───────────▼───────────┐
                  │  • Last known good    │
                  │  • Offline operation  │
                  │  • Fast startup       │
                  └───────────────────────┘
```

### Sync Protocol

```rust
// src/registry/sync.rs

use tokio::sync::watch;
use tonic::{Request, Response, Status};

#[derive(Debug, Clone)]
pub struct PolicySync {
    registry_url: String,
    namespace: String,
    local_store: Arc<PolicyStore>,
    update_tx: watch::Sender<PolicyUpdate>,
}

#[derive(Debug, Clone)]
pub struct PolicyUpdate {
    pub policy: PolicyDocument,
    pub version: u64,
    pub action: UpdateAction,
}

#[derive(Debug, Clone, Copy)]
pub enum UpdateAction {
    Create,
    Update,
    Delete,
}

impl PolicySync {
    pub async fn start(&self) -> Result<(), SyncError> {
        // Initial sync
        self.full_sync().await?;

        // Start incremental sync (long-polling or WebSocket)
        let client = RegistryClient::connect(&self.registry_url).await?;

        let request = Request::new(SubscribeRequest {
            namespace: self.namespace.clone(),
            last_version: self.local_store.current_version(),
        });

        let mut stream = client.subscribe(request).await?.into_inner();

        // Process updates
        while let Some(update) = stream.message().await? {
            self.apply_update(update).await?;
        }

        Ok(())
    }

    async fn apply_update(&self, update: PolicyUpdate) -> Result<(), SyncError> {
        // Validate update
        validate_policy(&update.policy)?;

        // Apply to local store
        match update.action {
            UpdateAction::Create | UpdateAction::Update => {
                self.local_store.upsert(update.policy).await?;
            }
            UpdateAction::Delete => {
                self.local_store.delete(&update.policy.metadata.name).await?;
            }
        }

        // Notify subscribers
        self.update_tx.send(update)?;

        Ok(())
    }

    async fn full_sync(&self) -> Result<(), SyncError> {
        let client = RegistryClient::connect(&self.registry_url).await?;

        let request = Request::new(ListPoliciesRequest {
            namespace: self.namespace.clone(),
        });

        let response = client.list_policies(request).await?;

        for policy in response.into_inner().policies {
            self.local_store.upsert(policy).await?;
        }

        Ok(())
    }
}
```

### Version Control

```rust
// src/registry/version.rs

#[derive(Debug, Clone)]
pub struct VersionedPolicy {
    pub policy: PolicyDocument,
    pub version: u64,
    pub checksum: String,
    pub previous_version: Option<u64>,
}

impl VersionedPolicy {
    pub fn new(policy: PolicyDocument) -> Self {
        let checksum = Self::compute_checksum(&policy);

        Self {
            policy,
            version: 1,
            checksum,
            previous_version: None,
        }
    }

    pub fn next_version(&self, updated_policy: PolicyDocument) -> Self {
        Self {
            policy: updated_policy.clone(),
            version: self.version + 1,
            checksum: Self::compute_checksum(&updated_policy),
            previous_version: Some(self.version),
        }
    }

    fn compute_checksum(policy: &PolicyDocument) -> String {
        use blake3::Hasher;
        let serialized = serde_json::to_vec(policy).unwrap();
        Hasher::new().update(&serialized).finalize().to_hex().to_string()
    }
}
```

### Hot Reload

```rust
// src/registry/loader.rs

impl PolicyEngine {
    pub fn subscribe_updates(&self) -> watch::Receiver<PolicyUpdate> {
        self.update_rx.clone()
    }

    async fn handle_policy_update(&self, update: PolicyUpdate) {
        // Compile new policy
        let compiled = self.compiler.compile(&update.policy).await.unwrap();

        // Atomic swap
        let mut store = self.policy_store.write();
        store.insert(update.policy.metadata.name.clone(), compiled);

        // Invalidate caches
        self.decision_cache.invalidate_all();

        log::info!(
            "Hot-reloaded policy: {} (v{})",
            update.policy.metadata.name,
            update.version
        );
    }
}
```

---

## Integration APIs

### 1. LLM-Shield Integration

```rust
// src/integration/shield.rs

use llm_shield_client::ShieldClient;

pub struct ShieldIntegration {
    client: ShieldClient,
}

impl ShieldIntegration {
    pub async fn check_security(
        &self,
        context: &EvaluationContext,
    ) -> Result<SecurityCheckResult, ShieldError> {
        // Call LLM-Shield for security scanning
        let result = self.client.scan_prompt(&ScanRequest {
            prompt: context.request.prompt.clone(),
            user_id: context.user.id.clone(),
            metadata: context.metadata.clone(),
        }).await?;

        Ok(SecurityCheckResult {
            passed: result.score >= 0.7,
            score: result.score,
            threats: result.detected_threats,
            suggestions: result.remediation_suggestions,
        })
    }
}

// Policy rule using Shield integration
conditions:
  match: |
    shield.scan_prompt(request.prompt).passed == false
actions:
  - type: deny
    reason: "Security threat detected"
```

### 2. LLM-CostOps Integration

```rust
// src/integration/costops.rs

use llm_costops_client::CostOpsClient;

pub struct CostOpsIntegration {
    client: CostOpsClient,
}

impl CostOpsIntegration {
    pub async fn check_budget(
        &self,
        context: &EvaluationContext,
    ) -> Result<BudgetCheckResult, CostOpsError> {
        // Get current budget status
        let budget = self.client.get_budget(&context.user.id).await?;

        // Estimate request cost
        let cost = self.client.estimate_cost(&CostEstimateRequest {
            model: context.request.model.clone(),
            tokens: context.request.estimated_tokens,
        }).await?;

        Ok(BudgetCheckResult {
            within_budget: budget.remaining >= cost.total,
            remaining: budget.remaining,
            estimated_cost: cost.total,
            suggested_model: cost.cheaper_alternative,
        })
    }

    pub async fn record_usage(
        &self,
        user_id: &str,
        cost: f64,
    ) -> Result<(), CostOpsError> {
        self.client.record_usage(&UsageRecord {
            user_id: user_id.to_string(),
            amount: cost,
            timestamp: Utc::now(),
        }).await
    }
}
```

### 3. LLM-Governance Integration

```rust
// src/integration/governance.rs

use llm_governance_client::GovernanceClient;

pub struct GovernanceIntegration {
    client: GovernanceClient,
}

impl GovernanceIntegration {
    pub async fn log_decision(
        &self,
        context: &EvaluationContext,
        decision: &PolicyDecision,
    ) -> Result<(), GovernanceError> {
        self.client.log_event(&AuditEvent {
            event_type: "policy_decision".to_string(),
            user_id: context.user.id.clone(),
            decision: decision.decision,
            matched_rules: decision.matched_rules.clone(),
            context: serde_json::to_value(context)?,
            timestamp: Utc::now(),
            trace_id: context.trace_id.clone(),
        }).await
    }

    pub async fn export_audit_log(
        &self,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
    ) -> Result<Vec<AuditEvent>, GovernanceError> {
        self.client.query_events(&AuditQuery {
            start_time,
            end_time,
            filters: HashMap::new(),
        }).await
    }
}
```

### 4. LLM-Edge-Agent Integration

```rust
// src/integration/edge_agent.rs

use llm_edge_agent_client::EdgeAgentClient;

pub struct EdgeAgentIntegration {
    client: EdgeAgentClient,
}

impl EdgeAgentIntegration {
    pub async fn sync_policies(
        &self,
        policies: Vec<PolicyDocument>,
    ) -> Result<(), EdgeError> {
        // Push policies to edge agents
        self.client.update_policies(&PolicySyncRequest {
            policies,
            timestamp: Utc::now(),
        }).await
    }

    pub async fn get_edge_metrics(&self) -> Result<EdgeMetrics, EdgeError> {
        // Collect metrics from edge agents
        self.client.get_metrics().await
    }
}
```

### Unified Integration Layer

```rust
// src/integration/mod.rs

pub struct IntegrationHub {
    shield: Option<ShieldIntegration>,
    costops: Option<CostOpsIntegration>,
    governance: Option<GovernanceIntegration>,
    edge_agent: Option<EdgeAgentIntegration>,
}

impl IntegrationHub {
    pub async fn evaluate_with_integrations(
        &self,
        context: &EvaluationContext,
        decision: &PolicyDecision,
    ) -> Result<(), IntegrationError> {
        // Parallel integration calls
        let (shield_result, budget_result, _) = tokio::join!(
            async {
                if let Some(shield) = &self.shield {
                    shield.check_security(context).await.ok()
                } else {
                    None
                }
            },
            async {
                if let Some(costops) = &self.costops {
                    costops.check_budget(context).await.ok()
                } else {
                    None
                }
            },
            async {
                if let Some(governance) = &self.governance {
                    governance.log_decision(context, decision).await.ok()
                } else {
                    None
                }
            }
        );

        // Use results to enrich decision
        Ok(())
    }
}
```

---

## Deployment Models

### 1. Embedded Library

```rust
// Cargo.toml
[package]
name = "llm-policy-engine"
version = "0.1.0"

[lib]
crate-type = ["cdylib", "rlib"]

// Usage in application
use llm_policy_engine::{PolicyEngine, EvaluationContext};

#[tokio::main]
async fn main() {
    let engine = PolicyEngine::builder()
        .with_policy_file("./policies/security.yaml")
        .with_cache_capacity(10000)
        .build()
        .await
        .unwrap();

    let context = EvaluationContext {
        request: RequestContext {
            prompt: "Generate a SQL query".to_string(),
            model: "gpt-4".to_string(),
            estimated_cost: 0.05,
            estimated_tokens: 1000,
            context: HashMap::new(),
        },
        user: UserContext { /* ... */ },
        metadata: HashMap::new(),
        timestamp: Utc::now(),
        trace_id: "trace-123".to_string(),
    };

    let decision = engine.evaluate(&context).await.unwrap();

    match decision.decision {
        DecisionType::Allow => {
            // Proceed with LLM call
        }
        DecisionType::Deny => {
            // Block request
            eprintln!("Request denied: {}", decision.reason);
        }
        _ => {}
    }
}
```

### 2. Standalone Daemon

```rust
// src/daemon/server.rs

use tonic::{transport::Server, Request, Response, Status};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = DaemonConfig::from_file("/etc/policy-engine/config.yaml")?;

    let engine = PolicyEngine::builder()
        .with_registry_url(&config.registry_url)
        .with_namespace(&config.namespace)
        .build()
        .await?;

    let addr = config.listen_address.parse()?;

    Server::builder()
        .add_service(PolicyServiceServer::new(PolicyServiceImpl::new(engine)))
        .serve(addr)
        .await?;

    Ok(())
}

// gRPC Service
#[tonic::async_trait]
impl PolicyService for PolicyServiceImpl {
    async fn evaluate(
        &self,
        request: Request<EvaluateRequest>,
    ) -> Result<Response<EvaluateResponse>, Status> {
        let context = request.into_inner().context;

        let decision = self.engine
            .evaluate(&context)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(EvaluateResponse {
            decision: Some(decision),
        }))
    }
}
```

#### Daemon Configuration

```yaml
# /etc/policy-engine/config.yaml

server:
  listen_address: "0.0.0.0:50051"
  max_connections: 10000
  request_timeout_ms: 5000

registry:
  url: "https://policy-registry.example.com"
  namespace: "production"
  sync_interval_seconds: 60
  auth_token_file: "/var/run/secrets/registry-token"

cache:
  decision_cache_size: 10000
  decision_cache_ttl_seconds: 300
  policy_cache_size: 100

runtime:
  max_threads: 8
  sandbox_memory_limit_mb: 128
  sandbox_timeout_ms: 100

integrations:
  llm_shield:
    enabled: true
    url: "http://llm-shield:8080"

  llm_costops:
    enabled: true
    url: "http://llm-costops:8080"

  llm_governance:
    enabled: true
    url: "http://llm-governance:8080"

logging:
  level: info
  format: json
  output: stdout

metrics:
  enabled: true
  port: 9090
  path: /metrics
```

### 3. Sidecar Service

```yaml
# Kubernetes Deployment with Sidecar

apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-application
spec:
  replicas: 3
  template:
    spec:
      containers:
        # Main application
        - name: app
          image: my-llm-app:latest
          ports:
            - containerPort: 8080
          env:
            - name: POLICY_ENGINE_URL
              value: "http://localhost:50051"

        # Policy engine sidecar
        - name: policy-engine
          image: llm-policy-engine:latest
          ports:
            - containerPort: 50051  # gRPC
            - containerPort: 9090   # Metrics
          volumeMounts:
            - name: config
              mountPath: /etc/policy-engine
            - name: policies
              mountPath: /var/lib/policy-engine/policies
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            grpc:
              port: 50051
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            grpc:
              port: 50051
            initialDelaySeconds: 5
            periodSeconds: 5

      volumes:
        - name: config
          configMap:
            name: policy-engine-config
        - name: policies
          persistentVolumeClaim:
            claimName: policy-cache
```

#### Inter-Process Communication

```rust
// Application connects via gRPC to sidecar

use tonic::transport::Channel;

pub struct PolicyClient {
    client: PolicyServiceClient<Channel>,
}

impl PolicyClient {
    pub async fn connect(url: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let client = PolicyServiceClient::connect(url).await?;
        Ok(Self { client })
    }

    pub async fn check_policy(
        &mut self,
        context: EvaluationContext,
    ) -> Result<PolicyDecision, Box<dyn std::error::Error>> {
        let request = tonic::Request::new(EvaluateRequest {
            context: Some(context),
        });

        let response = self.client.evaluate(request).await?;

        Ok(response.into_inner().decision.unwrap())
    }
}
```

### Deployment Comparison

| Feature | Embedded | Daemon | Sidecar |
|---------|----------|--------|---------|
| **Latency** | <100μs | ~1ms (IPC) | ~500μs (localhost) |
| **Memory** | Shared | Separate process | Separate container |
| **Scaling** | Per app instance | Shared service | Per pod |
| **Updates** | Requires rebuild | Independent | Independent |
| **Isolation** | None | Process-level | Container-level |
| **Best For** | Low latency, simple | Shared policies | K8s deployments |

---

## Security & Sandboxing

### Threat Model

1. **Malicious Policies**: Untrusted policy code attempting to:
   - Execute arbitrary code
   - Access sensitive data
   - Consume excessive resources
   - Crash the engine

2. **Injection Attacks**: Crafted evaluation contexts designed to:
   - Bypass policy rules
   - Trigger edge cases
   - Cause evaluation errors

3. **DoS Attacks**: Requests designed to:
   - Consume CPU/memory
   - Trigger infinite loops
   - Overflow caches

### Security Measures

#### 1. WebAssembly Sandboxing

```rust
// All custom policy code runs in WASM sandbox

use wasmtime::*;

pub struct SecureRuntime {
    engine: Engine,
    limits: ResourceLimits,
}

impl SecureRuntime {
    pub fn new() -> Self {
        let mut config = Config::new();

        // Disable features that could be exploited
        config.wasm_bulk_memory(false);
        config.wasm_multi_memory(false);
        config.wasm_threads(false);

        // Enable resource limits
        config.max_wasm_stack(1024 * 1024); // 1MB stack

        let engine = Engine::new(&config).unwrap();

        Self {
            engine,
            limits: ResourceLimits {
                max_memory_bytes: 16 * 1024 * 1024, // 16MB
                max_execution_time_ms: 100,
                max_stack_size: 1024 * 1024,
            },
        }
    }

    pub async fn execute_untrusted(
        &self,
        code: &[u8],
        context: &EvaluationContext,
    ) -> Result<bool, RuntimeError> {
        // Create isolated store
        let mut store = Store::new(&self.engine, ());

        // Set memory limits
        store.limiter(|_| &mut MemoryLimiter::new(self.limits.max_memory_bytes));

        // Load and instantiate module
        let module = Module::new(&self.engine, code)?;
        let instance = Instance::new(&mut store, &module, &[])?;

        // Execute with timeout
        let result = tokio::time::timeout(
            Duration::from_millis(self.limits.max_execution_time_ms),
            async {
                let eval_func = instance
                    .get_typed_func::<(), i32>(&mut store, "evaluate")?;
                eval_func.call(&mut store, ())
            }
        ).await??;

        Ok(result != 0)
    }
}

struct MemoryLimiter {
    max_bytes: usize,
}

impl ResourceLimiter for MemoryLimiter {
    fn memory_growing(&mut self, current: usize, desired: usize, _maximum: Option<usize>) -> bool {
        desired <= self.max_bytes
    }
}
```

#### 2. Input Validation

```rust
// Strict validation of evaluation contexts

use validator::Validate;

#[derive(Debug, Validate, Deserialize)]
pub struct EvaluationContext {
    #[validate(length(max = 100000))]
    pub request: RequestContext,

    pub user: UserContext,

    #[validate(length(max = 1000))]
    pub metadata: HashMap<String, serde_json::Value>,

    pub timestamp: DateTime<Utc>,

    #[validate(length(min = 1, max = 64))]
    pub trace_id: String,
}

impl PolicyEngine {
    pub async fn evaluate(
        &self,
        context: &EvaluationContext,
    ) -> Result<PolicyDecision, EvaluationError> {
        // Validate input
        context.validate()
            .map_err(|e| EvaluationError::InvalidContext(e.to_string()))?;

        // Sanitize strings
        let sanitized_context = self.sanitize_context(context)?;

        // Proceed with evaluation
        self.evaluate_internal(&sanitized_context).await
    }
}
```

#### 3. Rate Limiting

```rust
// Protect against DoS

use governor::{Quota, RateLimiter};

pub struct RateLimitedEngine {
    engine: PolicyEngine,
    limiter: RateLimiter<String, DefaultKeyedStateStore<String>, DefaultClock>,
}

impl RateLimitedEngine {
    pub async fn evaluate(
        &self,
        context: &EvaluationContext,
    ) -> Result<PolicyDecision, EvaluationError> {
        // Check rate limit
        self.limiter
            .check_key(&context.user.id)
            .map_err(|_| EvaluationError::RateLimitExceeded)?;

        // Proceed with evaluation
        self.engine.evaluate(context).await
    }
}
```

#### 4. Audit Logging

```rust
// Comprehensive audit trail

impl PolicyEngine {
    async fn evaluate_internal(
        &self,
        context: &EvaluationContext,
    ) -> Result<PolicyDecision, EvaluationError> {
        let start = Instant::now();

        let decision = self.evaluate_rules(context).await;

        // Always log decision (success or failure)
        self.audit_logger.log(AuditEvent {
            event_type: "policy_evaluation".to_string(),
            user_id: context.user.id.clone(),
            trace_id: context.trace_id.clone(),
            decision: decision.as_ref().ok().map(|d| d.decision),
            error: decision.as_ref().err().map(|e| e.to_string()),
            matched_rules: decision.as_ref().ok()
                .map(|d| d.matched_rules.clone())
                .unwrap_or_default(),
            evaluation_time_us: start.elapsed().as_micros() as u64,
            timestamp: Utc::now(),
            context_hash: Self::hash_context(context),
        }).await;

        decision
    }
}
```

---

## Performance Characteristics

### Latency Targets

```
Operation                    | P50    | P95    | P99    | Max
-----------------------------|--------|--------|--------|--------
Cache hit                    | 50μs   | 100μs  | 200μs  | 500μs
Simple rule (cache miss)     | 200μs  | 500μs  | 1ms    | 5ms
Complex rule (10+ conditions)| 500μs  | 2ms    | 5ms    | 10ms
Custom WASM policy           | 1ms    | 5ms    | 10ms   | 50ms
Full integration check       | 2ms    | 10ms   | 20ms   | 100ms
```

### Throughput

```
Deployment Mode    | RPS/Core | Total RPS (8 cores)
-------------------|----------|--------------------
Embedded (cached)  | 50,000   | 400,000
Embedded (uncached)| 5,000    | 40,000
Daemon (gRPC)      | 2,000    | 16,000
Sidecar (HTTP)     | 1,500    | 12,000
```

### Resource Usage

```
Component              | Memory    | CPU (idle) | CPU (peak)
-----------------------|-----------|------------|------------
Policy Engine Core     | 50MB      | 0.1%       | 5%
Decision Cache (10k)   | 10MB      | 0%         | 0%
Policy Store (100)     | 5MB       | 0%         | 0%
WASM Runtime           | 20MB      | 0%         | 10%
Integration Clients    | 10MB      | 0.1%       | 2%
Total                  | ~95MB     | 0.3%       | 17%
```

### Benchmark Suite

```rust
// benches/policy_evaluation.rs

use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark_cache_hit(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let engine = rt.block_on(async {
        PolicyEngine::builder()
            .with_policy_file("./benches/fixtures/policy.yaml")
            .build()
            .await
            .unwrap()
    });

    let context = create_test_context();

    // Warm cache
    rt.block_on(async { engine.evaluate(&context).await.unwrap() });

    c.bench_function("cache_hit", |b| {
        b.to_async(&rt).iter(|| async {
            black_box(engine.evaluate(&context).await.unwrap())
        })
    });
}

fn benchmark_simple_rule(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let engine = rt.block_on(async {
        PolicyEngine::builder()
            .with_policy_file("./benches/fixtures/simple_policy.yaml")
            .with_cache_enabled(false)
            .build()
            .await
            .unwrap()
    });

    c.bench_function("simple_rule_evaluation", |b| {
        b.to_async(&rt).iter(|| async {
            let context = create_test_context();
            black_box(engine.evaluate(&context).await.unwrap())
        })
    });
}

criterion_group!(benches, benchmark_cache_hit, benchmark_simple_rule);
criterion_main!(benches);
```

---

## API Specifications

### gRPC Protocol Definition

```protobuf
// proto/policy_engine.proto

syntax = "proto3";

package llm.policy.v1;

service PolicyService {
  // Evaluate a policy decision
  rpc Evaluate(EvaluateRequest) returns (EvaluateResponse);

  // Load or update a policy
  rpc LoadPolicy(LoadPolicyRequest) returns (LoadPolicyResponse);

  // Subscribe to policy updates
  rpc SubscribeUpdates(SubscribeRequest) returns (stream PolicyUpdate);

  // Health check
  rpc Health(HealthRequest) returns (HealthResponse);
}

message EvaluateRequest {
  EvaluationContext context = 1;
  repeated string policy_ids = 2; // Optional: specific policies to evaluate
}

message EvaluateResponse {
  PolicyDecision decision = 1;
}

message EvaluationContext {
  RequestContext request = 1;
  UserContext user = 2;
  map<string, string> metadata = 3;
  int64 timestamp_ms = 4;
  string trace_id = 5;
}

message RequestContext {
  string prompt = 1;
  string model = 2;
  double estimated_cost = 3;
  uint64 estimated_tokens = 4;
  map<string, string> context = 5;
}

message UserContext {
  string id = 1;
  string role = 2;
  string tier = 3;
  string team = 4;
  BudgetInfo budget = 5;
  QuotaInfo quota = 6;
}

message PolicyDecision {
  DecisionType decision = 1;
  string reason = 2;
  repeated string matched_rules = 3;
  repeated ActionResult actions = 4;
  map<string, string> metadata = 5;
  uint64 evaluation_time_us = 6;
  bool from_cache = 7;
}

enum DecisionType {
  ALLOW = 0;
  DENY = 1;
  THROTTLE = 2;
  ALLOW_WITH_WARNING = 3;
}

message LoadPolicyRequest {
  string policy_yaml = 1;
  bool validate_only = 2;
}

message LoadPolicyResponse {
  bool success = 1;
  repeated string errors = 2;
  string policy_id = 3;
}

message SubscribeRequest {
  string namespace = 1;
  uint64 last_version = 2;
}

message PolicyUpdate {
  string policy_id = 1;
  string policy_yaml = 2;
  uint64 version = 3;
  UpdateAction action = 4;
}

enum UpdateAction {
  CREATE = 0;
  UPDATE = 1;
  DELETE = 2;
}
```

### REST API

```
POST /v1/evaluate
Content-Type: application/json

Request:
{
  "context": {
    "request": {
      "prompt": "Generate a SQL query",
      "model": "gpt-4",
      "estimated_cost": 0.05,
      "estimated_tokens": 1000
    },
    "user": {
      "id": "user-123",
      "role": "developer",
      "tier": "premium"
    },
    "trace_id": "trace-abc-123"
  }
}

Response:
{
  "decision": "allow",
  "reason": "All policies passed",
  "matched_rules": ["default-allow"],
  "actions": [
    {
      "action_type": "allow",
      "applied": true
    }
  ],
  "evaluation_time_us": 250,
  "from_cache": false
}
```

---

## Deployment Patterns

### High Availability Setup

```
                        Load Balancer
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
   │  Engine 1   │   │  Engine 2   │   │  Engine 3   │
   │ (Primary)   │   │ (Replica)   │   │ (Replica)   │
   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                    ┌────────▼────────┐
                    │ Redis (Cache)   │
                    │ • Decision cache│
                    │ • Distributed   │
                    └─────────────────┘
                             │
                    ┌────────▼────────┐
                    │ Policy Registry │
                    │ • S3 + DynamoDB │
                    │ • Versioned     │
                    └─────────────────┘
```

### Edge Deployment

```
         Central Cloud
    ┌─────────────────────┐
    │  Policy Registry    │
    │  • Master policies  │
    │  • Analytics        │
    └──────────┬──────────┘
               │
     ┌─────────┼─────────┐
     │         │         │
     ▼         ▼         ▼
  Edge 1    Edge 2    Edge 3
  ┌─────┐   ┌─────┐   ┌─────┐
  │ PE  │   │ PE  │   │ PE  │
  │Cache│   │Cache│   │Cache│
  └─────┘   └─────┘   └─────┘
  Offline   Offline   Offline
  capable   capable   capable
```

---

This architecture provides a comprehensive foundation for the LLM-Policy-Engine, balancing performance, security, and flexibility while enabling seamless integration with the broader LLM infrastructure ecosystem.
