//! LLM Schema Registry integration adapter.
//!
//! This module provides a thin runtime adapter for consuming schema definitions
//! from LLM-Schema-Registry. It validates policy documents and rule structures
//! against registered schemas.
//!
//! # Phase 2B Integration
//!
//! This adapter consumes from Schema Registry and does NOT export any types
//! that could create circular dependencies. It follows the unidirectional
//! dependency pattern: Schema Registry -> Policy Engine (consumes-from).

use super::client::{IntegrationClient, IntegrationResult};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Client for consuming schema definitions from LLM Schema Registry.
///
/// This is a thin adapter that fetches and caches schema definitions for
/// validating policy documents and rule structures at runtime.
pub struct SchemaRegistryAdapter {
    client: IntegrationClient,
}

impl SchemaRegistryAdapter {
    /// Create a new Schema Registry adapter.
    pub fn new(base_url: String, timeout: Duration) -> Self {
        Self {
            client: IntegrationClient::new(base_url, timeout),
        }
    }

    /// Fetch a schema definition by its subject name.
    ///
    /// Returns the schema that can be used to validate policy documents.
    pub async fn get_schema(&self, subject: &str) -> IntegrationResult<SchemaDefinition> {
        let path = format!("/api/v1/schemas/{}/latest", subject);
        self.client.get(&path).await
    }

    /// Fetch a specific version of a schema.
    pub async fn get_schema_version(
        &self,
        subject: &str,
        version: u32,
    ) -> IntegrationResult<SchemaDefinition> {
        let path = format!("/api/v1/schemas/{}/versions/{}", subject, version);
        self.client.get(&path).await
    }

    /// Validate a policy document against the policy schema.
    ///
    /// This method fetches the policy schema and validates the provided
    /// document structure against it.
    pub async fn validate_policy_document(
        &self,
        document: &PolicyDocumentSchema,
    ) -> IntegrationResult<ValidationResult> {
        self.client
            .post("/api/v1/validate/policy-document", document)
            .await
    }

    /// Validate a policy rule structure against the rule schema.
    pub async fn validate_rule_structure(
        &self,
        rule: &RuleSchema,
    ) -> IntegrationResult<ValidationResult> {
        self.client
            .post("/api/v1/validate/policy-rule", rule)
            .await
    }

    /// Check schema compatibility for a policy update.
    ///
    /// Returns whether the new policy version is compatible with the existing
    /// schema constraints.
    pub async fn check_compatibility(
        &self,
        request: &CompatibilityCheckRequest,
    ) -> IntegrationResult<CompatibilityResult> {
        self.client
            .post("/api/v1/compatibility/check", request)
            .await
    }

    /// List available policy-related schemas.
    pub async fn list_policy_schemas(&self) -> IntegrationResult<Vec<SchemaMetadata>> {
        self.client
            .get("/api/v1/schemas?filter=policy")
            .await
    }

    /// Check if Schema Registry service is healthy.
    pub async fn health_check(&self) -> bool {
        self.client.health_check().await
    }
}

/// A schema definition from the Schema Registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaDefinition {
    /// Schema ID
    pub id: String,
    /// Schema subject (name)
    pub subject: String,
    /// Schema version
    pub version: u32,
    /// Schema type (e.g., "json-schema", "avro", "protobuf")
    pub schema_type: SchemaType,
    /// The schema content
    pub schema: serde_json::Value,
    /// Schema metadata
    #[serde(default)]
    pub metadata: SchemaMetadata,
}

/// Schema type enumeration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SchemaType {
    /// JSON Schema
    JsonSchema,
    /// Apache Avro
    Avro,
    /// Protocol Buffers
    Protobuf,
    /// OpenAPI/Swagger
    OpenApi,
}

impl Default for SchemaType {
    fn default() -> Self {
        Self::JsonSchema
    }
}

/// Schema metadata.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SchemaMetadata {
    /// Schema subject name
    #[serde(default)]
    pub subject: String,
    /// Schema description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Schema owner/maintainer
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    /// Schema tags
    #[serde(default)]
    pub tags: Vec<String>,
    /// Creation timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// Last updated timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// Policy document structure for schema validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDocumentSchema {
    /// API version
    pub api_version: String,
    /// Document kind
    pub kind: String,
    /// Policy definitions (as raw JSON for schema validation)
    pub policies: Vec<serde_json::Value>,
}

/// Rule structure for schema validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleSchema {
    /// Rule ID
    pub id: String,
    /// Rule name
    pub name: String,
    /// Condition expression
    pub condition: serde_json::Value,
    /// Action definition
    pub action: serde_json::Value,
}

/// Result of a schema validation operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    /// Whether the validation passed
    pub valid: bool,
    /// Validation errors if any
    #[serde(default)]
    pub errors: Vec<ValidationError>,
    /// Validation warnings if any
    #[serde(default)]
    pub warnings: Vec<ValidationWarning>,
}

impl Default for ValidationResult {
    fn default() -> Self {
        Self {
            valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
        }
    }
}

/// A validation error.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    /// Error path in the document
    pub path: String,
    /// Error message
    pub message: String,
    /// Error code
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

/// A validation warning.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationWarning {
    /// Warning path in the document
    pub path: String,
    /// Warning message
    pub message: String,
}

/// Request for checking schema compatibility.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompatibilityCheckRequest {
    /// Subject to check against
    pub subject: String,
    /// The new schema to check
    pub schema: serde_json::Value,
    /// Compatibility level to check
    #[serde(default)]
    pub compatibility_level: CompatibilityLevel,
}

/// Schema compatibility levels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CompatibilityLevel {
    /// No compatibility checks
    None,
    /// New schema can read data written by old schema
    Backward,
    /// Old schema can read data written by new schema
    Forward,
    /// Both backward and forward compatible
    Full,
    /// Backward compatible with all previous versions
    BackwardTransitive,
    /// Forward compatible with all previous versions
    ForwardTransitive,
    /// Full compatible with all previous versions
    FullTransitive,
}

impl Default for CompatibilityLevel {
    fn default() -> Self {
        Self::Backward
    }
}

/// Result of a compatibility check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompatibilityResult {
    /// Whether the schemas are compatible
    pub compatible: bool,
    /// Compatibility issues if any
    #[serde(default)]
    pub issues: Vec<CompatibilityIssue>,
}

impl Default for CompatibilityResult {
    fn default() -> Self {
        Self {
            compatible: true,
            issues: Vec::new(),
        }
    }
}

/// A compatibility issue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompatibilityIssue {
    /// Issue type
    pub issue_type: String,
    /// Issue description
    pub description: String,
    /// Affected path
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schema_type_default() {
        assert_eq!(SchemaType::default(), SchemaType::JsonSchema);
    }

    #[test]
    fn test_validation_result_default() {
        let result = ValidationResult::default();
        assert!(result.valid);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn test_compatibility_level_default() {
        assert_eq!(CompatibilityLevel::default(), CompatibilityLevel::Backward);
    }

    #[test]
    fn test_policy_document_schema_serialization() {
        let doc = PolicyDocumentSchema {
            api_version: "policy.llm-dev-ops.io/v1".to_string(),
            kind: "PolicyDocument".to_string(),
            policies: vec![serde_json::json!({
                "id": "test-policy",
                "name": "Test Policy"
            })],
        };

        let json = serde_json::to_string(&doc).unwrap();
        assert!(json.contains("policy.llm-dev-ops.io/v1"));
    }
}
