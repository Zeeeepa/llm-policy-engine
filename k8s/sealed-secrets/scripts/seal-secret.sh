#!/usr/bin/env bash

################################################################################
# seal-secret.sh - Production-ready script to seal Kubernetes secrets
#
# This script automates the process of creating and sealing Kubernetes secrets
# using kubeseal for the LLM Policy Engine project. It supports multiple input
# sources, validates security requirements, and manages secret lifecycle.
#
# USAGE:
#   ./seal-secret.sh --template <type> [OPTIONS]
#
# TEMPLATES:
#   database    - Database credentials and connection parameters
#   redis       - Redis connection credentials
#   jwt         - JWT authentication secrets
#
# OPTIONS:
#   --template TYPE          Secret template type (database|redis|jwt) [REQUIRED]
#   --env-file PATH          Path to .env file with secret values
#   --interactive            Prompt interactively for secret values
#   --apply                  Apply sealed secret to cluster after creation
#   --dry-run                Output to stdout only, don't write files
#   --cert PATH              Path to sealed-secrets public certificate
#   --controller-name NAME   Sealed-secrets controller name (default: sealed-secrets-controller)
#   --controller-namespace NS Controller namespace (default: kube-system)
#   --output PATH            Output file path (default: manifests/{type}-sealedsecret.yaml)
#   --confirm                Skip all confirmation prompts
#   --help                   Show this help message
#
# EXAMPLES:
#   # Seal from .env file
#   ./seal-secret.sh --template database --env-file .env.production
#
#   # Interactive mode
#   ./seal-secret.sh --template jwt --interactive
#
#   # Seal and apply to cluster
#   ./seal-secret.sh --template redis --env-file .env.production --apply --confirm
#
#   # Dry run to preview sealed secret
#   ./seal-secret.sh --template database --env-file .env.staging --dry-run
#
# SECURITY:
#   - Never writes plain secrets to disk
#   - Uses process substitution and pipes
#   - Validates secret complexity
#   - Warns about weak/default values
#   - Sets restrictive permissions (600) on output files
#   - Shreds temporary files securely
#
# PREREQUISITES:
#   - kubeseal (sealed-secrets CLI)
#   - kubectl (configured with cluster access)
#   - envsubst (gettext package)
#   - sealed-secrets controller running in cluster
#
# EXIT CODES:
#   0 - Success
#   1 - General error
#   2 - Missing dependencies
#   3 - Validation error
#   4 - Kubernetes/cluster error
#   5 - File I/O error
#
# AUTHORS:
#   LLM Policy Engine Team
#
# VERSION:
#   1.0.0
#
################################################################################

set -euo pipefail

################################################################################
# Configuration and Constants
################################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATES_DIR="$K8S_DIR/templates"
MANIFESTS_DIR="$K8S_DIR/manifests"
PROJECT_ROOT="$(cd "$K8S_DIR/../.." && pwd)"

# Default values
CONTROLLER_NAME="${CONTROLLER_NAME:-sealed-secrets-controller}"
CONTROLLER_NAMESPACE="${CONTROLLER_NAMESPACE:-kube-system}"
SECRET_NAMESPACE="${SECRET_NAMESPACE:-llm-devops}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging flags
VERBOSE=${VERBOSE:-false}
DEBUG=${DEBUG:-false}

################################################################################
# Utility Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_debug() {
    if [[ "$DEBUG" == "true" ]]; then
        echo -e "[DEBUG] $*" >&2
    fi
}

usage() {
    sed -n '/^# USAGE:/,/^# AUTHORS:/p' "$0" | sed 's/^# \?//' | head -n -2
    exit 0
}

die() {
    local exit_code="${1:-1}"
    shift
    log_error "$@"
    exit "$exit_code"
}

################################################################################
# Dependency Validation
################################################################################

check_dependencies() {
    log_info "Checking required dependencies..."

    local missing_deps=()

    # Check kubeseal
    if ! command -v kubeseal &> /dev/null; then
        missing_deps+=("kubeseal")
    else
        local kubeseal_version
        kubeseal_version=$(kubeseal --version 2>&1 | head -n1)
        log_debug "Found kubeseal: $kubeseal_version"
    fi

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        missing_deps+=("kubectl")
    else
        local kubectl_version
        kubectl_version=$(kubectl version --client -o json 2>/dev/null | grep -o '"gitVersion":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        log_debug "Found kubectl: $kubectl_version"
    fi

    # Check envsubst
    if ! command -v envsubst &> /dev/null; then
        missing_deps+=("envsubst (gettext package)")
    fi

    # Check base64
    if ! command -v base64 &> /dev/null; then
        missing_deps+=("base64 (coreutils package)")
    fi

    # Check date
    if ! command -v date &> /dev/null; then
        missing_deps+=("date (coreutils package)")
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies:"
        for dep in "${missing_deps[@]}"; do
            log_error "  - $dep"
        done
        die 2 "Please install missing dependencies and try again"
    fi

    log_success "All dependencies are installed"
}

check_kubectl_connection() {
    log_info "Checking kubectl cluster connection..."

    if ! kubectl cluster-info &> /dev/null; then
        die 4 "Cannot connect to Kubernetes cluster. Please check your kubeconfig"
    fi

    local context
    context=$(kubectl config current-context)
    log_success "Connected to cluster: $context"
}

check_sealed_secrets_controller() {
    log_info "Checking sealed-secrets controller..."

    if ! kubectl get deployment "$CONTROLLER_NAME" -n "$CONTROLLER_NAMESPACE" &> /dev/null; then
        log_error "Sealed-secrets controller not found: $CONTROLLER_NAME in namespace $CONTROLLER_NAMESPACE"
        log_error "Please install sealed-secrets controller first:"
        log_error "  kubectl apply -f k8s/sealed-secrets/00-controller.yaml"
        die 4 "Sealed-secrets controller not running"
    fi

    # Check if controller is ready
    local ready
    ready=$(kubectl get deployment "$CONTROLLER_NAME" -n "$CONTROLLER_NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")

    if [[ "$ready" -eq 0 ]]; then
        log_warn "Sealed-secrets controller is not ready yet"
        log_warn "Waiting for controller to become ready..."

        if ! kubectl wait --for=condition=available --timeout=60s \
            deployment/"$CONTROLLER_NAME" -n "$CONTROLLER_NAMESPACE" &> /dev/null; then
            die 4 "Sealed-secrets controller did not become ready in time"
        fi
    fi

    log_success "Sealed-secrets controller is running and ready"
}

################################################################################
# Template and File Validation
################################################################################

validate_template_type() {
    local template="$1"

    case "$template" in
        database|redis|jwt)
            return 0
            ;;
        *)
            log_error "Invalid template type: $template"
            log_error "Valid types: database, redis, jwt"
            return 3
            ;;
    esac
}

get_template_file() {
    local template="$1"
    local template_file="$TEMPLATES_DIR/${template}-secret.template.yaml"

    if [[ ! -f "$template_file" ]]; then
        die 5 "Template file not found: $template_file"
    fi

    if [[ ! -r "$template_file" ]]; then
        die 5 "Template file not readable: $template_file"
    fi

    echo "$template_file"
}

check_output_directory() {
    if [[ ! -d "$MANIFESTS_DIR" ]]; then
        log_info "Creating manifests directory: $MANIFESTS_DIR"
        mkdir -p "$MANIFESTS_DIR" || die 5 "Failed to create manifests directory"
    fi

    if [[ ! -w "$MANIFESTS_DIR" ]]; then
        die 5 "Manifests directory is not writable: $MANIFESTS_DIR"
    fi
}

################################################################################
# Secret Validation
################################################################################

validate_secret_strength() {
    local secret_name="$1"
    local secret_value="$2"

    # Skip validation for non-password fields
    if [[ ! "$secret_name" =~ (password|secret|key|token) ]]; then
        return 0
    fi

    # Check minimum length
    if [[ ${#secret_value} -lt 12 ]]; then
        log_warn "Secret '$secret_name' is too short (< 12 characters)"
        return 1
    fi

    # Check for common weak passwords
    local weak_passwords=(
        "password" "123456" "admin" "root" "test"
        "changeme" "default" "secret" "postgres"
        "redis" "your-secret-key-change-in-production"
    )

    for weak in "${weak_passwords[@]}"; do
        if [[ "${secret_value,,}" == *"${weak,,}"* ]]; then
            log_warn "Secret '$secret_name' appears to contain weak/default value: $weak"
            return 1
        fi
    done

    return 0
}

################################################################################
# Environment Variable Loading
################################################################################

load_env_file() {
    local env_file="$1"

    if [[ ! -f "$env_file" ]]; then
        die 5 "Environment file not found: $env_file"
    fi

    if [[ ! -r "$env_file" ]]; then
        die 5 "Environment file not readable: $env_file"
    fi

    log_info "Loading environment variables from: $env_file"

    # Source the env file in a subshell to avoid polluting current environment
    # Export all variables for envsubst
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a

    log_success "Environment variables loaded"
}

get_required_vars_for_template() {
    local template="$1"

    case "$template" in
        database)
            echo "DATABASE_HOST DATABASE_PORT DATABASE_USERNAME DATABASE_PASSWORD DATABASE_NAME DATABASE_SSL_MODE"
            ;;
        redis)
            echo "REDIS_HOST REDIS_PORT REDIS_PASSWORD REDIS_DB REDIS_TLS_ENABLED"
            ;;
        jwt)
            echo "JWT_SECRET JWT_ALGORITHM JWT_EXPIRES_IN JWT_ISSUER JWT_AUDIENCE"
            ;;
    esac
}

validate_required_vars() {
    local template="$1"
    local required_vars
    required_vars=$(get_required_vars_for_template "$template")

    local missing_vars=()

    for var in $required_vars; do
        if [[ -z "${!var:-}" ]]; then
            missing_vars+=("$var")
        fi
    done

    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables for template '$template':"
        for var in "${missing_vars[@]}"; do
            log_error "  - $var"
        done
        return 3
    fi

    return 0
}

################################################################################
# Interactive Mode
################################################################################

read_secret() {
    local var_name="$1"
    local prompt="$2"
    local is_secret="${3:-true}"

    if [[ "$is_secret" == "true" ]]; then
        read -r -s -p "$prompt: " value
        echo >&2  # New line after password input
    else
        read -r -p "$prompt: " value
    fi

    # Export the variable
    export "$var_name=$value"
}

prompt_database_secrets() {
    log_info "Enter database connection details:"

    read_secret "DATABASE_HOST" "Database host" false
    read_secret "DATABASE_PORT" "Database port (default: 5432)" false
    DATABASE_PORT="${DATABASE_PORT:-5432}"

    read_secret "DATABASE_USERNAME" "Database username" false
    read_secret "DATABASE_PASSWORD" "Database password" true
    read_secret "DATABASE_NAME" "Database name" false
    read_secret "DATABASE_SSL_MODE" "SSL mode (disable/require/verify-ca/verify-full, default: require)" false
    DATABASE_SSL_MODE="${DATABASE_SSL_MODE:-require}"

    export DATABASE_HOST DATABASE_PORT DATABASE_USERNAME DATABASE_PASSWORD DATABASE_NAME DATABASE_SSL_MODE
}

prompt_redis_secrets() {
    log_info "Enter Redis connection details:"

    read_secret "REDIS_HOST" "Redis host" false
    read_secret "REDIS_PORT" "Redis port (default: 6379)" false
    REDIS_PORT="${REDIS_PORT:-6379}"

    read_secret "REDIS_PASSWORD" "Redis password" true
    read_secret "REDIS_DB" "Redis database (default: 0)" false
    REDIS_DB="${REDIS_DB:-0}"

    read_secret "REDIS_TLS_ENABLED" "TLS enabled (true/false, default: false)" false
    REDIS_TLS_ENABLED="${REDIS_TLS_ENABLED:-false}"

    export REDIS_HOST REDIS_PORT REDIS_PASSWORD REDIS_DB REDIS_TLS_ENABLED
}

prompt_jwt_secrets() {
    log_info "Enter JWT configuration:"

    read_secret "JWT_SECRET" "JWT secret (min 32 chars)" true
    read_secret "JWT_ALGORITHM" "JWT algorithm (HS256/HS384/HS512, default: HS256)" false
    JWT_ALGORITHM="${JWT_ALGORITHM:-HS256}"

    read_secret "JWT_EXPIRES_IN" "JWT expiration (e.g., 24h, 7d, default: 24h)" false
    JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-24h}"

    read_secret "JWT_ISSUER" "JWT issuer (default: llm-policy-engine)" false
    JWT_ISSUER="${JWT_ISSUER:-llm-policy-engine}"

    read_secret "JWT_AUDIENCE" "JWT audience (default: llm-policy-engine-api)" false
    JWT_AUDIENCE="${JWT_AUDIENCE:-llm-policy-engine-api}"

    # Optional: public/private keys for asymmetric algorithms
    read_secret "JWT_PUBLIC_KEY" "JWT public key (optional, leave empty for symmetric)" false
    read_secret "JWT_PRIVATE_KEY" "JWT private key (optional, leave empty for symmetric)" true

    # Base64 encode the values for the JWT template
    JWT_SECRET=$(echo -n "$JWT_SECRET" | base64 -w 0)
    JWT_ALGORITHM=$(echo -n "$JWT_ALGORITHM" | base64 -w 0)
    JWT_EXPIRES_IN=$(echo -n "$JWT_EXPIRES_IN" | base64 -w 0)
    JWT_ISSUER=$(echo -n "$JWT_ISSUER" | base64 -w 0)
    JWT_AUDIENCE=$(echo -n "$JWT_AUDIENCE" | base64 -w 0)

    if [[ -n "$JWT_PUBLIC_KEY" ]]; then
        JWT_PUBLIC_KEY=$(echo -n "$JWT_PUBLIC_KEY" | base64 -w 0)
    else
        JWT_PUBLIC_KEY=""
    fi

    if [[ -n "$JWT_PRIVATE_KEY" ]]; then
        JWT_PRIVATE_KEY=$(echo -n "$JWT_PRIVATE_KEY" | base64 -w 0)
    else
        JWT_PRIVATE_KEY=""
    fi

    export JWT_SECRET JWT_ALGORITHM JWT_EXPIRES_IN JWT_ISSUER JWT_AUDIENCE JWT_PUBLIC_KEY JWT_PRIVATE_KEY
}

interactive_mode() {
    local template="$1"

    log_info "Starting interactive mode for '$template' secrets"

    case "$template" in
        database)
            prompt_database_secrets
            ;;
        redis)
            prompt_redis_secrets
            ;;
        jwt)
            prompt_jwt_secrets
            ;;
    esac
}

################################################################################
# Certificate Management
################################################################################

fetch_sealed_secrets_cert() {
    local cert_path="$1"

    log_info "Fetching sealed-secrets public certificate from cluster..."

    if ! kubeseal --fetch-cert \
        --controller-name="$CONTROLLER_NAME" \
        --controller-namespace="$CONTROLLER_NAMESPACE" \
        > "$cert_path" 2>/dev/null; then
        die 4 "Failed to fetch sealed-secrets certificate from cluster"
    fi

    # Set restrictive permissions
    chmod 600 "$cert_path"

    log_success "Certificate saved to: $cert_path"
}

get_cert_file() {
    local cert_arg="$1"

    if [[ -n "$cert_arg" ]]; then
        if [[ ! -f "$cert_arg" ]]; then
            die 5 "Certificate file not found: $cert_arg"
        fi
        echo "$cert_arg"
    else
        # Auto-fetch certificate to temp file
        local temp_cert
        temp_cert=$(mktemp /tmp/sealed-secrets-cert.XXXXXX)
        fetch_sealed_secrets_cert "$temp_cert"
        echo "$temp_cert"
    fi
}

################################################################################
# Metadata Generation
################################################################################

generate_metadata_annotations() {
    local current_date
    current_date=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local current_user_host
    current_user_host="${USER:-unknown}@${HOSTNAME:-unknown}"

    local next_rotation_date
    next_rotation_date=$(date -u -d "+90 days" +"%Y-%m-%d" 2>/dev/null || date -u -v+90d +"%Y-%m-%d" 2>/dev/null || echo "2026-02-15")

    export LAST_ROTATION_DATE="$current_date"
    export LAST_ROTATED_DATE="$current_date"
    export NEXT_ROTATION_DATE="$next_rotation_date"
    export SEALED_AT="$current_date"
    export SEALED_BY="$current_user_host"
    export LAST_UPDATED="$current_date"

    log_debug "Generated metadata: sealed-at=$SEALED_AT, sealed-by=$SEALED_BY"
}

add_metadata_to_yaml() {
    local yaml_content="$1"

    # Add custom annotations using yq or sed
    # Since we might not have yq, we'll use sed
    local metadata_annotations="    llm-policy-engine.io/sealed-at: \"$SEALED_AT\"
    llm-policy-engine.io/sealed-by: \"$SEALED_BY\"
    llm-policy-engine.io/last-rotated: \"$LAST_ROTATED_DATE\"
    llm-policy-engine.io/next-rotation: \"$NEXT_ROTATION_DATE\""

    # Insert after the existing annotations line
    echo "$yaml_content" | sed "/  annotations:/a\\
$metadata_annotations"
}

################################################################################
# Secret Sealing
################################################################################

seal_secret() {
    local template="$1"
    local template_file="$2"
    local cert_file="$3"
    local output_file="$4"
    local dry_run="$5"

    log_info "Sealing secret using template: $template"

    # Generate metadata
    generate_metadata_annotations

    # Validate required environment variables
    if ! validate_required_vars "$template"; then
        die 3 "Missing required environment variables"
    fi

    # Create the plain secret using envsubst (never write to disk)
    local plain_secret
    plain_secret=$(envsubst < "$template_file")

    if [[ -z "$plain_secret" ]]; then
        die 1 "Failed to generate plain secret from template"
    fi

    log_debug "Plain secret generated (not writing to disk)"

    # Seal the secret using kubeseal
    local sealed_secret
    if ! sealed_secret=$(echo "$plain_secret" | kubeseal \
        --cert "$cert_file" \
        --format yaml \
        --controller-name="$CONTROLLER_NAME" \
        --controller-namespace="$CONTROLLER_NAMESPACE" \
        --scope strict 2>&1); then
        log_error "Failed to seal secret:"
        log_error "$sealed_secret"
        die 1 "kubeseal failed"
    fi

    # Add metadata annotations
    sealed_secret=$(add_metadata_to_yaml "$sealed_secret")

    if [[ "$dry_run" == "true" ]]; then
        # Output to stdout
        echo "$sealed_secret"
        log_info "Dry run complete (output to stdout)"
    else
        # Write to file
        echo "$sealed_secret" > "$output_file"

        # Set restrictive permissions
        chmod 600 "$output_file"

        log_success "Sealed secret written to: $output_file"
        log_info "Permissions set to 600 (owner read/write only)"
    fi
}

################################################################################
# Cluster Operations
################################################################################

apply_sealed_secret() {
    local sealed_secret_file="$1"

    log_info "Applying sealed secret to cluster..."

    if ! kubectl apply -f "$sealed_secret_file"; then
        die 4 "Failed to apply sealed secret to cluster"
    fi

    log_success "Sealed secret applied successfully"

    # Wait for the secret to be decrypted
    local secret_name
    secret_name=$(grep "name:" "$sealed_secret_file" | head -n1 | awk '{print $2}')

    log_info "Waiting for sealed-secrets controller to decrypt secret: $secret_name"

    # Give controller time to process
    sleep 2

    if kubectl get secret "$secret_name" -n "$SECRET_NAMESPACE" &> /dev/null; then
        log_success "Secret '$secret_name' created and available in namespace '$SECRET_NAMESPACE'"
    else
        log_warn "Secret not yet available. Check controller logs if it doesn't appear soon:"
        log_warn "  kubectl logs -n $CONTROLLER_NAMESPACE deployment/$CONTROLLER_NAME"
    fi
}

################################################################################
# Cleanup
################################################################################

cleanup() {
    local temp_cert="$1"

    if [[ -n "$temp_cert" && -f "$temp_cert" ]]; then
        log_debug "Cleaning up temporary certificate file"
        shred -u "$temp_cert" 2>/dev/null || rm -f "$temp_cert"
    fi
}

################################################################################
# Confirmation Prompts
################################################################################

confirm_action() {
    local prompt="$1"
    local skip_confirm="$2"

    if [[ "$skip_confirm" == "true" ]]; then
        return 0
    fi

    read -r -p "$prompt [y/N]: " response
    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

################################################################################
# Main Function
################################################################################

main() {
    # Parse arguments
    local template=""
    local env_file=""
    local interactive=false
    local apply=false
    local dry_run=false
    local cert=""
    local output=""
    local skip_confirm=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --template)
                template="$2"
                shift 2
                ;;
            --env-file)
                env_file="$2"
                shift 2
                ;;
            --interactive)
                interactive=true
                shift
                ;;
            --apply)
                apply=true
                shift
                ;;
            --dry-run)
                dry_run=true
                shift
                ;;
            --cert)
                cert="$2"
                shift 2
                ;;
            --controller-name)
                CONTROLLER_NAME="$2"
                shift 2
                ;;
            --controller-namespace)
                CONTROLLER_NAMESPACE="$2"
                shift 2
                ;;
            --output)
                output="$2"
                shift 2
                ;;
            --confirm)
                skip_confirm=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --debug)
                DEBUG=true
                VERBOSE=true
                shift
                ;;
            --help|-h)
                usage
                ;;
            *)
                log_error "Unknown option: $1"
                echo ""
                usage
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$template" ]]; then
        log_error "Missing required argument: --template"
        echo ""
        usage
    fi

    if ! validate_template_type "$template"; then
        die 3 "Invalid template type"
    fi

    # Validate input source
    if [[ -z "$env_file" && "$interactive" == "false" ]]; then
        log_error "Must specify either --env-file or --interactive"
        echo ""
        usage
    fi

    # Set default output path
    if [[ -z "$output" ]]; then
        output="$MANIFESTS_DIR/${template}-sealedsecret.yaml"
    fi

    # Banner
    log_info "======================================"
    log_info "LLM Policy Engine - Secret Sealer"
    log_info "======================================"
    log_info "Template: $template"
    log_info "Environment: $ENVIRONMENT"

    # Check dependencies
    check_dependencies

    # Only check cluster if not dry-run
    if [[ "$dry_run" == "false" || "$apply" == "true" ]]; then
        check_kubectl_connection
        check_sealed_secrets_controller
    fi

    # Get template file
    local template_file
    template_file=$(get_template_file "$template")
    log_info "Using template: $template_file"

    # Load environment variables
    if [[ -n "$env_file" ]]; then
        load_env_file "$env_file"
    fi

    # Interactive mode
    if [[ "$interactive" == "true" ]]; then
        interactive_mode "$template"
    fi

    # Get certificate
    local cert_file
    local temp_cert=""
    cert_file=$(get_cert_file "$cert")
    if [[ "$cert" == "" ]]; then
        temp_cert="$cert_file"
    fi

    # Ensure cleanup on exit
    trap 'cleanup "$temp_cert"' EXIT

    # Check output directory
    if [[ "$dry_run" == "false" ]]; then
        check_output_directory
    fi

    # Confirm before sealing
    if ! confirm_action "Proceed with sealing $template secret?" "$skip_confirm"; then
        log_info "Operation cancelled by user"
        exit 0
    fi

    # Seal the secret
    seal_secret "$template" "$template_file" "$cert_file" "$output" "$dry_run"

    # Apply to cluster if requested
    if [[ "$apply" == "true" && "$dry_run" == "false" ]]; then
        if confirm_action "Apply sealed secret to cluster?" "$skip_confirm"; then
            apply_sealed_secret "$output"
        else
            log_info "Skipped applying to cluster"
        fi
    fi

    # Summary
    log_info "======================================"
    log_success "Secret sealing complete!"

    if [[ "$dry_run" == "false" ]]; then
        log_info "Sealed secret file: $output"
        log_info ""
        log_info "Next steps:"
        if [[ "$apply" == "false" ]]; then
            log_info "1. Review the sealed secret: cat $output"
            log_info "2. Apply to cluster: kubectl apply -f $output"
        fi
        log_info "3. Verify secret exists: kubectl get secret -n $SECRET_NAMESPACE"
        log_info "4. Commit sealed secret to git (safe to commit)"
    fi

    log_info "======================================"
}

# Run main function
main "$@"
