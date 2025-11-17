#!/usr/bin/env bash

################################################################################
# validate-sealed-secrets.sh
#
# Production-ready validation script for SealedSecret manifests
# in the LLM Policy Engine Kubernetes deployment.
#
# USAGE:
#   validate-sealed-secrets.sh [OPTIONS] [FILE]
#
# OPTIONS:
#   FILE              Path to specific SealedSecret manifest to validate
#   --all             Validate all manifests in manifests/ directory
#   --strict          Fail on warnings (exit non-zero)
#   --ci              CI-friendly output (no colors, structured output)
#   --json            Output results in JSON format
#   --help, -h        Show this help message
#
# EXIT CODES:
#   0   All validations passed
#   1   Validation failures detected
#   2   Invalid usage or missing dependencies
#   3   File not found or not readable
#
# EXAMPLES:
#   # Validate a single manifest
#   ./validate-sealed-secrets.sh manifests/database-sealedsecret.yaml
#
#   # Validate all manifests
#   ./validate-sealed-secrets.sh --all
#
#   # Validate in CI mode (no colors, strict)
#   ./validate-sealed-secrets.sh --all --ci --strict
#
#   # Output as JSON
#   ./validate-sealed-secrets.sh manifests/database-sealedsecret.yaml --json
#
# DEPENDENCIES:
#   - kubectl (required)
#   - yq (required, v4+)
#   - kubeseal (optional, for enhanced validation)
#
################################################################################

set -euo pipefail

# Script metadata
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFESTS_DIR="${SCRIPT_DIR}/../manifests"
VERSION="1.0.0"

# Configuration
EXPECTED_API_VERSION="bitnami.com/v1alpha1"
EXPECTED_KIND="SealedSecret"
EXPECTED_NAMESPACE="llm-devops"
EXPECTED_SCOPE="strict"
VALID_ENVIRONMENTS=("dev" "staging" "production")
VALID_ROTATION_POLICIES=("quarterly" "monthly" "yearly" "on-demand")

# Required labels
REQUIRED_LABELS=(
  "app"
  "component"
  "secret-type"
  "managed-by"
  "environment"
  "version"
  "rotation-policy"
)

# Required annotations
REQUIRED_ANNOTATIONS=(
  "description"
  "rotation-schedule"
  "last-rotated"
  "next-rotation"
  "sealedsecrets.bitnami.com/cluster-wide"
  "sealedsecrets.bitnami.com/namespace-wide"
)

# Colors (will be disabled in CI mode)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Counters
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_WARNINGS=0

# Options
OPT_ALL=false
OPT_STRICT=false
OPT_CI=false
OPT_JSON=false
TARGET_FILE=""

# JSON output structure
JSON_RESULTS='{"files":[],"summary":{"passed":0,"failed":0,"warnings":0}}'

################################################################################
# Functions
################################################################################

# Show usage information
show_usage() {
  sed -n '2,/^################################################################################$/p' "$0" | sed '1d;$d' | sed 's/^# \?//'
  exit 0
}

# Log functions
log_info() {
  if [[ "$OPT_CI" == "false" && "$OPT_JSON" == "false" ]]; then
    echo -e "${BLUE}$*${NC}"
  fi
}

log_success() {
  if [[ "$OPT_JSON" == "false" ]]; then
    if [[ "$OPT_CI" == "true" ]]; then
      echo "[PASS] $*"
    else
      echo -e "${GREEN}✓${NC} $*"
    fi
  fi
}

log_warning() {
  if [[ "$OPT_JSON" == "false" ]]; then
    if [[ "$OPT_CI" == "true" ]]; then
      echo "[WARN] $*"
    else
      echo -e "${YELLOW}⚠${NC} $*"
    fi
  fi
}

log_error() {
  if [[ "$OPT_JSON" == "false" ]]; then
    if [[ "$OPT_CI" == "true" ]]; then
      echo "[FAIL] $*"
    else
      echo -e "${RED}✗${NC} $*"
    fi
  fi
}

log_section() {
  if [[ "$OPT_JSON" == "false" ]]; then
    if [[ "$OPT_CI" == "true" ]]; then
      echo ""
      echo "=== $* ==="
    else
      echo ""
      echo -e "${BOLD}$*${NC}"
    fi
  fi
}

# Check if required tools are installed
check_dependencies() {
  local missing_deps=()

  if ! command -v kubectl &> /dev/null; then
    missing_deps+=("kubectl")
  fi

  if ! command -v yq &> /dev/null; then
    missing_deps+=("yq")
  fi

  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    echo "ERROR: Missing required dependencies: ${missing_deps[*]}" >&2
    echo "Please install the missing tools and try again." >&2
    exit 2
  fi

  # Check yq version (should be v4+)
  local yq_version
  yq_version=$(yq --version 2>&1 || echo "unknown")
  if [[ ! "$yq_version" =~ "version 4" && ! "$yq_version" =~ "version v4" ]]; then
    log_warning "yq v4+ is recommended. Found: $yq_version"
  fi

  # Check for optional kubeseal
  if command -v kubeseal &> /dev/null; then
    log_info "kubeseal found - enhanced validation enabled"
  fi
}

# Validate YAML syntax
validate_yaml_syntax() {
  local file="$1"
  local passed=0
  local failed=0
  local warnings=0

  log_section "Syntax Validation"

  # Check if file is valid YAML
  if yq eval '.' "$file" &> /dev/null; then
    log_success "Valid YAML syntax"
    ((passed++))
  else
    log_error "Invalid YAML syntax"
    ((failed++))
    return 1
  fi

  # Check apiVersion
  local api_version
  api_version=$(yq eval '.apiVersion' "$file")
  if [[ "$api_version" == "$EXPECTED_API_VERSION" ]]; then
    log_success "Valid apiVersion: $api_version"
    ((passed++))
  else
    log_error "Invalid apiVersion: $api_version (expected: $EXPECTED_API_VERSION)"
    ((failed++))
  fi

  # Check kind
  local kind
  kind=$(yq eval '.kind' "$file")
  if [[ "$kind" == "$EXPECTED_KIND" ]]; then
    log_success "Valid kind: $kind"
    ((passed++))
  else
    log_error "Invalid kind: $kind (expected: $EXPECTED_KIND)"
    ((failed++))
  fi

  # Check required fields
  local has_metadata has_spec has_encrypted_data has_template
  has_metadata=$(yq eval '.metadata' "$file")
  has_spec=$(yq eval '.spec' "$file")
  has_encrypted_data=$(yq eval '.spec.encryptedData' "$file")
  has_template=$(yq eval '.spec.template' "$file")

  if [[ "$has_metadata" != "null" && "$has_spec" != "null" ]]; then
    log_success "Required fields present (metadata, spec)"
    ((passed++))
  else
    log_error "Missing required fields (metadata or spec)"
    ((failed++))
  fi

  # Check encryptedData
  if [[ "$has_encrypted_data" != "null" ]]; then
    local encrypted_count
    encrypted_count=$(yq eval '.spec.encryptedData | keys | length' "$file")
    if [[ "$encrypted_count" -gt 0 ]]; then
      log_success "spec.encryptedData exists and not empty ($encrypted_count fields)"
      ((passed++))
    else
      log_error "spec.encryptedData is empty"
      ((failed++))
    fi
  else
    log_error "spec.encryptedData not found"
    ((failed++))
  fi

  # Check template
  if [[ "$has_template" != "null" ]]; then
    log_success "spec.template exists"
    ((passed++))
  else
    log_warning "spec.template not found (optional but recommended)"
    ((warnings++))
  fi

  # Validate with kubectl dry-run
  if kubectl apply --dry-run=client -f "$file" &> /dev/null; then
    log_success "kubectl validation passed"
    ((passed++))
  else
    log_error "kubectl validation failed"
    ((failed++))
  fi

  TOTAL_PASSED=$((TOTAL_PASSED + passed))
  TOTAL_FAILED=$((TOTAL_FAILED + failed))
  TOTAL_WARNINGS=$((TOTAL_WARNINGS + warnings))

  [[ $failed -eq 0 ]]
}

# Validate semantic properties
validate_semantics() {
  local file="$1"
  local passed=0
  local failed=0
  local warnings=0

  log_section "Semantic Validation"

  # Check required labels
  local labels_present=0
  local missing_labels=()

  for label in "${REQUIRED_LABELS[@]}"; do
    local value
    value=$(yq eval ".metadata.labels.\"$label\"" "$file")
    if [[ "$value" != "null" && -n "$value" ]]; then
      ((labels_present++))
    else
      missing_labels+=("$label")
    fi
  done

  if [[ $labels_present -eq ${#REQUIRED_LABELS[@]} ]]; then
    log_success "Required labels present ($labels_present/${#REQUIRED_LABELS[@]})"
    ((passed++))
  else
    log_error "Missing labels (${#missing_labels[@]}): ${missing_labels[*]}"
    ((failed++))
  fi

  # Check required annotations
  local annotations_present=0
  local missing_annotations=()

  for annotation in "${REQUIRED_ANNOTATIONS[@]}"; do
    local value
    value=$(yq eval ".metadata.annotations.\"$annotation\"" "$file")
    if [[ "$value" != "null" && -n "$value" ]]; then
      ((annotations_present++))
    else
      missing_annotations+=("$annotation")
    fi
  done

  if [[ $annotations_present -eq ${#REQUIRED_ANNOTATIONS[@]} ]]; then
    log_success "Required annotations present ($annotations_present/${#REQUIRED_ANNOTATIONS[@]})"
    ((passed++))
  else
    log_error "Missing annotations (${#missing_annotations[@]}): ${missing_annotations[*]}"
    ((failed++))
  fi

  # Check namespace
  local namespace
  namespace=$(yq eval '.metadata.namespace' "$file")
  if [[ "$namespace" == "$EXPECTED_NAMESPACE" ]]; then
    log_success "Namespace: $namespace"
    ((passed++))
  else
    log_error "Invalid namespace: $namespace (expected: $EXPECTED_NAMESPACE)"
    ((failed++))
  fi

  # Check name convention
  local name
  name=$(yq eval '.metadata.name' "$file")
  if [[ "$name" =~ ^llm-policy-engine- ]]; then
    log_success "Name follows convention: $name"
    ((passed++))
  else
    log_warning "Name may not follow convention: $name (expected: llm-policy-engine-*)"
    ((warnings++))
  fi

  # Check scope annotations
  local cluster_wide namespace_wide
  cluster_wide=$(yq eval '.metadata.annotations."sealedsecrets.bitnami.com/cluster-wide"' "$file")
  namespace_wide=$(yq eval '.metadata.annotations."sealedsecrets.bitnami.com/namespace-wide"' "$file")

  if [[ "$cluster_wide" == "false" && "$namespace_wide" == "false" ]]; then
    log_success "Scope: strict (cluster-wide: false, namespace-wide: false)"
    ((passed++))
  else
    log_error "Scope not set to strict (cluster-wide: $cluster_wide, namespace-wide: $namespace_wide)"
    ((failed++))
  fi

  TOTAL_PASSED=$((TOTAL_PASSED + passed))
  TOTAL_FAILED=$((TOTAL_FAILED + failed))
  TOTAL_WARNINGS=$((TOTAL_WARNINGS + warnings))

  [[ $failed -eq 0 ]]
}

# Validate security properties
validate_security() {
  local file="$1"
  local passed=0
  local failed=0
  local warnings=0

  log_section "Security Validation"

  # Check all data is encrypted
  local encrypted_count plaintext_found=false
  encrypted_count=$(yq eval '.spec.encryptedData | keys | length' "$file")

  # Verify encryption format (AgA... pattern for AES-GCM)
  local invalid_encryption=()
  while IFS= read -r key; do
    local value
    value=$(yq eval ".spec.encryptedData.\"$key\"" "$file")
    if [[ ! "$value" =~ ^AgA ]]; then
      invalid_encryption+=("$key")
      plaintext_found=true
    fi
  done < <(yq eval '.spec.encryptedData | keys | .[]' "$file")

  if [[ "$plaintext_found" == "false" && $encrypted_count -gt 0 ]]; then
    log_success "All data encrypted ($encrypted_count fields)"
    ((passed++))
  else
    log_error "Invalid encryption format in fields: ${invalid_encryption[*]}"
    ((failed++))
  fi

  # Check for plaintext sections
  local has_string_data has_data
  has_string_data=$(yq eval '.stringData' "$file")
  has_data=$(yq eval '.data' "$file")

  if [[ "$has_string_data" == "null" && "$has_data" == "null" ]]; then
    log_success "No plaintext secrets (no stringData or data sections)"
    ((passed++))
  else
    log_error "Plaintext secrets found (stringData or data sections present)"
    ((failed++))
  fi

  # Verify strict scope
  local cluster_wide namespace_wide
  cluster_wide=$(yq eval '.metadata.annotations."sealedsecrets.bitnami.com/cluster-wide"' "$file")
  namespace_wide=$(yq eval '.metadata.annotations."sealedsecrets.bitnami.com/namespace-wide"' "$file")

  if [[ "$cluster_wide" == "false" && "$namespace_wide" == "false" ]]; then
    log_success "Scope set to strict (not cluster-wide or namespace-wide)"
    ((passed++))
  else
    log_error "Insecure scope configuration (cluster-wide: $cluster_wide, namespace-wide: $namespace_wide)"
    ((failed++))
  fi

  # Check encryption algorithm (optional with kubeseal)
  if command -v kubeseal &> /dev/null; then
    if kubeseal --validate <"$file" &> /dev/null; then
      log_success "kubeseal validation passed"
      ((passed++))
    else
      log_warning "kubeseal validation failed (may indicate encryption issues)"
      ((warnings++))
    fi
  fi

  TOTAL_PASSED=$((TOTAL_PASSED + passed))
  TOTAL_FAILED=$((TOTAL_FAILED + failed))
  TOTAL_WARNINGS=$((TOTAL_WARNINGS + warnings))

  [[ $failed -eq 0 ]]
}

# Validate policy compliance
validate_policy() {
  local file="$1"
  local passed=0
  local failed=0
  local warnings=0

  log_section "Policy Validation"

  # Check environment label
  local environment
  environment=$(yq eval '.metadata.labels.environment' "$file")
  local valid_env=false
  for env in "${VALID_ENVIRONMENTS[@]}"; do
    if [[ "$environment" == "$env" ]]; then
      valid_env=true
      break
    fi
  done

  if [[ "$valid_env" == "true" ]]; then
    log_success "Environment: $environment"
    ((passed++))
  else
    log_error "Invalid environment: $environment (expected one of: ${VALID_ENVIRONMENTS[*]})"
    ((failed++))
  fi

  # Check version label
  local version
  version=$(yq eval '.metadata.labels.version' "$file")
  if [[ "$version" != "null" && -n "$version" ]]; then
    log_success "Version: $version"
    ((passed++))
  else
    log_error "Version label missing"
    ((failed++))
  fi

  # Check rotation policy
  local rotation_policy
  rotation_policy=$(yq eval '.metadata.labels.rotation-policy' "$file")
  local valid_policy=false
  for policy in "${VALID_ROTATION_POLICIES[@]}"; do
    if [[ "$rotation_policy" == "$policy" ]]; then
      valid_policy=true
      break
    fi
  done

  if [[ "$valid_policy" == "true" ]]; then
    log_success "Rotation policy: $rotation_policy"
    ((passed++))
  else
    log_error "Invalid rotation policy: $rotation_policy (expected one of: ${VALID_ROTATION_POLICIES[*]})"
    ((failed++))
  fi

  # Check rotation schedule
  local rotation_schedule
  rotation_schedule=$(yq eval '.metadata.annotations.rotation-schedule' "$file")
  if [[ "$rotation_schedule" != "null" && -n "$rotation_schedule" ]]; then
    log_success "Rotation schedule: $rotation_schedule"
    ((passed++))
  else
    log_error "Rotation schedule annotation missing"
    ((failed++))
  fi

  # Check last-rotated date
  local last_rotated
  last_rotated=$(yq eval '.metadata.annotations.last-rotated' "$file")
  if [[ "$last_rotated" != "null" && -n "$last_rotated" ]]; then
    if date -d "$last_rotated" &> /dev/null 2>&1 || date -j -f "%Y-%m-%d" "$last_rotated" &> /dev/null 2>&1; then
      log_success "Last rotated: $last_rotated"
      ((passed++))
    else
      log_error "Invalid last-rotated date format: $last_rotated"
      ((failed++))
    fi
  else
    log_error "Last rotated annotation missing"
    ((failed++))
  fi

  # Check next-rotation date
  local next_rotation
  next_rotation=$(yq eval '.metadata.annotations.next-rotation' "$file")
  if [[ "$next_rotation" != "null" && -n "$next_rotation" ]]; then
    local next_epoch today_epoch days_until

    if date -d "$next_rotation" &> /dev/null 2>&1; then
      # GNU date (Linux)
      next_epoch=$(date -d "$next_rotation" +%s)
      today_epoch=$(date +%s)
    elif date -j -f "%Y-%m-%d" "$next_rotation" &> /dev/null 2>&1; then
      # BSD date (macOS)
      next_epoch=$(date -j -f "%Y-%m-%d" "$next_rotation" +%s)
      today_epoch=$(date +%s)
    else
      log_error "Invalid next-rotation date format: $next_rotation"
      ((failed++))
      TOTAL_PASSED=$((TOTAL_PASSED + passed))
      TOTAL_FAILED=$((TOTAL_FAILED + failed))
      TOTAL_WARNINGS=$((TOTAL_WARNINGS + warnings))
      [[ $failed -eq 0 ]]
      return
    fi

    days_until=$(( (next_epoch - today_epoch) / 86400 ))

    if [[ $days_until -lt 0 ]]; then
      log_error "Next rotation: $next_rotation (overdue by ${days_until#-} days)"
      ((failed++))
    elif [[ $days_until -lt 30 ]]; then
      log_warning "Next rotation: $next_rotation (in $days_until days - due soon)"
      ((warnings++))
    else
      log_success "Next rotation: $next_rotation (in $days_until days)"
      ((passed++))
    fi
  else
    log_error "Next rotation annotation missing"
    ((failed++))
  fi

  # Check secret-type matches filename
  local secret_type filename
  secret_type=$(yq eval '.metadata.labels.secret-type' "$file")
  filename=$(basename "$file" | sed 's/-sealedsecret\.yaml$//')

  if [[ "$secret_type" == "$filename" || "$secret_type" == "${filename//-/_}" ]]; then
    log_success "Secret type matches filename: $secret_type"
    ((passed++))
  else
    log_warning "Secret type ($secret_type) may not match filename ($filename)"
    ((warnings++))
  fi

  TOTAL_PASSED=$((TOTAL_PASSED + passed))
  TOTAL_FAILED=$((TOTAL_FAILED + failed))
  TOTAL_WARNINGS=$((TOTAL_WARNINGS + warnings))

  [[ $failed -eq 0 ]]
}

# Validate a single file
validate_file() {
  local file="$1"
  local file_passed=true

  if [[ "$OPT_JSON" == "false" ]]; then
    echo ""
    echo "======================================================================"
    log_info "Validating: $file"
    echo "======================================================================"
  fi

  # Check file exists and is readable
  if [[ ! -f "$file" ]]; then
    log_error "File not found: $file"
    return 3
  fi

  if [[ ! -r "$file" ]]; then
    log_error "File not readable: $file"
    return 3
  fi

  # Run all validations
  if ! validate_yaml_syntax "$file"; then
    file_passed=false
  fi

  if ! validate_semantics "$file"; then
    file_passed=false
  fi

  if ! validate_security "$file"; then
    file_passed=false
  fi

  if ! validate_policy "$file"; then
    file_passed=false
  fi

  # Summary for this file
  if [[ "$OPT_JSON" == "false" ]]; then
    echo ""
    log_section "Summary for $(basename "$file")"
    echo "Passed:   $TOTAL_PASSED"
    echo "Warnings: $TOTAL_WARNINGS"
    echo "Failed:   $TOTAL_FAILED"
    echo ""

    if [[ "$file_passed" == "true" ]]; then
      if [[ "$OPT_CI" == "true" ]]; then
        echo "Result: PASS"
      else
        echo -e "${GREEN}${BOLD}Result: PASS${NC}"
      fi
    else
      if [[ "$OPT_CI" == "true" ]]; then
        echo "Result: FAIL"
      else
        echo -e "${RED}${BOLD}Result: FAIL${NC}"
      fi
    fi
  fi

  if [[ "$file_passed" == "false" ]]; then
    return 1
  fi

  if [[ "$OPT_STRICT" == "true" && $TOTAL_WARNINGS -gt 0 ]]; then
    return 1
  fi

  return 0
}

# Output JSON results
output_json() {
  local overall_result="pass"

  if [[ $TOTAL_FAILED -gt 0 ]]; then
    overall_result="fail"
  elif [[ "$OPT_STRICT" == "true" && $TOTAL_WARNINGS -gt 0 ]]; then
    overall_result="fail"
  elif [[ $TOTAL_WARNINGS -gt 0 ]]; then
    overall_result="pass_with_warnings"
  fi

  cat <<EOF
{
  "summary": {
    "passed": $TOTAL_PASSED,
    "failed": $TOTAL_FAILED,
    "warnings": $TOTAL_WARNINGS,
    "result": "$overall_result"
  },
  "validation_timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "script_version": "$VERSION"
}
EOF
}

################################################################################
# Main
################################################################################

main() {
  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h)
        show_usage
        ;;
      --all)
        OPT_ALL=true
        shift
        ;;
      --strict)
        OPT_STRICT=true
        shift
        ;;
      --ci)
        OPT_CI=true
        # Disable colors in CI mode
        RED=''
        GREEN=''
        YELLOW=''
        BLUE=''
        BOLD=''
        NC=''
        shift
        ;;
      --json)
        OPT_JSON=true
        shift
        ;;
      -*)
        echo "ERROR: Unknown option: $1" >&2
        echo "Use --help for usage information" >&2
        exit 2
        ;;
      *)
        if [[ -z "$TARGET_FILE" ]]; then
          TARGET_FILE="$1"
        else
          echo "ERROR: Multiple files specified. Use --all to validate all files." >&2
          exit 2
        fi
        shift
        ;;
    esac
  done

  # Check dependencies
  check_dependencies

  # Determine files to validate
  local files_to_validate=()

  if [[ "$OPT_ALL" == "true" ]]; then
    if [[ ! -d "$MANIFESTS_DIR" ]]; then
      echo "ERROR: Manifests directory not found: $MANIFESTS_DIR" >&2
      exit 3
    fi

    while IFS= read -r -d '' file; do
      files_to_validate+=("$file")
    done < <(find "$MANIFESTS_DIR" -name "*-sealedsecret.yaml" -print0 2>/dev/null)

    if [[ ${#files_to_validate[@]} -eq 0 ]]; then
      echo "ERROR: No SealedSecret manifests found in $MANIFESTS_DIR" >&2
      exit 3
    fi
  elif [[ -n "$TARGET_FILE" ]]; then
    files_to_validate=("$TARGET_FILE")
  else
    echo "ERROR: No file specified. Use a file path or --all" >&2
    echo "Use --help for usage information" >&2
    exit 2
  fi

  # Header
  if [[ "$OPT_JSON" == "false" ]]; then
    if [[ "$OPT_CI" == "true" ]]; then
      echo "SealedSecret Validation Script v$VERSION"
      echo "Validating ${#files_to_validate[@]} file(s)"
      echo ""
    else
      echo -e "${BOLD}SealedSecret Validation Script v$VERSION${NC}"
      echo -e "${BLUE}Validating ${#files_to_validate[@]} file(s)${NC}"
      echo ""
    fi
  fi

  # Validate all files
  local exit_code=0
  for file in "${files_to_validate[@]}"; do
    if ! validate_file "$file"; then
      exit_code=1
    fi
  done

  # Overall summary
  if [[ "$OPT_JSON" == "true" ]]; then
    output_json
  elif [[ ${#files_to_validate[@]} -gt 1 ]]; then
    echo ""
    echo "======================================================================"
    log_section "Overall Summary"
    echo "======================================================================"
    echo "Files validated: ${#files_to_validate[@]}"
    echo "Total passed:    $TOTAL_PASSED"
    echo "Total warnings:  $TOTAL_WARNINGS"
    echo "Total failed:    $TOTAL_FAILED"
    echo ""

    if [[ $exit_code -eq 0 ]]; then
      if [[ "$OPT_STRICT" == "true" && $TOTAL_WARNINGS -gt 0 ]]; then
        if [[ "$OPT_CI" == "true" ]]; then
          echo "Overall Result: FAIL (strict mode, warnings present)"
        else
          echo -e "${RED}${BOLD}Overall Result: FAIL (strict mode, warnings present)${NC}"
        fi
        exit_code=1
      else
        if [[ "$OPT_CI" == "true" ]]; then
          echo "Overall Result: PASS"
        else
          echo -e "${GREEN}${BOLD}Overall Result: PASS${NC}"
        fi
      fi
    else
      if [[ "$OPT_CI" == "true" ]]; then
        echo "Overall Result: FAIL"
      else
        echo -e "${RED}${BOLD}Overall Result: FAIL${NC}"
      fi
    fi
  fi

  exit $exit_code
}

# Run main function
main "$@"
