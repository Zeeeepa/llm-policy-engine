# SealedSecrets Migration Guide

## Table of Contents

1. [Overview](#overview)
2. [Current State vs Target State](#current-state-vs-target-state)
3. [Migration Strategies](#migration-strategies)
4. [Prerequisites](#prerequisites)
5. [Step-by-Step Migration](#step-by-step-migration)
6. [Deployment Changes](#deployment-changes)
7. [Rollback Plan](#rollback-plan)
8. [Verification Steps](#verification-steps)
9. [Testing Checklist](#testing-checklist)
10. [Production Considerations](#production-considerations)
11. [Troubleshooting](#troubleshooting)

---

## Overview

This guide provides a comprehensive migration path from plaintext Kubernetes Secrets to encrypted SealedSecrets for the LLM Policy Engine deployment. SealedSecrets provide:

- **Security**: Secrets are encrypted and safe to commit to Git
- **Auditability**: Track secret changes through version control
- **Separation of Concerns**: Different secrets for database, Redis, and JWT
- **GitOps-Ready**: Integrate seamlessly with GitOps workflows

### What Changes

- **Old**: Single `llm-policy-engine-secrets` secret with all credentials
- **New**: Three separate SealedSecrets for better security and management:
  - `llm-policy-engine-database` - PostgreSQL credentials
  - `llm-policy-engine-redis` - Redis credentials
  - `llm-policy-engine-jwt` - JWT signing secrets

---

## Current State vs Target State

### Current State (deployment.yaml)

The existing deployment references a single secret `llm-policy-engine-secrets`:

```yaml
# API Container
env:
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: database-url
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: redis-url
- name: JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: jwt-secret

# gRPC Container
env:
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: database-url
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: redis-url
```

### Target State (with SealedSecrets)

The new deployment uses three separate sealed secrets with granular environment variables:

```yaml
# API Container
env:
# Database credentials (granular)
- name: DATABASE_HOST
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: host
- name: DATABASE_PORT
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: port
- name: DATABASE_NAME
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: database
- name: DATABASE_USERNAME
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: username
- name: DATABASE_PASSWORD
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: password
- name: DATABASE_SSL_MODE
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: ssl-mode

# Redis credentials (granular)
- name: REDIS_HOST
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: host
- name: REDIS_PORT
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: port
- name: REDIS_PASSWORD
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: password
- name: REDIS_DB
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: db

# JWT credentials
- name: JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-jwt
      key: secret
- name: JWT_ALGORITHM
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-jwt
      key: algorithm
- name: JWT_EXPIRES_IN
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-jwt
      key: expires-in
```

---

## Migration Strategies

Choose the strategy that best fits your environment and risk tolerance.

### Approach A: Direct Migration (Recommended for Staging)

Replace the existing secret references directly. This approach:
- Requires a brief service restart
- Simplest to execute
- Best for non-production environments
- Faster migration

**Downtime**: ~30 seconds during pod restart

### Approach B: Side-by-Side Migration (Recommended for Production)

Keep both old and new secrets during transition. This approach:
- Allows gradual rollout
- Supports canary deployments
- Enables easy rollback
- Zero downtime

**Downtime**: Zero

---

## Prerequisites

### 1. Install kubeseal CLI

```bash
# macOS
brew install kubeseal

# Linux
wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/kubeseal-0.24.0-linux-amd64.tar.gz
tar xfz kubeseal-0.24.0-linux-amd64.tar.gz
sudo install -m 755 kubeseal /usr/local/bin/kubeseal

# Windows (using Chocolatey)
choco install kubeseal
```

### 2. Install SealedSecrets Controller

```bash
# Apply the controller to your cluster
kubectl apply -f k8s/sealed-secrets/00-controller.yaml

# Verify installation
kubectl get pods -n kube-system -l app.kubernetes.io/name=sealed-secrets

# Expected output:
# NAME                                        READY   STATUS    RESTARTS   AGE
# sealed-secrets-controller-xxxxxxxxx-xxxxx   1/1     Running   0          1m
```

### 3. Verify Controller Certificate

```bash
# Fetch the public key
kubeseal --fetch-cert --controller-namespace=kube-system

# This should output a certificate starting with:
# -----BEGIN CERTIFICATE-----
```

### 4. Backup Current Secrets

```bash
# Backup existing secret
kubectl get secret llm-policy-engine-secrets -n llm-devops -o yaml > backup-secrets-$(date +%Y%m%d-%H%M%S).yaml

# Store securely (DO NOT commit to Git)
mv backup-secrets-*.yaml ~/secrets-backup/
```

---

## Step-by-Step Migration

### Phase 1: Create SealedSecrets

#### Option 1: Using the Automation Script (Recommended)

```bash
cd k8s/sealed-secrets/scripts

# 1. Create environment file with your values
cat > .env.production <<EOF
# Database
DATABASE_HOST=postgres.prod.svc.cluster.local
DATABASE_PORT=5432
DATABASE_USERNAME=llm_user
DATABASE_PASSWORD=your-secure-password-here
DATABASE_NAME=llm_policy_engine
DATABASE_SSL_MODE=require

# Redis
REDIS_HOST=redis.prod.svc.cluster.local
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password-here
REDIS_DB=0
REDIS_TLS_ENABLED=false

# JWT
JWT_SECRET=your-minimum-32-character-jwt-secret-key-here
JWT_ALGORITHM=HS256
JWT_EXPIRES_IN=24h
JWT_ISSUER=llm-policy-engine
JWT_AUDIENCE=llm-policy-engine-api
EOF

# 2. Set proper permissions
chmod 600 .env.production

# 3. Generate all sealed secrets
./seal-secret.sh --template database --env-file .env.production
./seal-secret.sh --template redis --env-file .env.production
./seal-secret.sh --template jwt --env-file .env.production

# 4. Verify generated files
ls -la ../manifests/

# Expected output:
# database-sealedsecret.yaml
# redis-sealedsecret.yaml
# jwt-sealedsecret.yaml

# 5. Clean up environment file
shred -u .env.production  # Linux
# or
rm -P .env.production     # macOS
```

#### Option 2: Manual Creation

If you prefer manual control or need to customize:

```bash
# 1. Create plain secret YAML files (DO NOT apply to cluster yet)

# Database Secret
cat > /tmp/database-secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: llm-policy-engine-database
  namespace: llm-devops
type: Opaque
stringData:
  host: "postgres.prod.svc.cluster.local"
  port: "5432"
  username: "llm_user"
  password: "your-secure-password"
  database: "llm_policy_engine"
  ssl-mode: "require"
  # Connection string (optional, for backward compatibility)
  url: "postgresql://llm_user:your-secure-password@postgres.prod.svc.cluster.local:5432/llm_policy_engine?sslmode=require"
EOF

# Redis Secret
cat > /tmp/redis-secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: llm-policy-engine-redis
  namespace: llm-devops
type: Opaque
stringData:
  host: "redis.prod.svc.cluster.local"
  port: "6379"
  password: "your-redis-password"
  db: "0"
  tls-enabled: "false"
  # Connection string (optional, for backward compatibility)
  url: "redis://:your-redis-password@redis.prod.svc.cluster.local:6379/0"
EOF

# JWT Secret
cat > /tmp/jwt-secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: llm-policy-engine-jwt
  namespace: llm-devops
type: Opaque
stringData:
  secret: "your-minimum-32-character-jwt-secret"
  algorithm: "HS256"
  expires-in: "24h"
  issuer: "llm-policy-engine"
  audience: "llm-policy-engine-api"
EOF

# 2. Seal the secrets
kubeseal -f /tmp/database-secret.yaml -w k8s/sealed-secrets/manifests/database-sealedsecret.yaml \
  --controller-namespace=kube-system --format yaml

kubeseal -f /tmp/redis-secret.yaml -w k8s/sealed-secrets/manifests/redis-sealedsecret.yaml \
  --controller-namespace=kube-system --format yaml

kubeseal -f /tmp/jwt-secret.yaml -w k8s/sealed-secrets/manifests/jwt-sealedsecret.yaml \
  --controller-namespace=kube-system --format yaml

# 3. Clean up plaintext files
shred -u /tmp/*-secret.yaml  # Linux
# or
rm -P /tmp/*-secret.yaml     # macOS
```

### Phase 2: Apply SealedSecrets to Cluster

```bash
# Apply all sealed secrets
kubectl apply -f k8s/sealed-secrets/manifests/database-sealedsecret.yaml
kubectl apply -f k8s/sealed-secrets/manifests/redis-sealedsecret.yaml
kubectl apply -f k8s/sealed-secrets/manifests/jwt-sealedsecret.yaml

# Expected output:
# sealedsecret.bitnami.com/llm-policy-engine-database created
# sealedsecret.bitnami.com/llm-policy-engine-redis created
# sealedsecret.bitnami.com/llm-policy-engine-jwt created
```

### Phase 3: Verify Secrets are Unsealed

The controller automatically converts SealedSecrets to plain Secrets.

```bash
# Check SealedSecrets exist
kubectl get sealedsecret -n llm-devops

# Expected output:
# NAME                           AGE
# llm-policy-engine-database     1m
# llm-policy-engine-redis        1m
# llm-policy-engine-jwt          1m

# Check that plain Secrets were created
kubectl get secret -n llm-devops | grep llm-policy-engine

# Expected output:
# llm-policy-engine-database     Opaque   7      1m
# llm-policy-engine-redis        Opaque   6      1m
# llm-policy-engine-jwt          Opaque   5      1m

# Verify secret keys (without showing values)
kubectl get secret llm-policy-engine-database -n llm-devops -o jsonpath='{.data}' | jq 'keys'

# Expected output:
# ["database", "host", "password", "port", "ssl-mode", "url", "username"]

# Test decode one key to verify it's correct (use carefully)
kubectl get secret llm-policy-engine-database -n llm-devops -o jsonpath='{.data.host}' | base64 -d
```

### Phase 4: Update deployment.yaml

Choose your migration strategy:

#### Strategy A: Direct Migration (Full Replacement)

Create a new deployment file with updated secret references:

```bash
# Back up current deployment
cp k8s/deployment.yaml k8s/deployment.yaml.backup

# Update deployment.yaml with new secret references
# See "Deployment Changes" section below for complete YAML
```

Complete updated deployment.yaml for **API container**:

```yaml
# API Container - BEFORE (old)
env:
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: database-url
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: redis-url
- name: JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: jwt-secret

# API Container - AFTER (new)
env:
# Database credentials
- name: DATABASE_HOST
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: host
- name: DATABASE_PORT
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: port
- name: DATABASE_NAME
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: database
- name: DATABASE_USERNAME
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: username
- name: DATABASE_PASSWORD
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: password
- name: DATABASE_SSL_MODE
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: ssl-mode
      optional: true
# Optional: Keep DATABASE_URL for backward compatibility
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: url
      optional: true

# Redis credentials
- name: REDIS_HOST
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: host
- name: REDIS_PORT
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: port
- name: REDIS_PASSWORD
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: password
- name: REDIS_DB
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: db
# Optional: Keep REDIS_URL for backward compatibility
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: url
      optional: true

# JWT credentials
- name: JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-jwt
      key: secret
- name: JWT_ALGORITHM
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-jwt
      key: algorithm
      optional: true
- name: JWT_EXPIRES_IN
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-jwt
      key: expires-in
      optional: true
```

Complete updated deployment.yaml for **gRPC container**:

```yaml
# gRPC Container - BEFORE (old)
env:
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: database-url
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: redis-url

# gRPC Container - AFTER (new)
env:
# Database credentials
- name: DATABASE_HOST
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: host
- name: DATABASE_PORT
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: port
- name: DATABASE_NAME
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: database
- name: DATABASE_USERNAME
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: username
- name: DATABASE_PASSWORD
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: password
- name: DATABASE_SSL_MODE
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: ssl-mode
      optional: true
# Optional: Keep DATABASE_URL for backward compatibility
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: url
      optional: true

# Redis credentials
- name: REDIS_HOST
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: host
- name: REDIS_PORT
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: port
- name: REDIS_PASSWORD
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: password
- name: REDIS_DB
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: db
# Optional: Keep REDIS_URL for backward compatibility
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-redis
      key: url
      optional: true
```

#### Strategy B: Side-by-Side Migration (Gradual Transition)

Add new environment variables alongside old ones:

```yaml
# API Container - Side-by-Side Approach
env:
# OLD - Keep for rollback capability
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: database-url
      optional: true  # Don't fail if secret is removed
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: redis-url
      optional: true
- name: JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-secrets
      key: jwt-secret
      optional: true

# NEW - Database credentials
- name: DATABASE_HOST
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: host
- name: DATABASE_PORT
  valueFrom:
    secretKeyRef:
      name: llm-policy-engine-database
      key: port
# ... (add all other new env vars)
```

**Note**: Update your application code to prefer the new granular environment variables over the URL format.

### Phase 5: Apply Updated Deployment

```bash
# Review changes first
kubectl diff -f k8s/deployment.yaml

# Apply the updated deployment
kubectl apply -f k8s/deployment.yaml

# Expected output:
# deployment.apps/llm-policy-engine configured
```

### Phase 6: Verify Pods Restart Successfully

```bash
# Watch the rollout
kubectl rollout status deployment/llm-policy-engine -n llm-devops

# Expected output:
# Waiting for deployment "llm-policy-engine" rollout to finish: 1 out of 3 new replicas have been updated...
# Waiting for deployment "llm-policy-engine" rollout to finish: 2 out of 3 new replicas have been updated...
# Waiting for deployment "llm-policy-engine" rollout to finish: 1 old replicas are pending termination...
# deployment "llm-policy-engine" successfully rolled out

# Check pod status
kubectl get pods -n llm-devops -l app=llm-policy-engine

# Expected output:
# NAME                                 READY   STATUS    RESTARTS   AGE
# llm-policy-engine-xxxxxxxxxx-xxxxx   2/2     Running   0          1m
# llm-policy-engine-xxxxxxxxxx-xxxxx   2/2     Running   0          2m
# llm-policy-engine-xxxxxxxxxx-xxxxx   2/2     Running   0          3m

# Check for errors in logs
kubectl logs -n llm-devops -l app=llm-policy-engine --tail=50 | grep -i error

# Test one pod's environment
kubectl exec -n llm-devops -it deployment/llm-policy-engine -c api -- env | grep -E "DATABASE|REDIS|JWT"

# Expected output should show new environment variables:
# DATABASE_HOST=postgres.prod.svc.cluster.local
# DATABASE_PORT=5432
# DATABASE_NAME=llm_policy_engine
# ...
```

### Phase 7: Remove Old Secret (Optional)

**WARNING**: Only do this after verifying the migration is successful and stable.

#### For Direct Migration:

```bash
# Wait at least 24-48 hours after successful migration

# Final verification
kubectl exec -n llm-devops deployment/llm-policy-engine -c api -- wget -O- http://localhost:3000/health

# If everything works, remove old secret
kubectl delete secret llm-policy-engine-secrets -n llm-devops

# Verify it's gone
kubectl get secret llm-policy-engine-secrets -n llm-devops
# Expected: Error from server (NotFound): secrets "llm-policy-engine-secrets" not found
```

#### For Side-by-Side Migration:

```bash
# After successful migration and monitoring period:
# 1. Update deployment.yaml to remove old secret references
# 2. Apply deployment
# 3. Delete old secret (as shown above)
```

---

## Deployment Changes

### Complete deployment.yaml Environment Section

Here's the complete updated environment section for both containers:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-policy-engine
  namespace: llm-devops
spec:
  # ... (other fields remain the same)
  template:
    spec:
      containers:
      - name: api
        # ... (image, ports, etc. remain the same)
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"

        # Database credentials (granular approach)
        - name: DATABASE_HOST
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: host
        - name: DATABASE_PORT
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: port
        - name: DATABASE_NAME
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: database
        - name: DATABASE_USERNAME
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: username
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: password
        - name: DATABASE_SSL_MODE
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: ssl-mode
              optional: true

        # Redis credentials (granular approach)
        - name: REDIS_HOST
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-redis
              key: host
        - name: REDIS_PORT
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-redis
              key: port
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-redis
              key: password
        - name: REDIS_DB
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-redis
              key: db

        # JWT credentials
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-jwt
              key: secret
        - name: JWT_ALGORITHM
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-jwt
              key: algorithm
              optional: true
        - name: JWT_EXPIRES_IN
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-jwt
              key: expires-in
              optional: true

        # ConfigMap references (unchanged)
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: llm-policy-engine-config
              key: log-level
        # ... (rest of ConfigMap env vars)

      - name: grpc
        # ... (image, ports, etc. remain the same)
        env:
        - name: NODE_ENV
          value: "production"
        - name: GRPC_PORT
          value: "50051"

        # Database credentials (same as API container)
        - name: DATABASE_HOST
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: host
        - name: DATABASE_PORT
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: port
        - name: DATABASE_NAME
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: database
        - name: DATABASE_USERNAME
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: username
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: password
        - name: DATABASE_SSL_MODE
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: ssl-mode
              optional: true

        # Redis credentials (same as API container)
        - name: REDIS_HOST
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-redis
              key: host
        - name: REDIS_PORT
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-redis
              key: port
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-redis
              key: password
        - name: REDIS_DB
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-redis
              key: db

        # ConfigMap references (unchanged)
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: llm-policy-engine-config
              key: log-level
```

### Application Code Changes

Your application code needs to support the new granular environment variables. Here's an example:

```typescript
// config/database.ts - BEFORE
const databaseConfig = {
  url: process.env.DATABASE_URL,
};

// config/database.ts - AFTER (with fallback)
const databaseConfig = {
  // Try granular config first
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  ssl: process.env.DATABASE_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,

  // Fallback to URL for backward compatibility
  url: process.env.DATABASE_URL,
};

// Use granular if available, otherwise fall back to URL
const connectionConfig = databaseConfig.host
  ? {
      host: databaseConfig.host,
      port: databaseConfig.port,
      database: databaseConfig.database,
      user: databaseConfig.username,
      password: databaseConfig.password,
      ssl: databaseConfig.ssl,
    }
  : { connectionString: databaseConfig.url };
```

---

## Rollback Plan

If issues occur during migration, follow this rollback procedure:

### Quick Rollback (Deployment Only)

```bash
# Rollback to previous deployment version
kubectl rollout undo deployment/llm-policy-engine -n llm-devops

# Verify rollback
kubectl rollout status deployment/llm-policy-engine -n llm-devops

# Check pods are healthy
kubectl get pods -n llm-devops -l app=llm-policy-engine
```

### Full Rollback (Deployment + Secrets)

```bash
# 1. Restore old deployment
kubectl apply -f k8s/deployment.yaml.backup

# 2. If old secret was deleted, restore from backup
kubectl apply -f ~/secrets-backup/backup-secrets-YYYYMMDD-HHMMSS.yaml

# 3. Delete new sealed secrets (optional)
kubectl delete sealedsecret llm-policy-engine-database -n llm-devops
kubectl delete sealedsecret llm-policy-engine-redis -n llm-devops
kubectl delete sealedsecret llm-policy-engine-jwt -n llm-devops

# 4. Delete unsealed secrets (optional)
kubectl delete secret llm-policy-engine-database -n llm-devops
kubectl delete secret llm-policy-engine-redis -n llm-devops
kubectl delete secret llm-policy-engine-jwt -n llm-devops

# 5. Verify pods restart successfully
kubectl rollout status deployment/llm-policy-engine -n llm-devops
```

### Rollback from Side-by-Side Migration

```bash
# Simply remove new env vars from deployment.yaml
# The old secret references will take over
kubectl apply -f k8s/deployment.yaml

# Optionally delete new secrets
kubectl delete sealedsecret -l app=llm-policy-engine -n llm-devops
```

---

## Verification Steps

### Phase 1: Pre-Migration Verification

```bash
# 1. Verify controller is running
kubectl get pods -n kube-system -l app.kubernetes.io/name=sealed-secrets
# Expected: 1/1 Running

# 2. Verify current deployment is healthy
kubectl get pods -n llm-devops -l app=llm-policy-engine
# Expected: All pods Running with 2/2 Ready

# 3. Test current endpoints
curl -k https://your-domain.com/health
# Expected: HTTP 200 with health status

# 4. Verify current secret exists
kubectl get secret llm-policy-engine-secrets -n llm-devops
# Expected: Secret exists
```

### Phase 2: Post-SealedSecret Creation

```bash
# 1. Verify SealedSecrets were created
kubectl get sealedsecret -n llm-devops
# Expected: 3 SealedSecrets listed

# 2. Verify secrets were unsealed
kubectl get secret -n llm-devops | grep llm-policy-engine
# Expected: 3 new secrets + 1 old secret (if not deleted)

# 3. Verify secret keys
for secret in llm-policy-engine-database llm-policy-engine-redis llm-policy-engine-jwt; do
  echo "=== $secret ==="
  kubectl get secret $secret -n llm-devops -o jsonpath='{.data}' | jq 'keys'
done

# 4. Check controller logs for errors
kubectl logs -n kube-system -l app.kubernetes.io/name=sealed-secrets --tail=50 | grep -i error
# Expected: No errors related to unsealing
```

### Phase 3: Post-Deployment Update

```bash
# 1. Verify rollout completed
kubectl rollout status deployment/llm-policy-engine -n llm-devops
# Expected: "successfully rolled out"

# 2. Check pod readiness
kubectl get pods -n llm-devops -l app=llm-policy-engine
# Expected: All pods 2/2 Ready, no restarts

# 3. Verify environment variables in pods
kubectl exec -n llm-devops deployment/llm-policy-engine -c api -- env | grep -E "^(DATABASE|REDIS|JWT)_" | sort

# Expected output:
# DATABASE_HOST=...
# DATABASE_NAME=...
# DATABASE_PASSWORD=...
# DATABASE_PORT=...
# DATABASE_SSL_MODE=...
# DATABASE_USERNAME=...
# JWT_ALGORITHM=...
# JWT_EXPIRES_IN=...
# JWT_SECRET=...
# REDIS_DB=...
# REDIS_HOST=...
# REDIS_PASSWORD=...
# REDIS_PORT=...

# 4. Check application logs
kubectl logs -n llm-devops -l app=llm-policy-engine -c api --tail=100 | grep -E "(database|redis|jwt)" -i

# 5. Test endpoints
curl -k https://your-domain.com/health
# Expected: HTTP 200

curl -k https://your-domain.com/ready
# Expected: HTTP 200
```

### Phase 4: Functional Testing

```bash
# 1. Test database connectivity
kubectl exec -n llm-devops deployment/llm-policy-engine -c api -- node -e "
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT,
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
});
pool.query('SELECT NOW()').then(r => console.log('DB OK:', r.rows[0])).catch(e => console.error('DB ERROR:', e));
"

# 2. Test Redis connectivity
kubectl exec -n llm-devops deployment/llm-policy-engine -c api -- node -e "
const redis = require('redis');
const client = redis.createClient({
  socket: { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT },
  password: process.env.REDIS_PASSWORD,
  database: process.env.REDIS_DB,
});
client.connect().then(() => client.ping()).then(r => console.log('Redis OK:', r)).catch(e => console.error('Redis ERROR:', e));
"

# 3. Test JWT generation (if applicable)
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}' \
  -v
# Expected: Valid JWT token returned
```

---

## Testing Checklist

Use this checklist to ensure complete migration:

### Pre-Migration

- [ ] Backup current secrets to secure location
- [ ] Document current environment variable usage
- [ ] Install and verify SealedSecrets controller
- [ ] Test kubeseal CLI on a test secret
- [ ] Review application code for environment variable dependencies
- [ ] Create rollback plan document
- [ ] Schedule maintenance window (if required)

### During Migration

- [ ] Create all three SealedSecrets
- [ ] Apply SealedSecrets to cluster
- [ ] Verify secrets are unsealed correctly
- [ ] Update deployment.yaml with new references
- [ ] Review deployment diff before applying
- [ ] Apply deployment updates
- [ ] Monitor pod rollout status
- [ ] Check for pod errors or crashes

### Post-Migration

- [ ] All pods running and ready
- [ ] No error logs in pod containers
- [ ] No error logs in controller
- [ ] Environment variables correctly set in pods
- [ ] Database connectivity working
- [ ] Redis connectivity working
- [ ] JWT generation/validation working
- [ ] Health endpoint returns 200
- [ ] Ready endpoint returns 200
- [ ] API functional tests passing
- [ ] gRPC service responding
- [ ] Metrics endpoint accessible
- [ ] Performance within acceptable range
- [ ] Monitor for 24-48 hours before cleanup

### Cleanup (After Successful Migration)

- [ ] Remove old secret from cluster
- [ ] Update deployment.yaml in Git
- [ ] Commit SealedSecret manifests to Git
- [ ] Delete backup files securely
- [ ] Update documentation
- [ ] Update runbooks
- [ ] Communicate changes to team

---

## Production Considerations

### Zero-Downtime Migration

For production environments, use these strategies:

#### Strategy 1: Blue-Green Deployment

```bash
# 1. Create a new deployment with updated secrets
cp k8s/deployment.yaml k8s/deployment-green.yaml

# Edit deployment-green.yaml:
# - Change name to llm-policy-engine-green
# - Update secret references
# - Use different service selector label: version=green

# 2. Apply green deployment
kubectl apply -f k8s/deployment-green.yaml

# 3. Wait for green pods to be ready
kubectl wait --for=condition=ready pod -l app=llm-policy-engine,version=green -n llm-devops --timeout=300s

# 4. Test green deployment
kubectl port-forward -n llm-devops deployment/llm-policy-engine-green 8080:3000
curl http://localhost:8080/health

# 5. Switch traffic (update service selector)
kubectl patch service llm-policy-engine -n llm-devops -p '{"spec":{"selector":{"version":"green"}}}'

# 6. Monitor for issues
# If problems occur, switch back:
# kubectl patch service llm-policy-engine -n llm-devops -p '{"spec":{"selector":{"version":"blue"}}}'

# 7. After verification, delete blue deployment
kubectl delete deployment llm-policy-engine -n llm-devops
kubectl delete deployment llm-policy-engine-green -n llm-devops
kubectl apply -f k8s/deployment.yaml  # Apply updated original
```

#### Strategy 2: Canary Deployment

```bash
# 1. Reduce current deployment replicas
kubectl scale deployment llm-policy-engine -n llm-devops --replicas=2

# 2. Create canary deployment (1 replica with new secrets)
cp k8s/deployment.yaml k8s/deployment-canary.yaml

# Edit deployment-canary.yaml:
# - Change name to llm-policy-engine-canary
# - Set replicas: 1
# - Update secret references
# - Add label: track=canary

kubectl apply -f k8s/deployment-canary.yaml

# 3. Monitor canary for issues (10-30 minutes)
kubectl logs -f -n llm-devops -l track=canary

# 4. Gradually increase canary, decrease old
kubectl scale deployment llm-policy-engine-canary -n llm-devops --replicas=2
kubectl scale deployment llm-policy-engine -n llm-devops --replicas=1

# Wait and monitor...

kubectl scale deployment llm-policy-engine-canary -n llm-devops --replicas=3
kubectl scale deployment llm-policy-engine -n llm-devops --replicas=0

# 5. After success, update main deployment and delete canary
kubectl delete deployment llm-policy-engine-canary -n llm-devops
kubectl apply -f k8s/deployment.yaml
```

#### Strategy 3: Rolling Update with Monitoring

```bash
# 1. Configure slower rollout
kubectl patch deployment llm-policy-engine -n llm-devops -p '
spec:
  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  minReadySeconds: 60
'

# 2. Apply updated deployment
kubectl apply -f k8s/deployment.yaml

# 3. Monitor rollout closely
kubectl rollout status deployment/llm-policy-engine -n llm-devops --watch

# 4. If issues detected, pause and rollback
kubectl rollout pause deployment/llm-policy-engine -n llm-devops
kubectl rollout undo deployment/llm-policy-engine -n llm-devops
```

### Database Connection Pool Considerations

When updating database credentials:

```bash
# Option 1: Graceful connection drain
# Update deployment with longer terminationGracePeriodSeconds
kubectl patch deployment llm-policy-engine -n llm-devops -p '
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 60
'

# Option 2: Pre-warm connections
# Add init container to test connections before main container starts
# (Add to deployment.yaml)
spec:
  template:
    spec:
      initContainers:
      - name: db-check
        image: postgres:15-alpine
        command:
        - sh
        - -c
        - |
          until pg_isready -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USERNAME; do
            echo "Waiting for database..."
            sleep 2
          done
        env:
        - name: DATABASE_HOST
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: host
        - name: DATABASE_PORT
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: port
        - name: DATABASE_USERNAME
          valueFrom:
            secretKeyRef:
              name: llm-policy-engine-database
              key: username
```

### Monitoring During Migration

Set up alerts and monitoring:

```bash
# 1. Watch deployment events
kubectl get events -n llm-devops --watch --field-selector involvedObject.name=llm-policy-engine

# 2. Monitor pod restart count
watch 'kubectl get pods -n llm-devops -l app=llm-policy-engine -o json | jq ".items[] | {name: .metadata.name, restarts: .status.containerStatuses[].restartCount}"'

# 3. Monitor error rate (if you have Prometheus)
# Query: rate(http_requests_total{status=~"5.."}[5m])

# 4. Monitor response time
# Query: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# 5. Database connection monitoring
# Check database logs for authentication failures or connection errors
```

### Secret Rotation Strategy

Plan for future secret rotations:

```bash
# 1. Create new sealed secrets with rotated values
./scripts/seal-secret.sh --template database --env-file .env.production.rotated

# 2. Apply new secrets (they will replace old ones)
kubectl apply -f k8s/sealed-secrets/manifests/database-sealedsecret.yaml

# 3. Restart pods to pick up new values
kubectl rollout restart deployment/llm-policy-engine -n llm-devops

# 4. Verify new credentials work
kubectl logs -n llm-devops -l app=llm-policy-engine --tail=50 | grep -i "database"
```

### Multi-Environment Strategy

For organizations with multiple environments:

```bash
# Directory structure
k8s/sealed-secrets/
├── base/
│   └── templates/
├── staging/
│   ├── database-sealedsecret.yaml
│   ├── redis-sealedsecret.yaml
│   └── jwt-sealedsecret.yaml
└── production/
    ├── database-sealedsecret.yaml
    ├── redis-sealedsecret.yaml
    └── jwt-sealedsecret.yaml

# Apply per environment
kubectl apply -f k8s/sealed-secrets/staging/ --namespace=llm-devops-staging
kubectl apply -f k8s/sealed-secrets/production/ --namespace=llm-devops
```

### GitOps Integration

For ArgoCD or Flux:

```yaml
# argocd-application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: llm-policy-engine
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/your-org/llm-policy-engine
    targetRevision: main
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: llm-devops
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
    - CreateNamespace=true
```

SealedSecrets in the k8s directory will be automatically synced by ArgoCD.

---

## Troubleshooting

### Issue: SealedSecret Not Unsealing

**Symptoms:**
- SealedSecret exists but no plain Secret is created
- Controller logs show decryption errors

**Solutions:**

```bash
# Check controller logs
kubectl logs -n kube-system -l app.kubernetes.io/name=sealed-secrets --tail=100

# Common causes:
# 1. Wrong namespace
# Ensure SealedSecret metadata.namespace matches target namespace

# 2. Certificate mismatch
# Re-fetch certificate and re-seal
kubeseal --fetch-cert --controller-namespace=kube-system > public-cert.pem
kubeseal -f secret.yaml -w sealed-secret.yaml --cert=public-cert.pem

# 3. Controller not running
kubectl get pods -n kube-system -l app.kubernetes.io/name=sealed-secrets
# If not running, reinstall controller
kubectl apply -f k8s/sealed-secrets/00-controller.yaml
```

### Issue: Pods Failing to Start

**Symptoms:**
- Pods stuck in CrashLoopBackOff or Error state
- Logs show missing environment variables

**Solutions:**

```bash
# Check pod status
kubectl describe pod -n llm-devops -l app=llm-policy-engine

# Look for events like:
# - "MountVolume.SetUp failed for volume"
# - "Error: secret not found"

# Verify secrets exist
kubectl get secret -n llm-devops | grep llm-policy-engine

# Check if secret has correct keys
kubectl get secret llm-policy-engine-database -n llm-devops -o json | jq .data

# Test with a debug pod
kubectl run debug --image=busybox -n llm-devops --rm -it --restart=Never -- sh
# Inside pod:
# env | grep DATABASE
```

### Issue: Application Can't Connect to Database

**Symptoms:**
- Health checks failing
- Logs show connection timeouts or authentication errors

**Solutions:**

```bash
# 1. Verify secret values are correct
kubectl get secret llm-policy-engine-database -n llm-devops -o jsonpath='{.data.host}' | base64 -d
kubectl get secret llm-policy-engine-database -n llm-devops -o jsonpath='{.data.username}' | base64 -d

# 2. Test database connection from pod
kubectl exec -n llm-devops deployment/llm-policy-engine -c api -- sh -c '
apt-get update && apt-get install -y postgresql-client
psql "postgresql://$DATABASE_USERNAME:$DATABASE_PASSWORD@$DATABASE_HOST:$DATABASE_PORT/$DATABASE_NAME" -c "SELECT 1"
'

# 3. Check network policies
kubectl get networkpolicy -n llm-devops

# 4. Verify database endpoint
kubectl get endpoints -n llm-devops

# 5. Check if SSL mode is correct
# Try with sslmode=disable for testing
# DON'T use in production
```

### Issue: Old Secret References Still Used

**Symptoms:**
- New secrets created but pods using old credentials
- Deployment not triggering rollout

**Solutions:**

```bash
# 1. Force deployment rollout
kubectl rollout restart deployment/llm-policy-engine -n llm-devops

# 2. Check deployment spec
kubectl get deployment llm-policy-engine -n llm-devops -o yaml | grep -A 10 "secretKeyRef"

# 3. Verify deployment was applied
kubectl get deployment llm-policy-engine -n llm-devops -o yaml | grep "generation:"
# Check metadata.generation vs status.observedGeneration

# 4. Check for typos in secret names
kubectl get deployment llm-policy-engine -n llm-devops -o json | jq '.spec.template.spec.containers[].env[] | select(.valueFrom.secretKeyRef != null) | .valueFrom.secretKeyRef.name' | sort -u
```

### Issue: Permission Denied Errors

**Symptoms:**
- Controller can't create secrets
- RBAC errors in controller logs

**Solutions:**

```bash
# Check controller service account
kubectl get sa -n kube-system sealed-secrets-controller

# Verify RBAC
kubectl get clusterrole sealed-secrets-controller -o yaml
kubectl get clusterrolebinding sealed-secrets-controller -o yaml

# Re-apply controller (includes RBAC)
kubectl apply -f k8s/sealed-secrets/00-controller.yaml

# Check if controller can create secrets
kubectl auth can-i create secrets -n llm-devops --as=system:serviceaccount:kube-system:sealed-secrets-controller
# Expected: yes
```

### Issue: Sealed Secrets Lost After Cluster Rebuild

**Symptoms:**
- Can't unseal secrets after cluster disaster recovery
- New certificate generated, old secrets can't be decrypted

**Solutions:**

```bash
# PREVENTION: Backup the sealing key before disaster
kubectl get secret -n kube-system sealed-secrets-key -o yaml > sealed-secrets-key-backup.yaml
# Store this in a secure vault (e.g., HashiCorp Vault, AWS Secrets Manager)

# RECOVERY: Restore the sealing key
kubectl apply -f sealed-secrets-key-backup.yaml

# Restart controller to pick up restored key
kubectl delete pod -n kube-system -l app.kubernetes.io/name=sealed-secrets

# Verify unsealing works
kubectl get sealedsecret -n llm-devops
kubectl get secret -n llm-devops
```

### Issue: Environment Variable Not Available in Code

**Symptoms:**
- Code throws errors about missing environment variables
- Migration seems successful but features broken

**Solutions:**

```bash
# 1. Verify env vars in running pod
kubectl exec -n llm-devops deployment/llm-policy-engine -c api -- env | sort

# 2. Check application code expects the right variable names
# Update code to use DATABASE_HOST instead of parsing DATABASE_URL

# 3. Add backward compatibility
# Keep both URL and granular variables during transition

# 4. Test with interactive shell
kubectl exec -n llm-devops -it deployment/llm-policy-engine -c api -- /bin/sh
# Inside pod:
# node
# > console.log(process.env.DATABASE_HOST)
# > console.log(process.env.DATABASE_URL)
```

### Issue: High Restart Count After Migration

**Symptoms:**
- Pods restarting frequently
- Health checks failing intermittently

**Solutions:**

```bash
# 1. Check restart reasons
kubectl describe pod -n llm-devops -l app=llm-policy-engine | grep -A 5 "Last State"

# 2. Increase health check timeouts temporarily
kubectl patch deployment llm-policy-engine -n llm-devops -p '
spec:
  template:
    spec:
      containers:
      - name: api
        livenessProbe:
          initialDelaySeconds: 60
          periodSeconds: 20
          timeoutSeconds: 10
'

# 3. Check resource limits
kubectl top pod -n llm-devops -l app=llm-policy-engine

# 4. Review logs for crash reasons
kubectl logs -n llm-devops -l app=llm-policy-engine --previous -c api --tail=100
```

### Common Error Messages

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `secret "X" not found` | Secret not created or wrong namespace | Verify SealedSecret was applied and unsealed |
| `no matches for kind "SealedSecret"` | SealedSecrets CRD not installed | Install controller: `kubectl apply -f 00-controller.yaml` |
| `cannot decrypt secret` | Wrong cluster or certificate | Re-seal with correct certificate |
| `EOF` in logs | Connection string malformed | Check for special characters, ensure proper escaping |
| `authentication failed` | Wrong credentials | Verify secret values with base64 decode |
| `CreateContainerConfigError` | Secret key doesn't exist | Check secret keys match deployment references |

---

## Support and Resources

### Documentation

- [SealedSecrets Official Docs](https://github.com/bitnami-labs/sealed-secrets)
- [Kubernetes Secrets Best Practices](https://kubernetes.io/docs/concepts/configuration/secret/)
- Project-specific docs:
  - `/k8s/sealed-secrets/README.md` - Complete guide to sealed secrets
  - `/k8s/sealed-secrets/scripts/README.md` - Script documentation
  - `/k8s/sealed-secrets/examples/05-backup-recovery-guide.md` - Backup procedures

### Commands Reference

```bash
# Seal a secret
kubeseal -f secret.yaml -w sealed-secret.yaml --controller-namespace=kube-system

# Unseal (for debugging only, requires admin access)
kubeseal --recovery-unseal -f sealed-secret.yaml --recovery-private-key key.pem

# Get controller public certificate
kubeseal --fetch-cert --controller-namespace=kube-system

# Validate sealed secret
kubectl apply --dry-run=client -f sealed-secret.yaml

# Check SealedSecret status
kubectl get sealedsecret -n llm-devops -o wide

# View unsealed secret keys (not values)
kubectl get secret llm-policy-engine-database -n llm-devops -o jsonpath='{.data}' | jq 'keys'

# Backup sealing key (requires admin access)
kubectl get secret -n kube-system sealed-secrets-key -o yaml > backup-key.yaml
```

### Quick Reference: File Locations

```
/workspaces/llm-policy-engine/k8s/
├── deployment.yaml                           # Main deployment (update this)
├── sealed-secrets/
│   ├── 00-controller.yaml                   # SealedSecrets controller
│   ├── MIGRATION_GUIDE.md                   # This file
│   ├── README.md                             # Complete SealedSecrets guide
│   ├── manifests/                            # Generated sealed secrets
│   │   ├── database-sealedsecret.yaml
│   │   ├── redis-sealedsecret.yaml
│   │   └── jwt-sealedsecret.yaml
│   ├── scripts/
│   │   ├── seal-secret.sh                   # Main sealing script
│   │   ├── generate-secrets.sh              # Helper for generation
│   │   ├── validate-sealed-secrets.sh       # Validation script
│   │   ├── README.md                         # Scripts documentation
│   │   └── QUICK_START.md                   # Quick reference
│   ├── templates/                            # Secret templates
│   │   ├── database-secret.template.yaml
│   │   ├── redis-secret.template.yaml
│   │   └── jwt-secret.template.yaml
│   └── examples/                             # Example secrets and guides
│       ├── 01-database-secret.yaml
│       ├── 02-redis-secret.yaml
│       ├── 03-jwt-secret.yaml
│       ├── 04-secret-rotation-script.sh
│       └── 05-backup-recovery-guide.md
```

---

## Migration Checklist Summary

Print this checklist and mark off items as you complete them:

```
PRE-MIGRATION
[ ] Install kubeseal CLI
[ ] Install SealedSecrets controller
[ ] Verify controller is running
[ ] Backup current secrets
[ ] Review application code
[ ] Schedule maintenance window (if needed)
[ ] Notify stakeholders

MIGRATION
[ ] Create .env file with credentials
[ ] Generate SealedSecrets (database, Redis, JWT)
[ ] Apply SealedSecrets to cluster
[ ] Verify secrets unsealed correctly
[ ] Update deployment.yaml
[ ] Review deployment diff
[ ] Apply updated deployment
[ ] Monitor rollout

POST-MIGRATION
[ ] Verify all pods running
[ ] Check pod logs for errors
[ ] Test database connectivity
[ ] Test Redis connectivity
[ ] Test JWT functionality
[ ] Run functional tests
[ ] Monitor for 24-48 hours
[ ] Remove old secret (after monitoring period)

CLEANUP
[ ] Commit SealedSecrets to Git
[ ] Update documentation
[ ] Delete sensitive local files
[ ] Update runbooks
[ ] Communicate completion to team
```

---

## Conclusion

This migration guide provides a comprehensive path from plaintext secrets to encrypted SealedSecrets. Choose the migration strategy that best fits your environment:

- **Direct Migration**: Simple and fast, suitable for staging/dev
- **Side-by-Side Migration**: Zero downtime, recommended for production

Remember to:
- Always backup before migration
- Test thoroughly in staging first
- Monitor closely during and after migration
- Keep rollback plan ready
- Document any custom changes

For questions or issues, refer to the troubleshooting section or consult the project's sealed-secrets documentation.

**Good luck with your migration!**
