//! LLM Config Manager integration adapter.
//!
//! This module provides a thin runtime adapter for consuming configuration
//! from LLM-Config-Manager. It retrieves enforcement parameters, rule thresholds,
//! and dynamic policy settings at runtime.
//!
//! # Phase 2B Integration
//!
//! This adapter consumes from Config Manager and does NOT export any types
//! that could create circular dependencies. It follows the unidirectional
//! dependency pattern: Config Manager -> Policy Engine (consumes-from).

use super::client::{IntegrationClient, IntegrationResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// Client for consuming configuration from LLM Config Manager.
///
/// This is a thin adapter that fetches dynamic configuration values for
/// policy enforcement parameters, rule thresholds, and runtime settings.
pub struct ConfigManagerAdapter {
    client: IntegrationClient,
    /// Namespace for policy engine configuration
    namespace: String,
}

impl ConfigManagerAdapter {
    /// Create a new Config Manager adapter.
    pub fn new(base_url: String, timeout: Duration) -> Self {
        Self {
            client: IntegrationClient::new(base_url, timeout),
            namespace: "policy-engine".to_string(),
        }
    }

    /// Create a new Config Manager adapter with a custom namespace.
    pub fn with_namespace(base_url: String, timeout: Duration, namespace: String) -> Self {
        Self {
            client: IntegrationClient::new(base_url, timeout),
            namespace,
        }
    }

    /// Get a configuration value by key.
    pub async fn get_config(&self, key: &str) -> IntegrationResult<ConfigValue> {
        let path = format!("/api/v1/config/{}/{}", self.namespace, key);
        self.client.get(&path).await
    }

    /// Get multiple configuration values.
    pub async fn get_configs(&self, keys: &[&str]) -> IntegrationResult<HashMap<String, ConfigValue>> {
        let request = BatchConfigRequest {
            namespace: self.namespace.clone(),
            keys: keys.iter().map(|s| s.to_string()).collect(),
        };
        self.client
            .post("/api/v1/config/batch", &request)
            .await
    }

    /// Get all enforcement parameters for policy evaluation.
    pub async fn get_enforcement_params(&self) -> IntegrationResult<EnforcementParams> {
        let path = format!("/api/v1/config/{}/enforcement", self.namespace);
        self.client.get(&path).await
    }

    /// Get rule threshold configuration.
    pub async fn get_rule_thresholds(&self) -> IntegrationResult<RuleThresholds> {
        let path = format!("/api/v1/config/{}/thresholds", self.namespace);
        self.client.get(&path).await
    }

    /// Get dynamic policy settings.
    pub async fn get_policy_settings(&self) -> IntegrationResult<PolicySettings> {
        let path = format!("/api/v1/config/{}/policy-settings", self.namespace);
        self.client.get(&path).await
    }

    /// Get feature flags for policy engine.
    pub async fn get_feature_flags(&self) -> IntegrationResult<FeatureFlags> {
        let path = format!("/api/v1/config/{}/features", self.namespace);
        self.client.get(&path).await
    }

    /// Subscribe to configuration changes (returns current version).
    ///
    /// In a full implementation, this would set up a watch/subscription.
    /// For now, it returns the current configuration version for polling.
    pub async fn get_config_version(&self) -> IntegrationResult<ConfigVersion> {
        let path = format!("/api/v1/config/{}/version", self.namespace);
        self.client.get(&path).await
    }

    /// Validate configuration access (RBAC check).
    pub async fn validate_access(&self, request: &AccessValidationRequest) -> IntegrationResult<AccessValidationResult> {
        self.client
            .post("/api/v1/rbac/validate", request)
            .await
    }

    /// Check if Config Manager service is healthy.
    pub async fn health_check(&self) -> bool {
        self.client.health_check().await
    }
}

/// A configuration value from Config Manager.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigValue {
    /// Configuration key
    pub key: String,
    /// Configuration value
    pub value: serde_json::Value,
    /// Value type
    pub value_type: ConfigValueType,
    /// Configuration metadata
    #[serde(default)]
    pub metadata: ConfigMetadata,
}

/// Configuration value types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigValueType {
    /// String value
    String,
    /// Integer value
    Integer,
    /// Float value
    Float,
    /// Boolean value
    Boolean,
    /// JSON object
    Object,
    /// JSON array
    Array,
    /// Encrypted/secret value
    Secret,
}

impl Default for ConfigValueType {
    fn default() -> Self {
        Self::String
    }
}

/// Configuration metadata.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ConfigMetadata {
    /// Configuration version
    #[serde(default)]
    pub version: u64,
    /// Last modified timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
    /// Modified by (user/service)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_by: Option<String>,
    /// Configuration source
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// Batch configuration request.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct BatchConfigRequest {
    namespace: String,
    keys: Vec<String>,
}

/// Enforcement parameters for policy evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnforcementParams {
    /// Whether strict mode is enabled
    #[serde(default)]
    pub strict_mode: bool,
    /// Default decision when no rules match
    #[serde(default = "default_decision")]
    pub default_decision: String,
    /// Maximum evaluation time in milliseconds
    #[serde(default = "default_max_eval_time")]
    pub max_evaluation_time_ms: u64,
    /// Whether to fail open on errors
    #[serde(default)]
    pub fail_open: bool,
    /// Audit logging level
    #[serde(default = "default_audit_level")]
    pub audit_level: String,
    /// Rate limiting configuration
    #[serde(default)]
    pub rate_limits: RateLimitConfig,
}

fn default_decision() -> String {
    "deny".to_string()
}

fn default_max_eval_time() -> u64 {
    100
}

fn default_audit_level() -> String {
    "standard".to_string()
}

impl Default for EnforcementParams {
    fn default() -> Self {
        Self {
            strict_mode: false,
            default_decision: default_decision(),
            max_evaluation_time_ms: default_max_eval_time(),
            fail_open: false,
            audit_level: default_audit_level(),
            rate_limits: RateLimitConfig::default(),
        }
    }
}

/// Rate limiting configuration.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RateLimitConfig {
    /// Enabled flag
    #[serde(default)]
    pub enabled: bool,
    /// Requests per second
    #[serde(default = "default_rps")]
    pub requests_per_second: u32,
    /// Burst size
    #[serde(default = "default_burst")]
    pub burst_size: u32,
}

fn default_rps() -> u32 {
    1000
}

fn default_burst() -> u32 {
    100
}

/// Rule threshold configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleThresholds {
    /// Cost threshold for budget enforcement
    #[serde(default)]
    pub cost_threshold: f64,
    /// Token limit threshold
    #[serde(default)]
    pub token_limit: u64,
    /// Request rate threshold
    #[serde(default)]
    pub request_rate_limit: u32,
    /// Latency threshold in milliseconds
    #[serde(default)]
    pub latency_threshold_ms: u64,
    /// Error rate threshold (percentage)
    #[serde(default)]
    pub error_rate_threshold: f64,
    /// Custom thresholds
    #[serde(default)]
    pub custom: HashMap<String, serde_json::Value>,
}

impl Default for RuleThresholds {
    fn default() -> Self {
        Self {
            cost_threshold: 100.0,
            token_limit: 100000,
            request_rate_limit: 1000,
            latency_threshold_ms: 5000,
            error_rate_threshold: 5.0,
            custom: HashMap::new(),
        }
    }
}

/// Dynamic policy settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicySettings {
    /// Enabled policy namespaces
    #[serde(default)]
    pub enabled_namespaces: Vec<String>,
    /// Disabled policy IDs (overrides)
    #[serde(default)]
    pub disabled_policies: Vec<String>,
    /// Policy priority overrides
    #[serde(default)]
    pub priority_overrides: HashMap<String, i32>,
    /// Environment-specific settings
    #[serde(default)]
    pub environment: String,
    /// Cache TTL in seconds
    #[serde(default = "default_cache_ttl")]
    pub cache_ttl_seconds: u64,
    /// Hot reload enabled
    #[serde(default = "default_hot_reload")]
    pub hot_reload_enabled: bool,
}

fn default_cache_ttl() -> u64 {
    300
}

fn default_hot_reload() -> bool {
    true
}

impl Default for PolicySettings {
    fn default() -> Self {
        Self {
            enabled_namespaces: vec!["default".to_string()],
            disabled_policies: Vec::new(),
            priority_overrides: HashMap::new(),
            environment: "production".to_string(),
            cache_ttl_seconds: default_cache_ttl(),
            hot_reload_enabled: default_hot_reload(),
        }
    }
}

/// Feature flags for policy engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlags {
    /// Parallel evaluation enabled
    #[serde(default = "default_true")]
    pub parallel_evaluation: bool,
    /// CEL expressions enabled
    #[serde(default = "default_true")]
    pub cel_enabled: bool,
    /// WASM plugins enabled
    #[serde(default)]
    pub wasm_enabled: bool,
    /// Distributed caching enabled
    #[serde(default)]
    pub distributed_cache: bool,
    /// Advanced telemetry enabled
    #[serde(default = "default_true")]
    pub advanced_telemetry: bool,
    /// Custom feature flags
    #[serde(default)]
    pub custom: HashMap<String, bool>,
}

fn default_true() -> bool {
    true
}

impl Default for FeatureFlags {
    fn default() -> Self {
        Self {
            parallel_evaluation: true,
            cel_enabled: true,
            wasm_enabled: false,
            distributed_cache: false,
            advanced_telemetry: true,
            custom: HashMap::new(),
        }
    }
}

/// Configuration version information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigVersion {
    /// Current version number
    pub version: u64,
    /// Last modified timestamp
    pub modified_at: String,
    /// Checksum/hash of configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checksum: Option<String>,
}

/// Access validation request for RBAC.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessValidationRequest {
    /// Subject (user/service) requesting access
    pub subject: String,
    /// Resource being accessed
    pub resource: String,
    /// Action being performed
    pub action: String,
    /// Additional context
    #[serde(default)]
    pub context: HashMap<String, String>,
}

/// Access validation result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessValidationResult {
    /// Whether access is allowed
    pub allowed: bool,
    /// Reason for the decision
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Applicable policies
    #[serde(default)]
    pub policies: Vec<String>,
}

impl Default for AccessValidationResult {
    fn default() -> Self {
        Self {
            allowed: false,
            reason: None,
            policies: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_enforcement_params_default() {
        let params = EnforcementParams::default();
        assert!(!params.strict_mode);
        assert_eq!(params.default_decision, "deny");
        assert_eq!(params.max_evaluation_time_ms, 100);
    }

    #[test]
    fn test_rule_thresholds_default() {
        let thresholds = RuleThresholds::default();
        assert_eq!(thresholds.cost_threshold, 100.0);
        assert_eq!(thresholds.token_limit, 100000);
    }

    #[test]
    fn test_policy_settings_default() {
        let settings = PolicySettings::default();
        assert!(settings.hot_reload_enabled);
        assert_eq!(settings.cache_ttl_seconds, 300);
    }

    #[test]
    fn test_feature_flags_default() {
        let flags = FeatureFlags::default();
        assert!(flags.parallel_evaluation);
        assert!(flags.cel_enabled);
        assert!(!flags.wasm_enabled);
    }

    #[test]
    fn test_config_value_serialization() {
        let config = ConfigValue {
            key: "test.key".to_string(),
            value: serde_json::json!(42),
            value_type: ConfigValueType::Integer,
            metadata: ConfigMetadata::default(),
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("test.key"));
    }
}
