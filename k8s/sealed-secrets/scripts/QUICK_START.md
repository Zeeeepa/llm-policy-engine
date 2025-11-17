# Quick Start Guide - seal-secret.sh

## 1-Minute Setup

```bash
# 1. Install prerequisites
brew install kubeseal  # macOS
# or download from: https://github.com/bitnami-labs/sealed-secrets/releases

# 2. Install controller (if not already installed)
kubectl apply -f ../00-controller.yaml

# 3. Verify controller is running
kubectl get pods -n kube-system -l app.kubernetes.io/name=sealed-secrets
```

## Common Commands

### From .env File (Recommended)

```bash
# Create .env file
cat > .env.production <<EOF
DATABASE_HOST=postgres.example.com
DATABASE_PORT=5432
DATABASE_USERNAME=llm_user
DATABASE_PASSWORD=secure-password-123
DATABASE_NAME=llm_policy_engine
DATABASE_SSL_MODE=require
EOF

# Seal the secret
./seal-secret.sh --template database --env-file .env.production

# Apply to cluster
kubectl apply -f ../manifests/database-sealedsecret.yaml
```

### Interactive Mode

```bash
./seal-secret.sh --template redis --interactive
# Follow prompts...
```

### One-Command Seal & Apply

```bash
./seal-secret.sh --template jwt --env-file .env.production --apply --confirm
```

### Preview Only (Dry Run)

```bash
./seal-secret.sh --template database --env-file .env.staging --dry-run
```

## Template Cheatsheet

### Database
```bash
DATABASE_HOST=postgres.example.com
DATABASE_PORT=5432
DATABASE_USERNAME=llm_user
DATABASE_PASSWORD=secure-password
DATABASE_NAME=llm_policy_engine
DATABASE_SSL_MODE=require
```

### Redis
```bash
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=secure-password
REDIS_DB=0
REDIS_TLS_ENABLED=false
```

### JWT
```bash
JWT_SECRET=minimum-32-character-secret-key-here
JWT_ALGORITHM=HS256
JWT_EXPIRES_IN=24h
JWT_ISSUER=llm-policy-engine
JWT_AUDIENCE=llm-policy-engine-api
```

## Help

```bash
./seal-secret.sh --help
```

## Troubleshooting

```bash
# Check controller logs
kubectl logs -n kube-system deployment/sealed-secrets-controller

# Verify sealed secret was created
kubectl get sealedsecret -n llm-devops

# Verify plain secret was decrypted
kubectl get secret -n llm-devops
```

See [README.md](./README.md) for full documentation.
