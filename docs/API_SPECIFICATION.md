# LLM-Policy-Engine API Specification

## Overview

This document provides detailed API specifications for all interfaces exposed by the LLM-Policy-Engine.

## Table of Contents

1. [Core Library API](#core-library-api)
2. [gRPC API](#grpc-api)
3. [REST API](#rest-api)
4. [Integration APIs](#integration-apis)
5. [CLI Interface](#cli-interface)

---

## Core Library API

### PolicyEngine

The main entry point for embedded usage.

```rust
use llm_policy_engine::{PolicyEngine, EvaluationContext, PolicyDecision};

pub struct PolicyEngine {
    // Private fields
}

impl PolicyEngine {
    /// Create a new PolicyEngine builder
    pub fn builder() -> PolicyEngineBuilder {
        PolicyEngineBuilder::new()
    }

    /// Evaluate a policy decision
    pub async fn evaluate(
        &self,
        context: &EvaluationContext,
    ) -> Result<PolicyDecision, EvaluationError> {
        // Implementation
    }

    /// Load a policy from a file
    pub async fn load_policy_file(
        &mut self,
        path: &str,
    ) -> Result<String, LoadError> {
        // Returns policy ID
    }

    /// Load a policy from a string (YAML/JSON)
    pub async fn load_policy_string(
        &mut self,
        policy_yaml: &str,
    ) -> Result<String, LoadError> {
        // Returns policy ID
    }

    /// Unload a policy
    pub async fn unload_policy(
        &mut self,
        policy_id: &str,
    ) -> Result<(), UnloadError> {
        // Implementation
    }

    /// Subscribe to policy updates
    pub fn subscribe_updates(&self) -> watch::Receiver<PolicyUpdate> {
        // Implementation
    }

    /// Get current metrics
    pub fn metrics(&self) -> EngineMetrics {
        // Implementation
    }

    /// Warm cache with common patterns
    pub async fn warm_cache(
        &self,
        patterns: Vec<EvaluationContext>,
    ) -> Result<(), CacheError> {
        // Implementation
    }
}
```

### PolicyEngineBuilder

```rust
pub struct PolicyEngineBuilder {
    // Configuration fields
}

impl PolicyEngineBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the policy registry URL for remote sync
    pub fn with_registry_url(mut self, url: &str) -> Self {
        self.registry_url = Some(url.to_string());
        self
    }

    /// Set the policy namespace
    pub fn with_namespace(mut self, namespace: &str) -> Self {
        self.namespace = namespace.to_string();
        self
    }

    /// Load policies from a file
    pub fn with_policy_file(mut self, path: &str) -> Self {
        self.policy_files.push(path.to_string());
        self
    }

    /// Load policies from a directory
    pub fn with_policy_dir(mut self, path: &str) -> Self {
        self.policy_dirs.push(path.to_string());
        self
    }

    /// Set cache capacity
    pub fn with_cache_capacity(mut self, capacity: usize) -> Self {
        self.cache_capacity = capacity;
        self
    }

    /// Set cache TTL
    pub fn with_cache_ttl(mut self, ttl: Duration) -> Self {
        self.cache_ttl = ttl;
        self
    }

    /// Enable/disable caching
    pub fn with_cache_enabled(mut self, enabled: bool) -> Self {
        self.cache_enabled = enabled;
        self
    }

    /// Set sandbox resource limits
    pub fn with_sandbox_limits(mut self, limits: ResourceLimits) -> Self {
        self.sandbox_limits = limits;
        self
    }

    /// Enable integrations
    pub fn with_shield_integration(mut self, url: &str) -> Self {
        self.shield_url = Some(url.to_string());
        self
    }

    pub fn with_costops_integration(mut self, url: &str) -> Self {
        self.costops_url = Some(url.to_string());
        self
    }

    pub fn with_governance_integration(mut self, url: &str) -> Self {
        self.governance_url = Some(url.to_string());
        self
    }

    /// Build the PolicyEngine
    pub async fn build(self) -> Result<PolicyEngine, BuildError> {
        // Implementation
    }
}
```

### EvaluationContext

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvaluationContext {
    /// Request information
    pub request: RequestContext,

    /// User information
    pub user: UserContext,

    /// Additional metadata
    pub metadata: HashMap<String, serde_json::Value>,

    /// Timestamp of the evaluation
    pub timestamp: DateTime<Utc>,

    /// Distributed tracing ID
    pub trace_id: String,
}

impl EvaluationContext {
    /// Create a new builder
    pub fn builder() -> EvaluationContextBuilder {
        EvaluationContextBuilder::new()
    }

    /// Validate the context
    pub fn validate(&self) -> Result<(), ValidationError> {
        // Implementation
    }
}
```

### PolicyDecision

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDecision {
    /// The final decision
    pub decision: DecisionType,

    /// Human-readable reason
    pub reason: String,

    /// List of matched rule IDs
    pub matched_rules: Vec<String>,

    /// Actions that were executed
    pub actions: Vec<ActionResult>,

    /// Additional metadata
    pub metadata: HashMap<String, serde_json::Value>,

    /// Evaluation time in microseconds
    pub evaluation_time_us: u64,

    /// Whether this decision came from cache
    pub from_cache: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum DecisionType {
    /// Allow the request
    Allow,

    /// Deny the request
    Deny,

    /// Throttle the request
    Throttle,

    /// Allow with a warning
    AllowWithWarning,
}

impl PolicyDecision {
    /// Check if the request is allowed
    pub fn is_allowed(&self) -> bool {
        matches!(self.decision, DecisionType::Allow | DecisionType::AllowWithWarning)
    }

    /// Check if the request is denied
    pub fn is_denied(&self) -> bool {
        matches!(self.decision, DecisionType::Deny)
    }

    /// Get throttle delay if applicable
    pub fn throttle_delay(&self) -> Option<Duration> {
        // Implementation
    }
}
```

### Error Types

```rust
#[derive(Debug, thiserror::Error)]
pub enum EvaluationError {
    #[error("Invalid context: {0}")]
    InvalidContext(String),

    #[error("Policy not found: {0}")]
    PolicyNotFound(String),

    #[error("Evaluation timeout")]
    Timeout,

    #[error("Sandbox error: {0}")]
    SandboxError(String),

    #[error("Expression error: {0}")]
    ExpressionError(String),

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("Invalid policy document: {0}")]
    InvalidPolicy(String),

    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Policy conflict: {0}")]
    Conflict(String),
}
```

---

## gRPC API

### Service Definition

```protobuf
syntax = "proto3";

package llm.policy.v1;

import "google/protobuf/timestamp.proto";
import "google/protobuf/struct.proto";

// Main policy evaluation service
service PolicyService {
  // Evaluate a policy decision
  rpc Evaluate(EvaluateRequest) returns (EvaluateResponse);

  // Batch evaluate multiple contexts
  rpc EvaluateBatch(EvaluateBatchRequest) returns (EvaluateBatchResponse);

  // Stream evaluation requests
  rpc EvaluateStream(stream EvaluateRequest) returns (stream EvaluateResponse);

  // Load a new policy
  rpc LoadPolicy(LoadPolicyRequest) returns (LoadPolicyResponse);

  // Unload a policy
  rpc UnloadPolicy(UnloadPolicyRequest) returns (UnloadPolicyResponse);

  // List loaded policies
  rpc ListPolicies(ListPoliciesRequest) returns (ListPoliciesResponse);

  // Get policy details
  rpc GetPolicy(GetPolicyRequest) returns (GetPolicyResponse);

  // Subscribe to policy updates
  rpc SubscribeUpdates(SubscribeRequest) returns (stream PolicyUpdate);

  // Get engine metrics
  rpc GetMetrics(GetMetricsRequest) returns (GetMetricsResponse);

  // Health check
  rpc Health(HealthRequest) returns (HealthResponse);
}

// Evaluation request
message EvaluateRequest {
  // Evaluation context
  EvaluationContext context = 1;

  // Optional: specific policies to evaluate (default: all)
  repeated string policy_ids = 2;

  // Optional: bypass cache
  bool bypass_cache = 3;

  // Optional: dry run mode (don't apply actions)
  bool dry_run = 4;
}

message EvaluateResponse {
  PolicyDecision decision = 1;
}

// Batch evaluation
message EvaluateBatchRequest {
  repeated EvaluateRequest requests = 1;

  // Process in parallel
  bool parallel = 2;
}

message EvaluateBatchResponse {
  repeated EvaluateResponse responses = 1;
  uint64 total_evaluation_time_us = 2;
}

// Evaluation context
message EvaluationContext {
  RequestContext request = 1;
  UserContext user = 2;
  map<string, string> metadata = 3;
  google.protobuf.Timestamp timestamp = 4;
  string trace_id = 5;
}

message RequestContext {
  string prompt = 1;
  string model = 2;
  double estimated_cost = 3;
  uint64 estimated_tokens = 4;
  map<string, string> context = 5;
  repeated string tags = 6;
}

message UserContext {
  string id = 1;
  string role = 2;
  string tier = 3;
  string team = 4;
  BudgetInfo budget = 5;
  QuotaInfo quota = 6;
  map<string, string> attributes = 7;
}

message BudgetInfo {
  double total = 1;
  double remaining = 2;
  string period = 3;
  google.protobuf.Timestamp reset_at = 4;
}

message QuotaInfo {
  uint64 tokens_total = 1;
  uint64 tokens_remaining = 2;
  uint32 requests_per_minute = 3;
  uint32 current_requests = 4;
}

// Policy decision
message PolicyDecision {
  DecisionType decision = 1;
  string reason = 2;
  repeated string matched_rules = 3;
  repeated ActionResult actions = 4;
  map<string, string> metadata = 5;
  uint64 evaluation_time_us = 6;
  bool from_cache = 7;
  google.protobuf.Timestamp timestamp = 8;
}

enum DecisionType {
  DECISION_TYPE_UNSPECIFIED = 0;
  DECISION_TYPE_ALLOW = 1;
  DECISION_TYPE_DENY = 2;
  DECISION_TYPE_THROTTLE = 3;
  DECISION_TYPE_ALLOW_WITH_WARNING = 4;
}

message ActionResult {
  ActionType action_type = 1;
  bool applied = 2;
  string error = 3;
  map<string, string> metadata = 4;
}

enum ActionType {
  ACTION_TYPE_UNSPECIFIED = 0;
  ACTION_TYPE_ALLOW = 1;
  ACTION_TYPE_DENY = 2;
  ACTION_TYPE_THROTTLE = 3;
  ACTION_TYPE_AUDIT = 4;
  ACTION_TYPE_LOG = 5;
  ACTION_TYPE_REDACT = 6;
  ACTION_TYPE_SUGGEST_ALTERNATIVE = 7;
  ACTION_TYPE_WARN = 8;
}

// Policy management
message LoadPolicyRequest {
  string policy_yaml = 1;
  bool validate_only = 2;
  bool replace_existing = 3;
}

message LoadPolicyResponse {
  bool success = 1;
  repeated string errors = 2;
  string policy_id = 3;
  uint64 revision = 4;
}

message UnloadPolicyRequest {
  string policy_id = 1;
}

message UnloadPolicyResponse {
  bool success = 1;
  string error = 2;
}

message ListPoliciesRequest {
  string namespace = 1;
  repeated string tags = 2;
  bool enabled_only = 3;
}

message ListPoliciesResponse {
  repeated PolicySummary policies = 1;
}

message PolicySummary {
  string id = 1;
  string name = 2;
  string namespace = 3;
  repeated string tags = 4;
  bool enabled = 5;
  uint64 revision = 6;
  google.protobuf.Timestamp updated_at = 7;
}

message GetPolicyRequest {
  string policy_id = 1;
}

message GetPolicyResponse {
  string policy_yaml = 1;
  PolicySummary summary = 2;
}

// Update subscription
message SubscribeRequest {
  string namespace = 1;
  repeated string tags = 2;
  uint64 last_version = 3;
}

message PolicyUpdate {
  string policy_id = 1;
  string policy_yaml = 2;
  uint64 version = 3;
  UpdateAction action = 4;
  google.protobuf.Timestamp timestamp = 5;
}

enum UpdateAction {
  UPDATE_ACTION_UNSPECIFIED = 0;
  UPDATE_ACTION_CREATE = 1;
  UPDATE_ACTION_UPDATE = 2;
  UPDATE_ACTION_DELETE = 3;
}

// Metrics
message GetMetricsRequest {
  bool include_cache_stats = 1;
  bool include_performance_stats = 2;
}

message GetMetricsResponse {
  uint64 total_evaluations = 1;
  uint64 cache_hits = 2;
  uint64 cache_misses = 3;
  double cache_hit_rate = 4;
  PerformanceStats performance = 5;
  CacheStats cache_stats = 6;
}

message PerformanceStats {
  uint64 p50_latency_us = 1;
  uint64 p95_latency_us = 2;
  uint64 p99_latency_us = 3;
  uint64 max_latency_us = 4;
  double avg_latency_us = 5;
}

message CacheStats {
  uint64 size = 1;
  uint64 capacity = 2;
  uint64 evictions = 3;
  uint64 memory_bytes = 4;
}

// Health check
message HealthRequest {}

message HealthResponse {
  HealthStatus status = 1;
  string message = 2;
  map<string, string> details = 3;
}

enum HealthStatus {
  HEALTH_STATUS_UNSPECIFIED = 0;
  HEALTH_STATUS_HEALTHY = 1;
  HEALTH_STATUS_DEGRADED = 2;
  HEALTH_STATUS_UNHEALTHY = 3;
}
```

### gRPC Client Example (Rust)

```rust
use tonic::transport::Channel;
use llm_policy_engine_proto::policy_service_client::PolicyServiceClient;
use llm_policy_engine_proto::*;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Connect to the policy engine
    let mut client = PolicyServiceClient::connect("http://localhost:50051").await?;

    // Create evaluation request
    let request = tonic::Request::new(EvaluateRequest {
        context: Some(EvaluationContext {
            request: Some(RequestContext {
                prompt: "Generate SQL query".to_string(),
                model: "gpt-4".to_string(),
                estimated_cost: 0.05,
                estimated_tokens: 1000,
                context: Default::default(),
                tags: vec![],
            }),
            user: Some(UserContext {
                id: "user-123".to_string(),
                role: "developer".to_string(),
                tier: "premium".to_string(),
                team: "engineering".to_string(),
                budget: Some(BudgetInfo {
                    total: 1000.0,
                    remaining: 500.0,
                    period: "monthly".to_string(),
                    reset_at: None,
                }),
                quota: Some(QuotaInfo {
                    tokens_total: 1000000,
                    tokens_remaining: 500000,
                    requests_per_minute: 60,
                    current_requests: 10,
                }),
                attributes: Default::default(),
            }),
            metadata: Default::default(),
            timestamp: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            trace_id: "trace-abc-123".to_string(),
        }),
        policy_ids: vec![],
        bypass_cache: false,
        dry_run: false,
    });

    // Evaluate
    let response = client.evaluate(request).await?;
    let decision = response.into_inner().decision.unwrap();

    println!("Decision: {:?}", decision.decision);
    println!("Reason: {}", decision.reason);
    println!("Evaluation time: {}μs", decision.evaluation_time_us);

    Ok(())
}
```

### gRPC Client Example (Python)

```python
import grpc
from google.protobuf.timestamp_pb2 import Timestamp
from llm_policy_engine_pb2 import *
from llm_policy_engine_pb2_grpc import PolicyServiceStub

def main():
    # Create channel
    channel = grpc.insecure_channel('localhost:50051')
    client = PolicyServiceStub(channel)

    # Create request
    timestamp = Timestamp()
    timestamp.GetCurrentTime()

    request = EvaluateRequest(
        context=EvaluationContext(
            request=RequestContext(
                prompt="Generate SQL query",
                model="gpt-4",
                estimated_cost=0.05,
                estimated_tokens=1000
            ),
            user=UserContext(
                id="user-123",
                role="developer",
                tier="premium",
                team="engineering",
                budget=BudgetInfo(
                    total=1000.0,
                    remaining=500.0,
                    period="monthly"
                )
            ),
            timestamp=timestamp,
            trace_id="trace-abc-123"
        )
    )

    # Evaluate
    response = client.Evaluate(request)
    decision = response.decision

    print(f"Decision: {DecisionType.Name(decision.decision)}")
    print(f"Reason: {decision.reason}")
    print(f"Evaluation time: {decision.evaluation_time_us}μs")

if __name__ == '__main__':
    main()
```

---

## REST API

### Base URL

```
http://localhost:8080/v1
```

### Authentication

```
Authorization: Bearer <token>
```

### Endpoints

#### POST /v1/evaluate

Evaluate a policy decision.

**Request:**

```json
{
  "context": {
    "request": {
      "prompt": "Generate a SQL query",
      "model": "gpt-4",
      "estimated_cost": 0.05,
      "estimated_tokens": 1000,
      "context": {
        "temperature": "0.7"
      },
      "tags": ["sql", "generation"]
    },
    "user": {
      "id": "user-123",
      "role": "developer",
      "tier": "premium",
      "team": "engineering",
      "budget": {
        "total": 1000.0,
        "remaining": 500.0,
        "period": "monthly",
        "reset_at": "2025-12-01T00:00:00Z"
      },
      "quota": {
        "tokens_total": 1000000,
        "tokens_remaining": 500000,
        "requests_per_minute": 60,
        "current_requests": 10
      },
      "attributes": {
        "department": "engineering"
      }
    },
    "metadata": {
      "source": "web-ui",
      "session_id": "sess-456"
    },
    "timestamp": "2025-11-17T12:00:00Z",
    "trace_id": "trace-abc-123"
  },
  "policy_ids": ["security-policy", "budget-policy"],
  "bypass_cache": false,
  "dry_run": false
}
```

**Response (200 OK):**

```json
{
  "decision": "allow",
  "reason": "All policies passed",
  "matched_rules": ["default-allow"],
  "actions": [
    {
      "action_type": "allow",
      "applied": true,
      "metadata": {}
    },
    {
      "action_type": "audit",
      "applied": true,
      "metadata": {
        "severity": "info"
      }
    }
  ],
  "metadata": {
    "policy_version": "42"
  },
  "evaluation_time_us": 250,
  "from_cache": false,
  "timestamp": "2025-11-17T12:00:00.250Z"
}
```

**Response (200 OK - Denied):**

```json
{
  "decision": "deny",
  "reason": "Budget exceeded",
  "matched_rules": ["enforce-budget"],
  "actions": [
    {
      "action_type": "deny",
      "applied": true,
      "metadata": {
        "remaining_budget": "0.00",
        "requested_cost": "0.05"
      }
    },
    {
      "action_type": "suggest_alternative",
      "applied": true,
      "metadata": {
        "model": "gpt-3.5-turbo"
      }
    }
  ],
  "metadata": {},
  "evaluation_time_us": 180,
  "from_cache": true,
  "timestamp": "2025-11-17T12:00:00.180Z"
}
```

**Error Response (400 Bad Request):**

```json
{
  "error": "invalid_request",
  "message": "Invalid context: prompt exceeds maximum length",
  "details": {
    "field": "context.request.prompt",
    "max_length": 100000,
    "actual_length": 150000
  }
}
```

**Error Response (500 Internal Server Error):**

```json
{
  "error": "internal_error",
  "message": "Policy evaluation failed",
  "details": {
    "trace_id": "trace-abc-123"
  }
}
```

#### POST /v1/evaluate/batch

Batch evaluate multiple contexts.

**Request:**

```json
{
  "requests": [
    {
      "context": { /* ... */ }
    },
    {
      "context": { /* ... */ }
    }
  ],
  "parallel": true
}
```

**Response:**

```json
{
  "responses": [
    {
      "decision": "allow",
      "reason": "...",
      "matched_rules": ["..."],
      "actions": [],
      "evaluation_time_us": 200
    },
    {
      "decision": "deny",
      "reason": "...",
      "matched_rules": ["..."],
      "actions": [],
      "evaluation_time_us": 150
    }
  ],
  "total_evaluation_time_us": 350
}
```

#### POST /v1/policies

Load a new policy.

**Request:**

```json
{
  "policy_yaml": "...",
  "validate_only": false,
  "replace_existing": true
}
```

**Response:**

```json
{
  "success": true,
  "errors": [],
  "policy_id": "security-policy-v2",
  "revision": 43
}
```

#### DELETE /v1/policies/{policy_id}

Unload a policy.

**Response:**

```json
{
  "success": true
}
```

#### GET /v1/policies

List all loaded policies.

**Query Parameters:**
- `namespace` (optional): Filter by namespace
- `tags` (optional): Filter by tags (comma-separated)
- `enabled_only` (optional): Only return enabled policies

**Response:**

```json
{
  "policies": [
    {
      "id": "security-policy",
      "name": "Security Policy",
      "namespace": "production",
      "tags": ["security", "compliance"],
      "enabled": true,
      "revision": 42,
      "updated_at": "2025-11-17T10:00:00Z"
    }
  ]
}
```

#### GET /v1/policies/{policy_id}

Get policy details.

**Response:**

```json
{
  "policy_yaml": "...",
  "summary": {
    "id": "security-policy",
    "name": "Security Policy",
    "namespace": "production",
    "tags": ["security"],
    "enabled": true,
    "revision": 42,
    "updated_at": "2025-11-17T10:00:00Z"
  }
}
```

#### GET /v1/metrics

Get engine metrics.

**Query Parameters:**
- `include_cache_stats` (optional): Include cache statistics
- `include_performance_stats` (optional): Include performance statistics

**Response:**

```json
{
  "total_evaluations": 1000000,
  "cache_hits": 800000,
  "cache_misses": 200000,
  "cache_hit_rate": 0.8,
  "performance": {
    "p50_latency_us": 200,
    "p95_latency_us": 500,
    "p99_latency_us": 1000,
    "max_latency_us": 5000,
    "avg_latency_us": 250
  },
  "cache_stats": {
    "size": 8000,
    "capacity": 10000,
    "evictions": 1200,
    "memory_bytes": 10485760
  }
}
```

#### GET /v1/health

Health check.

**Response:**

```json
{
  "status": "healthy",
  "message": "All systems operational",
  "details": {
    "policies_loaded": "5",
    "cache_enabled": "true",
    "registry_connected": "true"
  }
}
```

---

## Integration APIs

### LLM-Shield Integration

```rust
// Shield integration trait
#[async_trait]
pub trait ShieldIntegration: Send + Sync {
    async fn scan_prompt(
        &self,
        prompt: &str,
        user_id: &str,
    ) -> Result<SecurityScanResult, ShieldError>;

    async fn scan_response(
        &self,
        response: &str,
        user_id: &str,
    ) -> Result<SecurityScanResult, ShieldError>;
}

pub struct SecurityScanResult {
    pub passed: bool,
    pub score: f64,
    pub threats: Vec<ThreatDetection>,
    pub suggestions: Vec<String>,
}

pub struct ThreatDetection {
    pub threat_type: String,
    pub severity: String,
    pub confidence: f64,
    pub location: Option<TextSpan>,
}
```

### LLM-CostOps Integration

```rust
#[async_trait]
pub trait CostOpsIntegration: Send + Sync {
    async fn get_budget(
        &self,
        user_id: &str,
    ) -> Result<BudgetStatus, CostOpsError>;

    async fn estimate_cost(
        &self,
        model: &str,
        tokens: u64,
    ) -> Result<CostEstimate, CostOpsError>;

    async fn record_usage(
        &self,
        user_id: &str,
        cost: f64,
        metadata: HashMap<String, String>,
    ) -> Result<(), CostOpsError>;
}

pub struct BudgetStatus {
    pub total: f64,
    pub remaining: f64,
    pub period: String,
    pub reset_at: DateTime<Utc>,
}

pub struct CostEstimate {
    pub total: f64,
    pub breakdown: HashMap<String, f64>,
    pub cheaper_alternative: Option<String>,
}
```

### LLM-Governance Integration

```rust
#[async_trait]
pub trait GovernanceIntegration: Send + Sync {
    async fn log_decision(
        &self,
        event: &AuditEvent,
    ) -> Result<(), GovernanceError>;

    async fn query_events(
        &self,
        query: &AuditQuery,
    ) -> Result<Vec<AuditEvent>, GovernanceError>;
}

pub struct AuditEvent {
    pub event_type: String,
    pub user_id: String,
    pub decision: DecisionType,
    pub matched_rules: Vec<String>,
    pub context: serde_json::Value,
    pub timestamp: DateTime<Utc>,
    pub trace_id: String,
}
```

---

## CLI Interface

### Installation

```bash
cargo install llm-policy-engine-cli
```

### Commands

#### Evaluate a policy

```bash
policy-engine evaluate \
  --policy ./policy.yaml \
  --context ./context.json \
  --output json
```

#### Start daemon

```bash
policy-engine daemon \
  --config /etc/policy-engine/config.yaml \
  --listen 0.0.0.0:50051
```

#### Validate a policy

```bash
policy-engine validate ./policy.yaml
```

#### Load a policy

```bash
policy-engine load \
  --file ./policy.yaml \
  --engine http://localhost:50051
```

#### List policies

```bash
policy-engine list \
  --namespace production \
  --engine http://localhost:50051
```

#### Get metrics

```bash
policy-engine metrics \
  --engine http://localhost:50051 \
  --format prometheus
```

#### Benchmark

```bash
policy-engine benchmark \
  --policy ./policy.yaml \
  --contexts ./contexts/ \
  --iterations 10000
```

---

## SDK Support

### Official SDKs

- **Rust**: `llm-policy-engine` (native)
- **Python**: `llm-policy-engine-py` (PyO3 bindings)
- **Go**: `llm-policy-engine-go` (gRPC client)
- **Node.js**: `@llm/policy-engine` (NAPI-RS bindings)
- **Java**: `llm-policy-engine-java` (gRPC client)

### Python SDK Example

```python
from llm_policy_engine import PolicyEngine, EvaluationContext

# Create engine
engine = PolicyEngine.builder() \
    .with_policy_file("./policy.yaml") \
    .with_cache_capacity(10000) \
    .build()

# Create context
context = EvaluationContext(
    request={
        "prompt": "Generate SQL query",
        "model": "gpt-4",
        "estimated_cost": 0.05,
        "estimated_tokens": 1000
    },
    user={
        "id": "user-123",
        "role": "developer",
        "tier": "premium"
    },
    trace_id="trace-abc-123"
)

# Evaluate
decision = engine.evaluate(context)

if decision.is_allowed():
    print("Request allowed")
else:
    print(f"Request denied: {decision.reason}")
```

### Go SDK Example

```go
package main

import (
    "context"
    "log"

    pb "github.com/llm-policy-engine/proto/v1"
    "google.golang.org/grpc"
)

func main() {
    conn, err := grpc.Dial("localhost:50051", grpc.WithInsecure())
    if err != nil {
        log.Fatal(err)
    }
    defer conn.Close()

    client := pb.NewPolicyServiceClient(conn)

    req := &pb.EvaluateRequest{
        Context: &pb.EvaluationContext{
            Request: &pb.RequestContext{
                Prompt:          "Generate SQL query",
                Model:           "gpt-4",
                EstimatedCost:   0.05,
                EstimatedTokens: 1000,
            },
            User: &pb.UserContext{
                Id:   "user-123",
                Role: "developer",
                Tier: "premium",
            },
            TraceId: "trace-abc-123",
        },
    }

    resp, err := client.Evaluate(context.Background(), req)
    if err != nil {
        log.Fatal(err)
    }

    log.Printf("Decision: %v\n", resp.Decision.Decision)
    log.Printf("Reason: %s\n", resp.Decision.Reason)
}
```

---

This API specification provides comprehensive coverage of all interfaces exposed by the LLM-Policy-Engine, enabling seamless integration across different deployment models and programming languages.
