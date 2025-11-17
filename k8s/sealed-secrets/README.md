# Sealed Secrets for LLM Policy Engine

Production-ready Kubernetes secrets management using [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) by Bitnami.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Directory Structure](#directory-structure)
- [Usage Guide](#usage-guide)
- [Secret Types](#secret-types)
- [Workflows](#workflows)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)
- [References](#references)

## Overview

### What are Sealed Secrets?

Sealed Secrets provide a secure way to store Kubernetes secrets in version control by encrypting them using asymmetric cryptography. The SealedSecret controller runs in your Kubernetes cluster and automatically decrypts sealed secrets into regular Kubernetes secrets.

### Why Use Sealed Secrets?

Traditional Kubernetes secrets are base64-encoded, not encrypted. This means:
- You cannot safely commit them to Git
- Sharing secrets requires secure out-of-band channels
- Secret rotation is manual and error-prone
- Audit trails are difficult to maintain

Sealed Secrets solve these problems by:
- Encrypting secrets using public-key cryptography
- Allowing safe storage in Git repositories
- Enabling GitOps workflows for secrets
- Providing automatic decryption in the cluster
- Supporting secret rotation and lifecycle management

### Benefits

1. **Security**: Secrets are encrypted with cluster-specific keys
2. **GitOps-Friendly**: Sealed secrets can be safely committed to version control
3. **Scope Control**: Strict, namespace-wide, or cluster-wide encryption scopes
4. **Audit Trail**: Git history provides complete audit trail for secret changes
5. **Automation**: Enables CI/CD pipelines for secrets management
6. **No External Dependencies**: No need for external secret management services
7. **Kubernetes-Native**: Works seamlessly with existing Kubernetes workflows

## Architecture

### How It Works in This Project

```
┌─────────────────────────────────────────────────────────────────┐
│                    Development Workflow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Developer creates plain secrets                              │
│     └─> .env file with DATABASE_PASSWORD, etc.                   │
│                                                                   │
│  2. generate-secrets.sh creates cryptographic secrets            │
│     └─> Generates strong passwords, JWT keys, etc.               │
│                                                                   │
│  3. seal-secret.sh encrypts secrets                              │
│     ├─> Fetches public key from cluster                          │
│     ├─> Substitutes env vars into template                       │
│     ├─> Encrypts using kubeseal                                  │
│     └─> Creates SealedSecret YAML (safe for Git)                 │
│                                                                   │
│  4. Developer commits SealedSecret to Git                        │
│     └─> manifests/database-sealedsecret.yaml                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────┐            │
│  │  Sealed Secrets Controller (kube-system)         │            │
│  │  ┌────────────────────────────────────────────┐  │            │
│  │  │  - Watches for SealedSecret resources      │  │            │
│  │  │  - Decrypts using private key              │  │            │
│  │  │  - Creates standard Kubernetes Secret      │  │            │
│  │  │  - Updates status of SealedSecret          │  │            │
│  │  └────────────────────────────────────────────┘  │            │
│  └──────────────────────────────────────────────────┘            │
│                           │                                       │
│                           │ Decrypts                              │
│                           ▼                                       │
│  ┌──────────────────────────────────────────────────┐            │
│  │  Application Namespace (llm-devops)              │            │
│  │  ┌────────────────────────────────────────────┐  │            │
│  │  │  SealedSecret (encrypted, from Git)        │  │            │
│  │  └────────────────────────────────────────────┘  │            │
│  │                     │                             │            │
│  │                     │                             │            │
│  │                     ▼                             │            │
│  │  ┌────────────────────────────────────────────┐  │            │
│  │  │  Secret (decrypted, in-cluster only)       │  │            │
│  │  │  - database credentials                    │  │            │
│  │  │  - Redis credentials                       │  │            │
│  │  │  - JWT secrets                             │  │            │
│  │  └────────────────────────────────────────────┘  │            │
│  │                     │                             │            │
│  │                     │ Mounted as volume/env       │            │
│  │                     ▼                             │            │
│  │  ┌────────────────────────────────────────────┐  │            │
│  │  │  Application Pods                          │  │            │
│  │  │  - Reads secrets as env vars               │  │            │
│  │  │  - Connects to database, Redis, etc.       │  │            │
│  │  └────────────────────────────────────────────┘  │            │
│  └──────────────────────────────────────────────────┘            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

1. **Templates** (`templates/`): Plain Kubernetes Secret manifests with variable placeholders
2. **Scripts** (`scripts/`): Automation tools for generating and sealing secrets
3. **Manifests** (`manifests/`): Encrypted SealedSecret resources (safe for Git)
4. **Controller** (`00-controller.yaml`): Sealed Secrets controller deployment
5. **Examples** (`examples/`): Example secrets and rotation workflows

## Prerequisites

### Required Tools

1. **kubectl** - Kubernetes CLI
   ```bash
   # Verify installation
   kubectl version --client

   # Should show client version v1.24+
   ```

2. **kubeseal** - Sealed Secrets CLI
   ```bash
   # Linux (AMD64)
   wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.5/kubeseal-0.24.5-linux-amd64.tar.gz
   tar -xvzf kubeseal-0.24.5-linux-amd64.tar.gz
   sudo install -m 755 kubeseal /usr/local/bin/kubeseal

   # macOS
   brew install kubeseal

   # Verify installation
   kubeseal --version
   ```

3. **envsubst** - Environment variable substitution
   ```bash
   # Ubuntu/Debian
   sudo apt-get install gettext-base

   # macOS
   brew install gettext

   # Verify installation
   envsubst --version
   ```

4. **openssl** - Cryptographic operations
   ```bash
   # Usually pre-installed on Linux/macOS
   openssl version

   # Should show OpenSSL 1.1.1+
   ```

### Optional Tools

- **yq** - YAML processor (for validation scripts)
- **jq** - JSON processor (for advanced scripting)

### Cluster Requirements

- Kubernetes cluster 1.16+
- Access to create cluster-wide resources (RBAC permissions)
- Namespace `llm-devops` should exist (or create it)

## Installation

### Step 1: Create Namespace

```bash
# Create the application namespace if it doesn't exist
kubectl create namespace llm-devops
```

### Step 2: Install Sealed Secrets Controller

```bash
# Install the controller in kube-system namespace
kubectl apply -f k8s/sealed-secrets/00-controller.yaml

# Verify installation
kubectl get pods -n kube-system -l name=sealed-secrets-controller

# Wait for controller to be ready (should show 1/1 READY)
kubectl wait --for=condition=available --timeout=60s \
  deployment/sealed-secrets-controller -n kube-system
```

### Step 3: Verify Controller

```bash
# Check controller logs
kubectl logs -n kube-system deployment/sealed-secrets-controller

# You should see:
# "controller version: v0.24.5"
# "Starting sealed-secrets controller"

# Fetch the public certificate (validates controller is working)
kubeseal --fetch-cert \
  --controller-name=sealed-secrets-controller \
  --controller-namespace=kube-system
```

### Step 4: Verify Installation

```bash
# Check CRD is installed
kubectl get crd sealedsecrets.bitnami.com

# Check controller service
kubectl get svc -n kube-system sealed-secrets-controller

# Check RBAC
kubectl get clusterrole secrets-unsealer
kubectl get clusterrolebinding sealed-secrets-controller
```

## Quick Start

### For First-Time Users

Follow these steps to create and deploy your first sealed secret:

#### 1. Generate Secrets

```bash
cd k8s/sealed-secrets/scripts

# Generate all secrets with strong random values
./generate-secrets.sh \
  --type all \
  --environment production \
  --output .env.production

# Review generated secrets
cat .env.production
```

#### 2. Seal Secrets

```bash
# Seal database credentials
./seal-secret.sh \
  --template database \
  --env-file .env.production

# Seal Redis credentials
./seal-secret.sh \
  --template redis \
  --env-file .env.production

# Seal JWT secrets
./seal-secret.sh \
  --template jwt \
  --env-file .env.production
```

#### 3. Apply to Cluster

```bash
# Apply all sealed secrets
kubectl apply -f ../manifests/

# Or apply individually
kubectl apply -f ../manifests/database-sealedsecret.yaml
kubectl apply -f ../manifests/redis-sealedsecret.yaml
kubectl apply -f ../manifests/jwt-sealedsecret.yaml
```

#### 4. Verify Deployment

```bash
# Check SealedSecrets were created
kubectl get sealedsecrets -n llm-devops

# Check regular Secrets were decrypted and created
kubectl get secrets -n llm-devops

# You should see:
# llm-policy-engine-database
# llm-policy-engine-redis
# llm-policy-engine-jwt

# View secret details (without revealing values)
kubectl describe secret llm-policy-engine-database -n llm-devops
```

#### 5. Commit to Git

```bash
# The sealed secrets are safe to commit
git add k8s/sealed-secrets/manifests/*.yaml
git commit -m "feat: add sealed secrets for production"
git push

# NEVER commit the .env files!
# Ensure they are in .gitignore
echo ".env*" >> .gitignore
echo "!.env.example" >> .gitignore
```

## Directory Structure

```
k8s/sealed-secrets/
├── README.md                          # This file - comprehensive documentation
├── 00-controller.yaml                 # Sealed Secrets controller installation
│
├── templates/                         # Plain secret templates (NOT committed with real values)
│   ├── database-secret.template.yaml  # Database credentials template
│   ├── redis-secret.template.yaml     # Redis credentials template
│   └── jwt-secret.template.yaml       # JWT authentication template
│
├── manifests/                         # Sealed secrets (SAFE for Git)
│   ├── database-sealedsecret.yaml     # Encrypted database secrets
│   ├── redis-sealedsecret.yaml        # Encrypted Redis secrets
│   └── jwt-sealedsecret.yaml          # Encrypted JWT secrets
│
├── scripts/                           # Automation scripts
│   ├── README.md                      # Scripts documentation
│   ├── QUICK_START.md                 # Quick reference guide
│   ├── generate-secrets.sh            # Generate cryptographic secrets
│   ├── seal-secret.sh                 # Seal secrets with kubeseal
│   └── validate-sealed-secrets.sh     # Validate sealed secret manifests
│
└── examples/                          # Examples and guides
    ├── 01-database-secret.yaml        # Example database secret
    ├── 02-redis-secret.yaml           # Example Redis secret
    ├── 03-jwt-secret.yaml             # Example JWT secret
    ├── 04-secret-rotation-script.sh   # Rotation automation example
    └── 05-backup-recovery-guide.md    # Backup and recovery procedures
```

### Key Directories Explained

#### `templates/`
Contains Kubernetes Secret manifest templates with environment variable placeholders (e.g., `${DATABASE_PASSWORD}`). These templates are used by `seal-secret.sh` to generate plain secrets before encryption.

**Security Note**: Templates themselves don't contain real secrets, but `.env` files used to populate them should NEVER be committed to Git.

#### `manifests/`
Contains encrypted SealedSecret resources that are safe to commit to version control. These files can only be decrypted by the Sealed Secrets controller running in your cluster.

**Git-Safe**: All files in this directory are encrypted and safe to commit.

#### `scripts/`
Automation scripts for the complete secret lifecycle:
- **generate-secrets.sh**: Creates strong cryptographic secrets
- **seal-secret.sh**: Encrypts secrets using kubeseal
- **validate-sealed-secrets.sh**: Validates sealed secret manifests

#### `examples/`
Reference examples for each secret type and operational procedures like rotation and backup/recovery.

## Usage Guide

### Generating Secrets

Use `generate-secrets.sh` to create cryptographically strong secrets:

```bash
cd k8s/sealed-secrets/scripts

# Generate all secrets
./generate-secrets.sh --type all --output .env.production

# Generate only database secrets
./generate-secrets.sh --type database --output .env.db

# Generate with custom password length
./generate-secrets.sh --type all --length 64 --output .env.secure

# Generate JWT secrets with RS256 (asymmetric)
./generate-secrets.sh --type jwt --jwt-algorithm RS256

# Output in JSON format
./generate-secrets.sh --type all --format json --output secrets.json

# Generate for staging environment
./generate-secrets.sh --type all --environment staging --output .env.staging
```

**Options**:
- `--type TYPE`: Secret type (database|redis|jwt|all)
- `--output PATH`: Output file path (default: `.env.secrets`)
- `--format FORMAT`: Output format (env|json|yaml)
- `--length LENGTH`: Password length (default: 32, min: 16)
- `--jwt-algorithm ALG`: JWT algorithm (HS256|RS256|ES256)
- `--environment ENV`: Environment (dev|staging|production)

### Sealing Secrets

Use `seal-secret.sh` to encrypt secrets for Kubernetes:

```bash
cd k8s/sealed-secrets/scripts

# Seal from .env file
./seal-secret.sh --template database --env-file .env.production

# Interactive mode (prompts for values)
./seal-secret.sh --template redis --interactive

# Seal and apply to cluster in one step
./seal-secret.sh \
  --template jwt \
  --env-file .env.production \
  --apply \
  --confirm

# Dry run (preview only, no files written)
./seal-secret.sh \
  --template database \
  --env-file .env.staging \
  --dry-run

# Custom output location
./seal-secret.sh \
  --template database \
  --env-file .env.dev \
  --output ../manifests/dev-database-sealedsecret.yaml

# Use custom certificate
./seal-secret.sh \
  --template database \
  --env-file .env.production \
  --cert /path/to/cert.pem
```

**Options**:
- `--template TYPE`: Secret template (database|redis|jwt) [REQUIRED]
- `--env-file PATH`: Path to .env file with secret values
- `--interactive`: Prompt interactively for secret values
- `--apply`: Apply sealed secret to cluster after creation
- `--dry-run`: Output to stdout only, don't write files
- `--cert PATH`: Path to sealed-secrets public certificate
- `--output PATH`: Output file path
- `--confirm`: Skip all confirmation prompts

### Validating Secrets

Use `validate-sealed-secrets.sh` to validate sealed secret manifests:

```bash
cd k8s/sealed-secrets/scripts

# Validate a single manifest
./validate-sealed-secrets.sh ../manifests/database-sealedsecret.yaml

# Validate all manifests
./validate-sealed-secrets.sh --all

# Strict mode (warnings fail validation)
./validate-sealed-secrets.sh --all --strict

# CI-friendly output (no colors)
./validate-sealed-secrets.sh --all --ci --strict

# JSON output
./validate-sealed-secrets.sh ../manifests/database-sealedsecret.yaml --json
```

**Validation Checks**:
- YAML syntax
- apiVersion and kind
- Required fields (metadata, spec, encryptedData)
- Required labels and annotations
- Namespace and naming conventions
- Encryption format (AgA... pattern)
- Scope configuration (strict mode)
- Rotation dates and schedules
- Security best practices

### Applying to Cluster

```bash
# Apply a single sealed secret
kubectl apply -f k8s/sealed-secrets/manifests/database-sealedsecret.yaml

# Apply all sealed secrets
kubectl apply -f k8s/sealed-secrets/manifests/

# Apply with dry-run to preview
kubectl apply -f k8s/sealed-secrets/manifests/ --dry-run=server

# View the decrypted secret (requires permissions)
kubectl get secret llm-policy-engine-database -n llm-devops -o yaml

# View secret data (base64 decoded)
kubectl get secret llm-policy-engine-database -n llm-devops \
  -o jsonpath='{.data.database-password}' | base64 -d
```

## Secret Types

### 1. Database (PostgreSQL)

Credentials and connection parameters for PostgreSQL database.

**Template**: `templates/database-secret.template.yaml`

**Environment Variables**:
```bash
DATABASE_HOST=postgres.example.com        # PostgreSQL host
DATABASE_PORT=5432                        # PostgreSQL port
DATABASE_USERNAME=llm_policy_engine       # Database username
DATABASE_PASSWORD=<generated-password>    # Database password (32+ chars)
DATABASE_NAME=llm_policy_engine           # Database name
DATABASE_SSL_MODE=require                 # SSL mode (require|verify-ca|verify-full)
```

**Generated Secret Keys**:
- `database-host`: PostgreSQL hostname
- `database-port`: PostgreSQL port
- `database-username`: Database username
- `database-password`: Database password
- `database-name`: Database name
- `database-ssl-mode`: SSL/TLS mode
- `database-url`: Full connection URL (convenience)

**Usage in Application**:
```yaml
env:
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: database-url
```

**Example**:
```bash
# Generate database password
./generate-secrets.sh --type database --output .env.db

# Seal secret
./seal-secret.sh --template database --env-file .env.db

# Apply
kubectl apply -f ../manifests/database-sealedsecret.yaml
```

### 2. Redis

Connection credentials for Redis cache/message broker.

**Template**: `templates/redis-secret.template.yaml`

**Environment Variables**:
```bash
REDIS_HOST=redis.example.com              # Redis host
REDIS_PORT=6379                           # Redis port
REDIS_PASSWORD=<generated-password>       # Redis password (32+ chars)
REDIS_DB=0                                # Redis database number
REDIS_TLS_ENABLED=true                    # TLS enabled (true|false)
```

**Generated Secret Keys**:
- `redis-host`: Redis hostname
- `redis-port`: Redis port
- `redis-password`: Redis password
- `redis-db`: Database number (0-15)
- `redis-tls-enabled`: TLS configuration
- `redis-url`: Full connection URL (convenience)

**Usage in Application**:
```yaml
env:
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: redis-url
```

**Example**:
```bash
# Generate Redis password
./generate-secrets.sh --type redis --output .env.redis

# Seal secret
./seal-secret.sh --template redis --env-file .env.redis

# Apply
kubectl apply -f ../manifests/redis-sealedsecret.yaml
```

### 3. JWT (Authentication)

JWT signing keys and configuration for authentication.

**Template**: `templates/jwt-secret.template.yaml`

**Environment Variables**:
```bash
JWT_SECRET=<generated-secret>             # JWT signing secret (base64, 256-bit)
JWT_ALGORITHM=HS256                       # Algorithm (HS256|HS384|HS512|RS256|ES256)
JWT_EXPIRES_IN=24h                        # Token expiration (e.g., 1h, 24h, 7d)
JWT_ISSUER=llm-policy-engine              # Token issuer identifier
JWT_AUDIENCE=llm-policy-engine-api        # Token audience identifier
JWT_PUBLIC_KEY=<optional>                 # Public key (for asymmetric algorithms)
JWT_PRIVATE_KEY=<optional>                # Private key (for asymmetric algorithms)
```

**Supported Algorithms**:
- **HS256/HS384/HS512**: HMAC (symmetric) - requires only `JWT_SECRET`
- **RS256/RS384/RS512**: RSA (asymmetric) - requires `JWT_PUBLIC_KEY` and `JWT_PRIVATE_KEY`
- **ES256/ES384/ES512**: ECDSA (asymmetric) - requires `JWT_PUBLIC_KEY` and `JWT_PRIVATE_KEY`

**Generated Secret Keys** (all base64-encoded):
- `jwt-secret`: Signing secret (for symmetric algorithms)
- `jwt-algorithm`: Algorithm identifier
- `jwt-expires-in`: Expiration time
- `jwt-issuer`: Issuer identifier
- `jwt-audience`: Audience identifier
- `jwt-public-key`: Public key (for asymmetric algorithms)
- `jwt-private-key`: Private key (for asymmetric algorithms)

**Usage in Application**:
```yaml
env:
- name: JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-jwt
      key: jwt-secret
- name: JWT_ALGORITHM
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-jwt
      key: jwt-algorithm
```

**Examples**:
```bash
# Generate symmetric JWT secret (HS256)
./generate-secrets.sh --type jwt --jwt-algorithm HS256 --output .env.jwt

# Generate asymmetric JWT keys (RS256)
./generate-secrets.sh --type jwt --jwt-algorithm RS256 --output .env.jwt

# Seal secret
./seal-secret.sh --template jwt --env-file .env.jwt

# Apply
kubectl apply -f ../manifests/jwt-sealedsecret.yaml
```

## Workflows

### Development Workflow

For local development and testing:

```bash
# 1. Create development environment file
cat > .env.development <<EOF
ENVIRONMENT=dev
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=dev_user
DATABASE_PASSWORD=dev_password_change_me
DATABASE_NAME=llm_policy_dev
DATABASE_SSL_MODE=disable
EOF

# 2. Seal for development cluster
./seal-secret.sh \
  --template database \
  --env-file .env.development \
  --output ../manifests/dev-database-sealedsecret.yaml

# 3. Apply to dev cluster
kubectl config use-context development
kubectl apply -f ../manifests/dev-database-sealedsecret.yaml

# 4. Verify
kubectl get secret llm-policy-engine-database -n llm-devops
```

### Staging Workflow

For staging/pre-production environment:

```bash
# 1. Generate strong secrets for staging
./generate-secrets.sh \
  --type all \
  --environment staging \
  --output .env.staging

# 2. Seal all secrets
for template in database redis jwt; do
  ./seal-secret.sh \
    --template $template \
    --env-file .env.staging \
    --output ../manifests/staging-${template}-sealedsecret.yaml
done

# 3. Apply to staging cluster
kubectl config use-context staging
kubectl apply -f ../manifests/staging-*

# 4. Verify all secrets
kubectl get secrets -n llm-devops -l managed-by=sealed-secrets

# 5. Test application with new secrets
kubectl rollout restart deployment/llm-policy-engine -n llm-devops
kubectl rollout status deployment/llm-policy-engine -n llm-devops
```

### Production Workflow

For production environment:

```bash
# 1. Generate production-grade secrets
./generate-secrets.sh \
  --type all \
  --environment production \
  --length 64 \
  --jwt-algorithm RS256 \
  --output .env.production

# 2. Review generated secrets
less .env.production

# 3. Seal secrets
./seal-secret.sh --template database --env-file .env.production --confirm
./seal-secret.sh --template redis --env-file .env.production --confirm
./seal-secret.sh --template jwt --env-file .env.production --confirm

# 4. Validate sealed secrets
./validate-sealed-secrets.sh --all --strict

# 5. Commit to Git (sealed secrets are safe)
git add ../manifests/*-sealedsecret.yaml
git commit -m "feat: add production sealed secrets"
git push

# 6. Apply via GitOps or manually
kubectl config use-context production
kubectl apply -f ../manifests/

# 7. Verify deployment
kubectl get sealedsecrets -n llm-devops
kubectl get secrets -n llm-devops
kubectl get pods -n llm-devops

# 8. Securely backup .env.production
# Store in password manager, HSM, or secure vault
# NEVER commit to Git!

# 9. Securely delete local .env file
shred -u .env.production
```

### Emergency Rotation

When secrets are compromised and need immediate rotation:

```bash
# 1. Generate new secrets immediately
./generate-secrets.sh \
  --type all \
  --environment production \
  --output .env.emergency

# 2. Seal new secrets
for template in database redis jwt; do
  ./seal-secret.sh \
    --template $template \
    --env-file .env.emergency \
    --confirm
done

# 3. Apply to production immediately
kubectl apply -f ../manifests/

# 4. Force restart all pods to use new secrets
kubectl rollout restart deployment/llm-policy-engine -n llm-devops

# 5. Monitor application health
kubectl rollout status deployment/llm-policy-engine -n llm-devops
kubectl logs -f deployment/llm-policy-engine -n llm-devops

# 6. Update external services
# - Update database user password
# - Update Redis password
# - Invalidate old JWT tokens

# 7. Verify old secrets no longer work
# Test with old credentials

# 8. Commit new sealed secrets
git add ../manifests/
git commit -m "security: emergency secret rotation"
git push

# 9. Document incident
# Create incident report
# Update rotation tracking

# 10. Clean up
shred -u .env.emergency
```

## Security Best Practices

### 1. Never Commit Plain Secrets

**DO**:
- Commit sealed secrets (manifests/*.yaml)
- Commit secret templates (templates/*.yaml)
- Commit example .env files without real values

**DON'T**:
- Commit .env files with real secrets
- Commit generated passwords or keys
- Commit decrypted secret YAML

**.gitignore Configuration**:
```gitignore
# Secret files (never commit)
.env
.env.*
!.env.example

# Generated secrets
*.secrets
*-secrets.yaml
*-secret.yaml

# Allow sealed secrets (these are safe)
!*-sealedsecret.yaml

# Backup files
*-backup.yaml
sealed-secrets-key-backup.yaml
```

### 2. Use Strict Scope

Always use strict scope for maximum security:

```yaml
metadata:
  annotations:
    sealedsecrets.bitnami.com/cluster-wide: "false"
    sealedsecrets.bitnami.com/namespace-wide: "false"
```

**Scope Levels**:
- **Strict** (recommended): Secret can only be decrypted with exact name and namespace
- **Namespace-wide**: Secret can be decrypted anywhere in the same namespace
- **Cluster-wide**: Secret can be decrypted anywhere in the cluster (NOT recommended)

### 3. Rotate Regularly

Implement regular secret rotation:

**Recommended Schedule**:
- **Database passwords**: Every 90 days
- **Redis passwords**: Every 90 days
- **JWT secrets**: Every 90 days
- **After security incidents**: Immediately

**Automation**:
```bash
# Set up cron job for rotation reminders
0 0 1 * * /usr/local/bin/check-secret-rotation.sh

# Or use calendar reminders
# Add rotation dates to team calendar
```

### 4. Backup Controller Keys

The Sealed Secrets controller's private keys must be backed up:

```bash
# Backup all sealed-secrets keys
kubectl get secret -n kube-system \
  -l sealedsecrets.bitnami.com/sealed-secrets-key=active \
  -o yaml > sealed-secrets-key-backup.yaml

# Encrypt the backup
gpg --encrypt --recipient admin@example.com sealed-secrets-key-backup.yaml

# Store encrypted backup in secure location
# - Password manager
# - Hardware Security Module (HSM)
# - Secure offline storage
# - Multiple geographic locations

# NEVER commit backup to Git!
# Add to .gitignore
echo "sealed-secrets-key-backup.yaml*" >> .gitignore

# Test backup restoration periodically
```

### 5. Limit Access

**RBAC Configuration**:
```yaml
# Only allow authorized users to view secrets
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: secret-reader
  namespace: llm-devops
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]
  resourceNames:
  - llm-policy-engine-database
  - llm-policy-engine-redis
  - llm-policy-engine-jwt
```

### 6. Use Strong Passwords

**Requirements**:
- Minimum length: 32 characters (64 recommended for production)
- Include: uppercase, lowercase, numbers, special characters
- Avoid: dictionary words, common patterns, sequential characters

**Validation**:
```bash
# generate-secrets.sh automatically creates strong passwords
./generate-secrets.sh --type all --length 64

# seal-secret.sh validates password strength
# Warns about weak passwords
```

### 7. Monitor Secret Access

```bash
# Enable audit logging for secret access
kubectl get secret llm-policy-engine-database -n llm-devops -v=8

# Review audit logs
kubectl logs -n kube-system deployment/kube-apiserver | grep "secrets"

# Set up alerts for secret access
# Use tools like Falco, Prometheus, or cloud provider monitoring
```

### 8. Encrypt Backups

All secret backups must be encrypted:

```bash
# Encrypt .env files before storing
gpg --encrypt --recipient team@example.com .env.production

# Encrypt sealed-secrets keys
gpg --encrypt sealed-secrets-key-backup.yaml

# Use strong encryption for archives
tar czf - .env.* | gpg --encrypt --recipient team@example.com > secrets-backup.tar.gz.gpg
```

### 9. Principle of Least Privilege

Grant minimal necessary permissions:

```yaml
# Application only needs read access to its own secrets
apiVersion: v1
kind: ServiceAccount
metadata:
  name: llm-policy-engine
  namespace: llm-devops
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: llm-policy-engine-secrets
  namespace: llm-devops
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get"]
  resourceNames:
  - llm-policy-engine-database
  - llm-policy-engine-redis
  - llm-policy-engine-jwt
```

### 10. Secret Scanning

Prevent accidental commits:

```bash
# Install git-secrets
brew install git-secrets  # macOS
# or from: https://github.com/awslabs/git-secrets

# Configure for repository
cd /path/to/llm-policy-engine
git secrets --install
git secrets --register-aws

# Add custom patterns
git secrets --add 'DATABASE_PASSWORD=.*'
git secrets --add 'REDIS_PASSWORD=.*'
git secrets --add 'JWT_SECRET=.*'

# Scan repository
git secrets --scan

# Pre-commit hook
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/bash
git secrets --pre_commit_hook -- "$@"
EOF
chmod +x .git/hooks/pre-commit
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Controller Not Found

**Error**:
```
Error: Sealed-secrets controller not found: sealed-secrets-controller in namespace kube-system
```

**Solution**:
```bash
# Install the controller
kubectl apply -f k8s/sealed-secrets/00-controller.yaml

# Wait for it to be ready
kubectl wait --for=condition=available --timeout=60s \
  deployment/sealed-secrets-controller -n kube-system

# Verify installation
kubectl get pods -n kube-system -l name=sealed-secrets-controller
```

#### 2. Cannot Fetch Certificate

**Error**:
```
Error: cannot fetch certificate: connection refused
```

**Solution**:
```bash
# Check controller is running
kubectl get pods -n kube-system -l name=sealed-secrets-controller

# Check service exists
kubectl get svc -n kube-system sealed-secrets-controller

# Port forward to controller
kubectl port-forward -n kube-system svc/sealed-secrets-controller 8080:8080

# Fetch cert using localhost
kubeseal --fetch-cert --controller-name=sealed-secrets-controller \
  --controller-namespace=kube-system
```

#### 3. Secret Not Decrypting

**Error**:
SealedSecret created but regular Secret not appearing

**Solution**:
```bash
# Check controller logs
kubectl logs -n kube-system deployment/sealed-secrets-controller

# Common causes:
# - Wrong namespace/name (scope mismatch)
# - Certificate mismatch (sealed with different cert)
# - Controller not running

# Verify scope annotations
kubectl get sealedsecret <name> -n llm-devops -o yaml | grep -A2 annotations

# Should show:
# sealedsecrets.bitnami.com/cluster-wide: "false"
# sealedsecrets.bitnami.com/namespace-wide: "false"

# Check SealedSecret status
kubectl describe sealedsecret <name> -n llm-devops
```

#### 4. Missing Environment Variables

**Error**:
```
Error: Missing required environment variables for template 'database':
  - DATABASE_PASSWORD
```

**Solution**:
```bash
# Ensure all required variables are set
cat .env.production

# Should contain all required variables for the template
# database: DATABASE_HOST, DATABASE_PORT, DATABASE_USERNAME,
#           DATABASE_PASSWORD, DATABASE_NAME, DATABASE_SSL_MODE

# Re-generate secrets if needed
./generate-secrets.sh --type database --output .env.production

# Or set manually
export DATABASE_PASSWORD="your-secure-password"
```

#### 5. Invalid YAML Syntax

**Error**:
```
Error: Invalid YAML syntax
```

**Solution**:
```bash
# Validate YAML syntax
kubectl apply --dry-run=client -f manifests/database-sealedsecret.yaml

# Use validation script
./validate-sealed-secrets.sh manifests/database-sealedsecret.yaml

# Check for common issues:
# - Incorrect indentation
# - Missing quotes around special characters
# - Invalid base64 encoding
```

#### 6. Certificate Mismatch

**Error**:
Secret sealed with one cluster's cert but applied to different cluster

**Solution**:
```bash
# Each cluster has unique encryption keys
# Secrets must be re-sealed for each cluster

# Get cert from target cluster
kubeseal --fetch-cert \
  --controller-name=sealed-secrets-controller \
  --controller-namespace=kube-system \
  > target-cluster-cert.pem

# Re-seal secret for target cluster
./seal-secret.sh \
  --template database \
  --env-file .env.production \
  --cert target-cluster-cert.pem \
  --output manifests/database-sealedsecret-targetcluster.yaml
```

#### 7. Permission Denied

**Error**:
```
Error: secrets is forbidden: User "john@example.com" cannot create resource "secrets"
```

**Solution**:
```bash
# Check your permissions
kubectl auth can-i create secrets -n llm-devops

# Request RBAC permissions from cluster admin
# You need permission to create SealedSecrets (not Secrets)
# The controller creates the actual Secrets

# Check SealedSecret permissions
kubectl auth can-i create sealedsecrets.bitnami.com -n llm-devops
```

#### 8. Rotation Date Overdue

**Warning**:
```
[WARN] Next rotation: 2024-10-15 (overdue by 33 days)
```

**Solution**:
```bash
# Generate new secrets
./generate-secrets.sh --type all --output .env.new

# Seal and apply
./seal-secret.sh --template database --env-file .env.new --apply --confirm
./seal-secret.sh --template redis --env-file .env.new --apply --confirm
./seal-secret.sh --template jwt --env-file .env.new --apply --confirm

# Restart pods to use new secrets
kubectl rollout restart deployment/llm-policy-engine -n llm-devops

# Update external services (database, Redis)
# Update user passwords, regenerate credentials, etc.

# Clean up
shred -u .env.new
```

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
# Enable debug mode in seal-secret.sh
DEBUG=true ./seal-secret.sh --template database --env-file .env.production

# Check kubeseal version
kubeseal --version

# Check kubectl version
kubectl version

# Validate cluster connectivity
kubectl cluster-info
kubectl get nodes

# Check all sealed-secrets resources
kubectl get all -n kube-system -l name=sealed-secrets-controller
kubectl get crd sealedsecrets.bitnami.com
kubectl get sealedsecrets -A
```

## References

### Official Documentation

- [Sealed Secrets GitHub](https://github.com/bitnami-labs/sealed-secrets)
- [Sealed Secrets Documentation](https://sealed-secrets.netlify.app/)
- [Kubernetes Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)

### Related Tools

- [kubeseal CLI](https://github.com/bitnami-labs/sealed-secrets/releases)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [envsubst](https://www.gnu.org/software/gettext/manual/html_node/envsubst-Invocation.html)

### Security Resources

- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/overview/)

### Additional Reading

- [GitOps Secrets Management](https://www.weave.works/blog/managing-secrets-in-flux)
- [Bitnami Sealed Secrets Tutorial](https://engineering.bitnami.com/articles/sealed-secrets.html)
- [Secret Management in Kubernetes](https://learnk8s.io/kubernetes-secrets)

---

## Contributing

For issues, questions, or contributions:

1. Check existing issues: https://github.com/organization/llm-policy-engine/issues
2. Review security policy: SECURITY.md
3. Submit pull requests: Follow contribution guidelines in CONTRIBUTING.md

## License

Part of the LLM Policy Engine project. See LICENSE for details.

## Support

- **Documentation**: This README and scripts/README.md
- **Examples**: See examples/ directory
- **Issues**: GitHub Issues
- **Security**: security@example.com (for security-related issues only)

---

**Last Updated**: 2025-11-17
**Version**: 1.0.0
**Maintained By**: LLM Policy Engine Team
