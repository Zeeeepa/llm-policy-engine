//! LLM Observatory integration adapter.
//!
//! This module provides a thin runtime adapter for consuming telemetry signals
//! from LLM-Observatory and emitting policy evaluation events. It attaches
//! trace context to policy decisions for end-to-end observability.
//!
//! # Phase 2B Integration
//!
//! This adapter consumes from Observatory and does NOT export any types
//! that could create circular dependencies. It follows the unidirectional
//! dependency pattern: Observatory -> Policy Engine (consumes-from).

use super::client::{IntegrationClient, IntegrationResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// Client for integrating with LLM Observatory.
///
/// This is a thin adapter that:
/// - Consumes telemetry signals from upstream services
/// - Emits policy evaluation events to Observatory
/// - Attaches trace context to policy decisions
pub struct ObservatoryAdapter {
    client: IntegrationClient,
    /// Service name for telemetry attribution
    service_name: String,
}

impl ObservatoryAdapter {
    /// Create a new Observatory adapter.
    pub fn new(base_url: String, timeout: Duration) -> Self {
        Self {
            client: IntegrationClient::new(base_url, timeout),
            service_name: "llm-policy-engine".to_string(),
        }
    }

    /// Create a new Observatory adapter with a custom service name.
    pub fn with_service_name(base_url: String, timeout: Duration, service_name: String) -> Self {
        Self {
            client: IntegrationClient::new(base_url, timeout),
            service_name,
        }
    }

    /// Emit a policy evaluation event.
    ///
    /// This sends evaluation metadata to Observatory for aggregation and analysis.
    pub async fn emit_evaluation_event(
        &self,
        event: &PolicyEvaluationEvent,
    ) -> IntegrationResult<EventAck> {
        self.client
            .post("/api/v1/events/policy-evaluation", event)
            .await
    }

    /// Emit a batch of policy evaluation events.
    pub async fn emit_evaluation_events_batch(
        &self,
        events: &[PolicyEvaluationEvent],
    ) -> IntegrationResult<BatchEventAck> {
        let request = BatchEventRequest {
            service: self.service_name.clone(),
            events: events.to_vec(),
        };
        self.client
            .post("/api/v1/events/batch", &request)
            .await
    }

    /// Get trace context for a request.
    ///
    /// This retrieves distributed trace context from Observatory for
    /// trace correlation across services.
    pub async fn get_trace_context(&self, trace_id: &str) -> IntegrationResult<TraceContext> {
        let path = format!("/api/v1/traces/{}/context", trace_id);
        self.client.get(&path).await
    }

    /// Register a trace span for policy evaluation.
    pub async fn register_span(&self, span: &PolicySpan) -> IntegrationResult<SpanRegistration> {
        self.client
            .post("/api/v1/spans/register", span)
            .await
    }

    /// Complete a trace span with results.
    pub async fn complete_span(&self, span_id: &str, result: &SpanResult) -> IntegrationResult<()> {
        let path = format!("/api/v1/spans/{}/complete", span_id);
        self.client.post::<(), _>(&path, result).await.map(|_| ())
    }

    /// Get telemetry signals for a specific context.
    ///
    /// This consumes aggregated telemetry from Observatory that may influence
    /// policy decisions (e.g., error rates, latency percentiles).
    pub async fn get_telemetry_signals(
        &self,
        request: &TelemetrySignalRequest,
    ) -> IntegrationResult<TelemetrySignals> {
        self.client
            .post("/api/v1/signals/query", request)
            .await
    }

    /// Get current metrics for a service/model combination.
    pub async fn get_current_metrics(
        &self,
        service: &str,
        model: Option<&str>,
    ) -> IntegrationResult<CurrentMetrics> {
        let path = match model {
            Some(m) => format!("/api/v1/metrics/current?service={}&model={}", service, m),
            None => format!("/api/v1/metrics/current?service={}", service),
        };
        self.client.get(&path).await
    }

    /// Subscribe to real-time telemetry updates (returns subscription ID).
    pub async fn subscribe_telemetry(
        &self,
        request: &TelemetrySubscription,
    ) -> IntegrationResult<SubscriptionAck> {
        self.client
            .post("/api/v1/subscriptions/telemetry", request)
            .await
    }

    /// Record a policy decision for analytics.
    pub async fn record_decision(
        &self,
        decision: &PolicyDecisionRecord,
    ) -> IntegrationResult<RecordAck> {
        self.client
            .post("/api/v1/analytics/decisions", decision)
            .await
    }

    /// Check if Observatory service is healthy.
    pub async fn health_check(&self) -> bool {
        self.client.health_check().await
    }
}

/// A policy evaluation event for Observatory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyEvaluationEvent {
    /// Event ID
    pub event_id: String,
    /// Timestamp (ISO 8601)
    pub timestamp: String,
    /// Trace ID for distributed tracing
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    /// Span ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub span_id: Option<String>,
    /// Policy ID evaluated
    pub policy_id: String,
    /// Rule ID matched (if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<String>,
    /// Decision result
    pub decision: DecisionOutcome,
    /// Evaluation duration in milliseconds
    pub duration_ms: f64,
    /// Whether result was cached
    #[serde(default)]
    pub cached: bool,
    /// Additional context
    #[serde(default)]
    pub context: HashMap<String, String>,
    /// Labels for filtering
    #[serde(default)]
    pub labels: HashMap<String, String>,
}

/// Decision outcome for telemetry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DecisionOutcome {
    /// Request allowed
    Allow,
    /// Request denied
    Deny,
    /// Warning issued
    Warn,
    /// Request modified
    Modify,
    /// Error during evaluation
    Error,
}

/// Batch event request.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct BatchEventRequest {
    service: String,
    events: Vec<PolicyEvaluationEvent>,
}

/// Acknowledgment for a single event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventAck {
    /// Whether the event was accepted
    pub accepted: bool,
    /// Event ID assigned by Observatory
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
}

/// Acknowledgment for a batch of events.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchEventAck {
    /// Number of events accepted
    pub accepted_count: u64,
    /// Number of events rejected
    pub rejected_count: u64,
    /// IDs of rejected events
    #[serde(default)]
    pub rejected_ids: Vec<String>,
}

/// Trace context for distributed tracing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceContext {
    /// Trace ID
    pub trace_id: String,
    /// Parent span ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_span_id: Option<String>,
    /// Trace flags
    #[serde(default)]
    pub trace_flags: u8,
    /// Trace state (W3C format)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_state: Option<String>,
    /// Baggage items
    #[serde(default)]
    pub baggage: HashMap<String, String>,
}

impl TraceContext {
    /// Create a new trace context with a trace ID.
    pub fn new(trace_id: String) -> Self {
        Self {
            trace_id,
            parent_span_id: None,
            trace_flags: 1, // Sampled
            trace_state: None,
            baggage: HashMap::new(),
        }
    }

    /// Check if this trace is sampled.
    pub fn is_sampled(&self) -> bool {
        self.trace_flags & 0x01 != 0
    }
}

/// A policy evaluation span.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicySpan {
    /// Span name
    pub name: String,
    /// Trace ID
    pub trace_id: String,
    /// Parent span ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_span_id: Option<String>,
    /// Start timestamp (ISO 8601)
    pub start_time: String,
    /// Span kind
    #[serde(default)]
    pub kind: SpanKind,
    /// Span attributes
    #[serde(default)]
    pub attributes: HashMap<String, serde_json::Value>,
}

/// Span kind enumeration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SpanKind {
    /// Internal operation
    Internal,
    /// Server-side operation
    Server,
    /// Client-side operation
    Client,
    /// Producer operation
    Producer,
    /// Consumer operation
    Consumer,
}

impl Default for SpanKind {
    fn default() -> Self {
        Self::Internal
    }
}

/// Span registration response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanRegistration {
    /// Assigned span ID
    pub span_id: String,
    /// Registration timestamp
    pub registered_at: String,
}

/// Span completion result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanResult {
    /// End timestamp (ISO 8601)
    pub end_time: String,
    /// Status code
    pub status: SpanStatus,
    /// Status message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_message: Option<String>,
    /// Final attributes
    #[serde(default)]
    pub attributes: HashMap<String, serde_json::Value>,
}

/// Span status codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SpanStatus {
    /// Unset status
    Unset,
    /// OK status
    Ok,
    /// Error status
    Error,
}

impl Default for SpanStatus {
    fn default() -> Self {
        Self::Unset
    }
}

/// Request for telemetry signals.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetrySignalRequest {
    /// Service to query
    pub service: String,
    /// Model to filter by
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Provider to filter by
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Time window in seconds
    #[serde(default = "default_time_window")]
    pub time_window_seconds: u64,
    /// Signal types to retrieve
    #[serde(default)]
    pub signal_types: Vec<SignalType>,
}

fn default_time_window() -> u64 {
    300 // 5 minutes
}

/// Types of telemetry signals.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignalType {
    /// Error rate
    ErrorRate,
    /// Latency percentiles
    Latency,
    /// Request rate
    RequestRate,
    /// Token usage
    TokenUsage,
    /// Cost metrics
    Cost,
    /// Availability
    Availability,
}

/// Aggregated telemetry signals.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetrySignals {
    /// Query timestamp
    pub timestamp: String,
    /// Time window covered
    pub time_window_seconds: u64,
    /// Error rate percentage
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_rate: Option<f64>,
    /// Latency percentiles
    #[serde(default)]
    pub latency_percentiles: LatencyPercentiles,
    /// Request rate per second
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_rate: Option<f64>,
    /// Token usage
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_usage: Option<TokenUsage>,
    /// Cost in the period
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<f64>,
    /// Availability percentage
    #[serde(skip_serializing_if = "Option::is_none")]
    pub availability: Option<f64>,
}

/// Latency percentile values.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LatencyPercentiles {
    /// 50th percentile (median)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub p50: Option<f64>,
    /// 90th percentile
    #[serde(skip_serializing_if = "Option::is_none")]
    pub p90: Option<f64>,
    /// 95th percentile
    #[serde(skip_serializing_if = "Option::is_none")]
    pub p95: Option<f64>,
    /// 99th percentile
    #[serde(skip_serializing_if = "Option::is_none")]
    pub p99: Option<f64>,
}

/// Token usage metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    /// Input tokens
    pub input_tokens: u64,
    /// Output tokens
    pub output_tokens: u64,
    /// Total tokens
    pub total_tokens: u64,
}

/// Current metrics snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentMetrics {
    /// Metric timestamp
    pub timestamp: String,
    /// Service name
    pub service: String,
    /// Model name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Active requests
    pub active_requests: u64,
    /// Error count (last minute)
    pub error_count: u64,
    /// Average latency (last minute)
    pub avg_latency_ms: f64,
    /// Health status
    pub health_status: HealthStatus,
}

/// Health status enumeration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    /// Healthy
    Healthy,
    /// Degraded performance
    Degraded,
    /// Unhealthy
    Unhealthy,
    /// Unknown
    Unknown,
}

impl Default for HealthStatus {
    fn default() -> Self {
        Self::Unknown
    }
}

/// Telemetry subscription request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetrySubscription {
    /// Subscription name
    pub name: String,
    /// Services to subscribe to
    #[serde(default)]
    pub services: Vec<String>,
    /// Signal types to subscribe to
    #[serde(default)]
    pub signal_types: Vec<SignalType>,
    /// Callback URL for notifications
    #[serde(skip_serializing_if = "Option::is_none")]
    pub callback_url: Option<String>,
    /// Threshold for notifications
    #[serde(skip_serializing_if = "Option::is_none")]
    pub threshold: Option<TelemetryThreshold>,
}

/// Threshold for telemetry notifications.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryThreshold {
    /// Signal type
    pub signal_type: SignalType,
    /// Operator (gt, lt, eq, gte, lte)
    pub operator: String,
    /// Threshold value
    pub value: f64,
}

/// Subscription acknowledgment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionAck {
    /// Subscription ID
    pub subscription_id: String,
    /// Whether subscription is active
    pub active: bool,
}

/// Policy decision record for analytics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDecisionRecord {
    /// Decision ID
    pub decision_id: String,
    /// Timestamp
    pub timestamp: String,
    /// User ID (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    /// Model used
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Provider
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Policy ID
    pub policy_id: String,
    /// Decision outcome
    pub decision: DecisionOutcome,
    /// Evaluation latency
    pub latency_ms: f64,
    /// Reason for decision
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Additional metadata
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Record acknowledgment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordAck {
    /// Whether record was accepted
    pub accepted: bool,
    /// Record ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub record_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decision_outcome_serialization() {
        let outcome = DecisionOutcome::Allow;
        let json = serde_json::to_string(&outcome).unwrap();
        assert_eq!(json, "\"allow\"");
    }

    #[test]
    fn test_trace_context_new() {
        let ctx = TraceContext::new("abc123".to_string());
        assert_eq!(ctx.trace_id, "abc123");
        assert!(ctx.is_sampled());
    }

    #[test]
    fn test_span_kind_default() {
        assert_eq!(SpanKind::default(), SpanKind::Internal);
    }

    #[test]
    fn test_health_status_default() {
        assert_eq!(HealthStatus::default(), HealthStatus::Unknown);
    }

    #[test]
    fn test_policy_evaluation_event_serialization() {
        let event = PolicyEvaluationEvent {
            event_id: "evt-123".to_string(),
            timestamp: "2025-01-01T00:00:00Z".to_string(),
            trace_id: Some("trace-456".to_string()),
            span_id: None,
            policy_id: "policy-789".to_string(),
            rule_id: Some("rule-1".to_string()),
            decision: DecisionOutcome::Allow,
            duration_ms: 5.5,
            cached: false,
            context: HashMap::new(),
            labels: HashMap::new(),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("policy-789"));
        assert!(json.contains("allow"));
    }
}
