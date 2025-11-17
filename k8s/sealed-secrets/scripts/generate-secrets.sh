#!/usr/bin/env bash

################################################################################
# LLM Policy Engine - Secret Generator
#
# Generates cryptographically strong secrets for the LLM Policy Engine
# using /dev/urandom and OpenSSL for maximum entropy.
#
# USAGE:
#   ./generate-secrets.sh [OPTIONS]
#
# OPTIONS:
#   --type TYPE           Secret type to generate: database|redis|jwt|all
#                         (default: all)
#   --output PATH         Output file path or - for stdout
#                         (default: .env.secrets)
#   --format FORMAT       Output format: env|json|yaml
#                         (default: env)
#   --length LENGTH       Password length for database/redis
#                         (default: 32, minimum: 16)
#   --jwt-algorithm ALG   JWT algorithm: HS256|RS256|ES256
#                         (default: HS256)
#   --environment ENV     Environment: dev|staging|production
#                         (default: production)
#   --help                Show this help message
#
# EXAMPLES:
#   # Generate all secrets to default file
#   ./generate-secrets.sh
#
#   # Generate only JWT secrets with RS256
#   ./generate-secrets.sh --type jwt --jwt-algorithm RS256
#
#   # Generate all secrets in JSON format
#   ./generate-secrets.sh --format json --output secrets.json
#
#   # Generate database secrets only to stdout
#   ./generate-secrets.sh --type database --output -
#
#   # Generate secrets for development environment
#   ./generate-secrets.sh --environment dev --output .env.development
#
# SECURITY:
#   - Uses /dev/urandom for cryptographic randomness
#   - Sets file permissions to 600 (owner read/write only)
#   - Validates entropy quality before generation
#   - Warns if writing to version-controlled directories
#
# EXIT CODES:
#   0 - Success
#   1 - Missing dependencies
#   2 - Invalid arguments
#   3 - File write error
#   4 - Insufficient entropy
#   5 - Permission error
#
################################################################################

set -euo pipefail

# Script metadata
readonly SCRIPT_VERSION="1.0.0"
readonly SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"

# Default configuration
DEFAULT_TYPE="all"
DEFAULT_OUTPUT=".env.secrets"
DEFAULT_FORMAT="env"
DEFAULT_LENGTH=32
DEFAULT_JWT_ALGORITHM="HS256"
DEFAULT_ENVIRONMENT="production"

# Minimum password length for security
readonly MIN_PASSWORD_LENGTH=16

# Configuration variables
TYPE="${DEFAULT_TYPE}"
OUTPUT="${DEFAULT_OUTPUT}"
FORMAT="${DEFAULT_FORMAT}"
LENGTH="${DEFAULT_LENGTH}"
JWT_ALGORITHM="${DEFAULT_JWT_ALGORITHM}"
ENVIRONMENT="${DEFAULT_ENVIRONMENT}"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

################################################################################
# Helper Functions
################################################################################

# Print colored message to stderr
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Show usage information
show_usage() {
    sed -n '2,/^################################################################################$/p' "$0" | sed 's/^# \?//'
    exit 0
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Validate dependencies
check_dependencies() {
    local missing_deps=()

    if ! command_exists openssl; then
        missing_deps+=("openssl")
    fi

    if ! command_exists base64; then
        missing_deps+=("base64")
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_error "Please install the missing dependencies and try again."
        exit 1
    fi

    log_info "All dependencies satisfied"
}

# Check system entropy
check_entropy() {
    if [[ -f /proc/sys/kernel/random/entropy_avail ]]; then
        local entropy
        entropy=$(cat /proc/sys/kernel/random/entropy_avail)
        log_info "System entropy: ${entropy} bits"

        if [[ $entropy -lt 100 ]]; then
            log_warning "Low system entropy (${entropy} bits). Generated secrets may be less random."
            log_warning "Consider installing haveged or rng-tools to improve entropy."
        fi
    else
        log_info "Cannot check entropy on this system (not Linux)"
    fi
}

# Validate arguments
validate_arguments() {
    # Validate type
    case "$TYPE" in
        database|redis|jwt|all)
            ;;
        *)
            log_error "Invalid type: $TYPE"
            log_error "Must be one of: database, redis, jwt, all"
            exit 2
            ;;
    esac

    # Validate format
    case "$FORMAT" in
        env|json|yaml)
            ;;
        *)
            log_error "Invalid format: $FORMAT"
            log_error "Must be one of: env, json, yaml"
            exit 2
            ;;
    esac

    # Validate length
    if [[ ! $LENGTH =~ ^[0-9]+$ ]]; then
        log_error "Invalid length: $LENGTH (must be a positive integer)"
        exit 2
    fi

    if [[ $LENGTH -lt $MIN_PASSWORD_LENGTH ]]; then
        log_error "Length too short: $LENGTH (minimum: $MIN_PASSWORD_LENGTH)"
        exit 2
    fi

    # Validate JWT algorithm
    case "$JWT_ALGORITHM" in
        HS256|RS256|ES256)
            ;;
        *)
            log_error "Invalid JWT algorithm: $JWT_ALGORITHM"
            log_error "Must be one of: HS256, RS256, ES256"
            exit 2
            ;;
    esac

    # Validate environment
    case "$ENVIRONMENT" in
        dev|staging|production)
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT"
            log_error "Must be one of: dev, staging, production"
            exit 2
            ;;
    esac

    # Validate output path
    if [[ "$OUTPUT" != "-" ]]; then
        local output_dir
        output_dir="$(dirname "$OUTPUT")"

        if [[ ! -d "$output_dir" ]]; then
            log_error "Output directory does not exist: $output_dir"
            exit 3
        fi

        if [[ ! -w "$output_dir" ]]; then
            log_error "Output directory is not writable: $output_dir"
            exit 5
        fi

        # Check if output file exists and warn
        if [[ -f "$OUTPUT" ]]; then
            log_warning "Output file already exists and will be overwritten: $OUTPUT"
        fi

        # Warn if writing to a git repository
        if git -C "$output_dir" rev-parse --git-dir >/dev/null 2>&1; then
            log_warning "Writing secrets to a git repository directory!"
            log_warning "Ensure $OUTPUT is in .gitignore to prevent accidental commits."
        fi
    fi
}

################################################################################
# Secret Generation Functions
################################################################################

# Generate a random password with specified length
# Uses alphanumeric characters and special characters
generate_password() {
    local length=$1

    # Use openssl for cryptographically secure random bytes
    # Character set: A-Z, a-z, 0-9, and safe special characters
    # Avoiding characters that might cause issues in URLs or configs: " ' ` \ $
    local charset='A-Za-z0-9!@#%^&*()_+-=[]{}|:;<>?,./'

    # Generate more bytes than needed to account for filtering
    local random_bytes
    random_bytes=$(openssl rand -base64 $((length * 2)))

    # Filter to allowed charset and take required length
    local password=""
    for ((i=0; i<${#random_bytes}; i++)); do
        local char="${random_bytes:$i:1}"
        if [[ "$charset" == *"$char"* ]]; then
            password+="$char"
            if [[ ${#password} -eq $length ]]; then
                break
            fi
        fi
    done

    # If we didn't get enough characters (very unlikely), generate more
    while [[ ${#password} -lt $length ]]; do
        random_bytes=$(openssl rand -base64 $((length * 2)))
        for ((i=0; i<${#random_bytes}; i++)); do
            local char="${random_bytes:$i:1}"
            if [[ "$charset" == *"$char"* ]]; then
                password+="$char"
                if [[ ${#password} -eq $length ]]; then
                    break 2
                fi
            fi
        done
    done

    echo "$password"
}

# Generate JWT secret (base64-encoded random bytes)
generate_jwt_secret() {
    # Generate 32 bytes (256 bits) for HS256
    openssl rand -base64 32 | tr -d '\n'
}

# Generate RSA key pair for JWT RS256
generate_rsa_keys() {
    local private_key
    local public_key

    log_info "Generating RSA-2048 key pair for JWT..."

    # Generate private key
    private_key=$(openssl genrsa 2048 2>/dev/null)

    # Extract public key
    public_key=$(echo "$private_key" | openssl rsa -pubout 2>/dev/null)

    echo "$private_key"
    echo "---PUBLIC_KEY_SEPARATOR---"
    echo "$public_key"
}

# Generate ES256 key pair for JWT
generate_es256_keys() {
    local private_key
    local public_key

    log_info "Generating EC P-256 key pair for JWT..."

    # Generate EC private key (P-256 curve for ES256)
    private_key=$(openssl ecparam -genkey -name prime256v1 2>/dev/null | openssl ec 2>/dev/null)

    # Extract public key
    public_key=$(echo "$private_key" | openssl ec -pubout 2>/dev/null)

    echo "$private_key"
    echo "---PUBLIC_KEY_SEPARATOR---"
    echo "$public_key"
}

################################################################################
# Secret Collection Functions
################################################################################

# Declare associative array for secrets
declare -A SECRETS

# Collect database secrets
collect_database_secrets() {
    log_info "Generating database secrets..."

    SECRETS["DATABASE_HOST"]="postgres"
    SECRETS["DATABASE_PORT"]="5432"
    SECRETS["DATABASE_USERNAME"]="llm_policy_engine"
    SECRETS["DATABASE_PASSWORD"]=$(generate_password "$LENGTH")
    SECRETS["DATABASE_NAME"]="llm_policy_engine"
    SECRETS["DATABASE_SSL_MODE"]="require"
}

# Collect Redis secrets
collect_redis_secrets() {
    log_info "Generating Redis secrets..."

    SECRETS["REDIS_HOST"]="redis"
    SECRETS["REDIS_PORT"]="6379"
    SECRETS["REDIS_PASSWORD"]=$(generate_password "$LENGTH")
    SECRETS["REDIS_DB"]="0"
    SECRETS["REDIS_TLS_ENABLED"]="true"
}

# Collect JWT secrets
collect_jwt_secrets() {
    log_info "Generating JWT secrets..."

    SECRETS["JWT_ALGORITHM"]="$JWT_ALGORITHM"
    SECRETS["JWT_EXPIRES_IN"]="1h"
    SECRETS["JWT_ISSUER"]="llm-policy-engine"
    SECRETS["JWT_AUDIENCE"]="llm-policy-engine-api"

    case "$JWT_ALGORITHM" in
        HS256)
            SECRETS["JWT_SECRET"]=$(generate_jwt_secret)
            ;;
        RS256)
            local keys
            keys=$(generate_rsa_keys)
            SECRETS["JWT_PRIVATE_KEY"]=$(echo "$keys" | sed -n '1,/---PUBLIC_KEY_SEPARATOR---/p' | sed '$d')
            SECRETS["JWT_PUBLIC_KEY"]=$(echo "$keys" | sed -n '/---PUBLIC_KEY_SEPARATOR---/,$p' | sed '1d')
            ;;
        ES256)
            local keys
            keys=$(generate_es256_keys)
            SECRETS["JWT_PRIVATE_KEY"]=$(echo "$keys" | sed -n '1,/---PUBLIC_KEY_SEPARATOR---/p' | sed '$d')
            SECRETS["JWT_PUBLIC_KEY"]=$(echo "$keys" | sed -n '/---PUBLIC_KEY_SEPARATOR---/,$p' | sed '1d')
            ;;
    esac
}

# Collect common metadata
collect_metadata() {
    SECRETS["ENVIRONMENT"]="$ENVIRONMENT"
    SECRETS["LAST_ROTATION_DATE"]=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
}

# Collect all requested secrets
collect_secrets() {
    case "$TYPE" in
        database)
            collect_database_secrets
            ;;
        redis)
            collect_redis_secrets
            ;;
        jwt)
            collect_jwt_secrets
            ;;
        all)
            collect_database_secrets
            collect_redis_secrets
            collect_jwt_secrets
            ;;
    esac

    collect_metadata

    log_success "Generated ${#SECRETS[@]} secret values"
}

################################################################################
# Output Formatting Functions
################################################################################

# Format secrets as .env file
format_env() {
    cat <<EOF
# LLM Policy Engine - Secrets Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Environment: $ENVIRONMENT
# Generated by: $SCRIPT_NAME v$SCRIPT_VERSION
#
# WARNING: This file contains sensitive secrets!
# - Do NOT commit this file to version control
# - Ensure this file has restrictive permissions (600)
# - Rotate secrets regularly (recommended: every 90 days)

EOF

    # Sort keys for consistent output
    local sorted_keys
    sorted_keys=($(for key in "${!SECRETS[@]}"; do echo "$key"; done | sort))

    for key in "${sorted_keys[@]}"; do
        local value="${SECRETS[$key]}"

        # Handle multiline values (like RSA keys)
        if [[ "$value" == *$'\n'* ]]; then
            # For multiline, use quotes and preserve newlines
            echo "${key}=\"${value}\""
        else
            echo "${key}=${value}"
        fi
    done
}

# Format secrets as JSON
format_json() {
    echo "{"
    echo "  \"_metadata\": {"
    echo "    \"generated\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
    echo "    \"environment\": \"$ENVIRONMENT\","
    echo "    \"generator\": \"$SCRIPT_NAME\","
    echo "    \"version\": \"$SCRIPT_VERSION\""
    echo "  },"

    # Sort keys for consistent output
    local sorted_keys
    sorted_keys=($(for key in "${!SECRETS[@]}"; do echo "$key"; done | sort))

    local last_key="${sorted_keys[-1]}"

    for key in "${sorted_keys[@]}"; do
        local value="${SECRETS[$key]}"

        # Escape special characters for JSON
        value=$(echo "$value" | sed 's/\\/\\\\/g; s/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')

        if [[ "$key" == "$last_key" ]]; then
            echo "  \"$key\": \"$value\""
        else
            echo "  \"$key\": \"$value\","
        fi
    done

    echo "}"
}

# Format secrets as YAML
format_yaml() {
    cat <<EOF
# LLM Policy Engine - Secrets Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Environment: $ENVIRONMENT
# Generated by: $SCRIPT_NAME v$SCRIPT_VERSION

_metadata:
  generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
  environment: $ENVIRONMENT
  generator: $SCRIPT_NAME
  version: $SCRIPT_VERSION

EOF

    # Sort keys for consistent output
    local sorted_keys
    sorted_keys=($(for key in "${!SECRETS[@]}"; do echo "$key"; done | sort))

    for key in "${sorted_keys[@]}"; do
        local value="${SECRETS[$key]}"

        # Handle multiline values (like RSA keys)
        if [[ "$value" == *$'\n'* ]]; then
            echo "${key}: |"
            echo "$value" | sed 's/^/  /'
        else
            # Escape quotes and special YAML characters
            if [[ "$value" =~ [:\{\}\[\],\&\*\#\?\|\-\<\>\=\!\%\@\\] ]]; then
                echo "${key}: \"${value}\""
            else
                echo "${key}: ${value}"
            fi
        fi
    done
}

# Format and output secrets
output_secrets() {
    local content

    case "$FORMAT" in
        env)
            content=$(format_env)
            ;;
        json)
            content=$(format_json)
            ;;
        yaml)
            content=$(format_yaml)
            ;;
    esac

    if [[ "$OUTPUT" == "-" ]]; then
        echo "$content"
    else
        echo "$content" > "$OUTPUT"

        # Set restrictive permissions
        chmod 600 "$OUTPUT"

        log_success "Secrets written to: $OUTPUT"
        log_info "File permissions set to 600 (owner read/write only)"

        # Show file info
        local file_size
        file_size=$(wc -c < "$OUTPUT")
        log_info "File size: ${file_size} bytes"
    fi
}

################################################################################
# Main Function
################################################################################

main() {
    log_info "$SCRIPT_NAME v$SCRIPT_VERSION"
    log_info "Generating secrets for LLM Policy Engine..."
    echo

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --type)
                TYPE="$2"
                shift 2
                ;;
            --output)
                OUTPUT="$2"
                shift 2
                ;;
            --format)
                FORMAT="$2"
                shift 2
                ;;
            --length)
                LENGTH="$2"
                shift 2
                ;;
            --jwt-algorithm)
                JWT_ALGORITHM="$2"
                shift 2
                ;;
            --environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --help|-h)
                show_usage
                ;;
            --version|-v)
                echo "$SCRIPT_NAME v$SCRIPT_VERSION"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 2
                ;;
        esac
    done

    # Validation
    check_dependencies
    check_entropy
    validate_arguments

    echo
    log_info "Configuration:"
    log_info "  Type: $TYPE"
    log_info "  Output: $OUTPUT"
    log_info "  Format: $FORMAT"
    log_info "  Password Length: $LENGTH"
    log_info "  JWT Algorithm: $JWT_ALGORITHM"
    log_info "  Environment: $ENVIRONMENT"
    echo

    # Generate secrets
    collect_secrets

    echo

    # Output secrets
    output_secrets

    echo
    log_success "Secret generation completed successfully!"

    if [[ "$OUTPUT" != "-" ]]; then
        echo
        log_info "Next steps:"
        log_info "  1. Review the generated secrets: $OUTPUT"
        log_info "  2. Add the file to .gitignore if not already present"
        log_info "  3. Load secrets into your environment or secret management system"
        log_info "  4. Securely back up the secrets in a password manager"
        log_info "  5. Set a reminder to rotate secrets in 90 days"
    fi
}

# Run main function
main "$@"
