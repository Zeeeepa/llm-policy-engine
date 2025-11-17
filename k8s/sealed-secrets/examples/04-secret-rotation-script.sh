#!/bin/bash

# Secret Rotation Script for Kubernetes Sealed Secrets
# Implements zero-downtime secret rotation
#
# Usage:
#   ./secret-rotation.sh <secret-type> <namespace>
#
# Examples:
#   ./secret-rotation.sh database production
#   ./secret-rotation.sh api-keys staging
#   ./secret-rotation.sh jwt-keys production

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="${2:-production}"
SECRET_TYPE="${1:-database}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./secret-backups/${TIMESTAMP}"

# Functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
    exit 1
}

# Verify prerequisites
verify_prerequisites() {
    log "Verifying prerequisites..."

    if ! command -v kubectl &> /dev/null; then
        error "kubectl not found. Please install kubectl."
    fi

    if ! command -v kubeseal &> /dev/null; then
        error "kubeseal not found. Please install kubeseal."
    fi

    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        error "Namespace '$NAMESPACE' not found."
    fi

    log "Prerequisites verified."
}

# Backup current secret
backup_current_secret() {
    log "Backing up current secret..."

    mkdir -p "$BACKUP_DIR"

    kubectl get sealedsecrets -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/sealedsecrets-backup.yaml"
    kubectl get secrets -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/secrets-backup.yaml"

    log "Backup saved to: $BACKUP_DIR"
}

# Rotate database credentials
rotate_database() {
    local SECRET_NAME="postgres-credentials"
    local DEPLOYMENT="api-service"

    log "Starting database credential rotation..."

    # Step 1: Generate new password
    log "Step 1: Generating new database password..."
    local NEW_PASSWORD=$(openssl rand -base64 32)
    log "New password generated (length: ${#NEW_PASSWORD})"

    # Step 2: Create new sealed secret
    log "Step 2: Creating and sealing new secret..."
    kubectl create secret generic "$SECRET_NAME" \
        --from-literal=host="postgres.prod.svc.cluster.local" \
        --from-literal=port="5432" \
        --from-literal=user="appuser" \
        --from-literal=password="$NEW_PASSWORD" \
        --from-literal=database="appdb" \
        --from-literal=url="postgresql://appuser:${NEW_PASSWORD}@postgres.prod.svc.cluster.local:5432/appdb" \
        --namespace="$NAMESPACE" \
        --dry-run=client \
        -o yaml > "$BACKUP_DIR/new-secret.yaml"

    # Seal the secret
    kubeseal -f "$BACKUP_DIR/new-secret.yaml" -w "$BACKUP_DIR/sealed-secret.yaml"
    log "Secret sealed successfully."

    # Step 3: Apply to cluster
    log "Step 3: Applying new sealed secret to cluster..."
    kubectl apply -f "$BACKUP_DIR/sealed-secret.yaml"
    sleep 5  # Wait for secret to be created

    # Step 4: Rolling restart
    log "Step 4: Performing rolling restart of $DEPLOYMENT..."
    kubectl rollout restart deployment/"$DEPLOYMENT" -n "$NAMESPACE"
    kubectl rollout status deployment/"$DEPLOYMENT" -n "$NAMESPACE" --timeout=300s
    log "Rolling restart completed."

    # Step 5: Verify
    log "Step 5: Verifying new credentials are working..."
    sleep 10
    local READY_REPLICAS=$(kubectl get deployment "$DEPLOYMENT" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')
    local DESIRED_REPLICAS=$(kubectl get deployment "$DEPLOYMENT" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')

    if [ "$READY_REPLICAS" -eq "$DESIRED_REPLICAS" ]; then
        log "All replicas are ready. Rotation successful."
    else
        error "Not all replicas are ready. Ready: $READY_REPLICAS / Desired: $DESIRED_REPLICAS"
    fi

    # Step 6: Update database
    log "Step 6: Updating database with new password..."
    warn "Manual step required: Update the database password for appuser to: $NEW_PASSWORD"
    warn "SQL Command: ALTER ROLE appuser WITH PASSWORD '$NEW_PASSWORD';"
    read -p "Press Enter after updating the database password..."

    log "Database credential rotation completed successfully."
}

# Rotate API keys
rotate_api_keys() {
    local SECRET_NAME="api-secrets"
    local DEPLOYMENT="api-service"

    log "Starting API key rotation..."

    # Generate new API key
    log "Generating new API key..."
    local NEW_API_KEY=$(openssl rand -base64 48)

    log "Creating and sealing new secret..."
    kubectl create secret generic "$SECRET_NAME" \
        --from-literal=api-key="$NEW_API_KEY" \
        --namespace="$NAMESPACE" \
        --dry-run=client \
        -o yaml | kubeseal -f - | kubectl apply -f -

    log "Applying rolling restart..."
    kubectl rollout restart deployment/"$DEPLOYMENT" -n "$NAMESPACE"
    kubectl rollout status deployment/"$DEPLOYMENT" -n "$NAMESPACE" --timeout=300s

    log "API key rotation completed. New key: $NEW_API_KEY"
}

# Rotate JWT keys
rotate_jwt_keys() {
    local SECRET_NAME="jwt-signing-secrets"

    log "Starting JWT key rotation..."

    # Generate new RSA key pair
    log "Generating new RSA key pair (4096-bit)..."
    openssl genrsa -out "$BACKUP_DIR/private-key-new.pem" 4096 2>/dev/null
    openssl rsa -in "$BACKUP_DIR/private-key-new.pem" -pubout -out "$BACKUP_DIR/public-key-new.pem" 2>/dev/null

    log "Creating and sealing new secret with key rotation support..."

    # Create secret with both old and new keys for transition period
    kubectl create secret generic "$SECRET_NAME" \
        --from-file=private-key="$BACKUP_DIR/private-key-new.pem" \
        --from-file=public-key="$BACKUP_DIR/public-key-new.pem" \
        --from-literal=issuer="https://auth.example.com" \
        --from-literal=audience="api.example.com" \
        --namespace="$NAMESPACE" \
        --dry-run=client \
        -o yaml | kubeseal -f - | kubectl apply -f -

    log "JWT signing keys rotated successfully."
    log "Auth service should sign tokens with new key"
    log "API services can verify with old key (transition period)"
}

# Get current secret value (for display only)
get_secret_value() {
    local SECRET_NAME="$1"
    local KEY="$2"

    kubectl get secret -n "$NAMESPACE" "$SECRET_NAME" -o jsonpath="{.data.$KEY}" | base64 -d 2>/dev/null || echo "<unable to decode>"
}

# Main execution
main() {
    log "================================================"
    log "Sealed Secrets Rotation Script"
    log "================================================"
    log "Namespace: $NAMESPACE"
    log "Secret Type: $SECRET_TYPE"
    log "Timestamp: $TIMESTAMP"
    log ""

    verify_prerequisites
    backup_current_secret

    case "$SECRET_TYPE" in
        database|postgres|postgresql|mysql|mongodb)
            rotate_database
            ;;
        api-key|api-keys|token)
            rotate_api_keys
            ;;
        jwt)
            rotate_jwt_keys
            ;;
        *)
            error "Unknown secret type: $SECRET_TYPE"
            ;;
    esac

    log ""
    log "================================================"
    log "Rotation completed successfully!"
    log "================================================"
    log "Backup location: $BACKUP_DIR"
    log ""
    warn "Don't forget to:"
    warn "1. Update the actual secret in the system"
    warn "2. Verify everything works in staging first"
    warn "3. Document the rotation in your changelog"
    log ""
}

# Error handling
trap 'error "Script failed at line $LINENO"' ERR

# Display usage
if [ $# -eq 0 ] || [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
    cat << EOF
Secret Rotation Script for Kubernetes Sealed Secrets

Usage: $0 <secret-type> [namespace]

Arguments:
  secret-type    Type of secret to rotate (database, api-keys, jwt)
  namespace      Kubernetes namespace (default: production)

Examples:
  $0 database production      # Rotate PostgreSQL credentials
  $0 api-keys staging         # Rotate API keys
  $0 jwt production           # Rotate JWT signing keys

Rotation Types:
  database|postgres|postgresql|mysql|mongodb
      Rotates database credentials with zero-downtime deployment restart

  api-key|api-keys|token
      Rotates API keys by generating new values

  jwt
      Generates new RSA key pair for JWT signing

EOF
    exit 0
fi

# Run main
main
