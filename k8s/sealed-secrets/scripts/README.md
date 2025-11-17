# Sealed Secrets Management Scripts

This directory contains scripts for managing sealed secrets in the LLM Policy Engine project.

## Scripts

### `seal-secret.sh`

Production-ready bash script for sealing Kubernetes secrets using kubeseal.

**Version:** 1.0.0

## Prerequisites

Before using the seal-secret.sh script, ensure you have the following tools installed:

1. **kubeseal** - Sealed Secrets CLI
   ```bash
   # Install on Linux
   wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/kubeseal-0.24.0-linux-amd64.tar.gz
   tar -xvzf kubeseal-0.24.0-linux-amd64.tar.gz
   sudo mv kubeseal /usr/local/bin/

   # Install on macOS
   brew install kubeseal
   ```

2. **kubectl** - Kubernetes CLI
   ```bash
   # Should already be configured with cluster access
   kubectl version --client
   ```

3. **envsubst** - Environment variable substitution
   ```bash
   # Usually part of gettext package
   # On Ubuntu/Debian
   sudo apt-get install gettext-base

   # On macOS
   brew install gettext
   ```

4. **Sealed Secrets Controller** - Must be running in the cluster
   ```bash
   # Install the controller
   kubectl apply -f ../00-controller.yaml

   # Verify it's running
   kubectl get pods -n kube-system -l app.kubernetes.io/name=sealed-secrets
   ```

## Quick Start

### 1. Basic Usage with .env File

```bash
# Create a .env file with your secrets
cat > .env.production <<EOF
ENVIRONMENT=production
DATABASE_HOST=postgres.example.com
DATABASE_PORT=5432
DATABASE_USERNAME=llm_policy_user
DATABASE_PASSWORD=super-secure-password-123
DATABASE_NAME=llm_policy_engine
DATABASE_SSL_MODE=require
EOF

# Seal the database secret
./seal-secret.sh --template database --env-file .env.production

# Review the sealed secret
cat ../manifests/database-sealedsecret.yaml

# Apply to cluster
kubectl apply -f ../manifests/database-sealedsecret.yaml
```

### 2. Interactive Mode

```bash
# Prompt for secret values interactively
./seal-secret.sh --template jwt --interactive

# Follow the prompts to enter:
# - JWT secret
# - Algorithm
# - Expiration time
# - Issuer
# - Audience
```

### 3. Seal and Apply in One Step

```bash
# Seal and immediately apply to cluster
./seal-secret.sh --template redis \
  --env-file .env.production \
  --apply \
  --confirm
```

### 4. Dry Run (Preview Only)

```bash
# Preview the sealed secret without writing to file
./seal-secret.sh --template database \
  --env-file .env.staging \
  --dry-run
```

## Command Reference

### Required Arguments

- `--template TYPE` - Secret template type (database|redis|jwt)

### Input Source (choose one)

- `--env-file PATH` - Load secrets from .env file
- `--interactive` - Prompt for secrets interactively

### Optional Arguments

- `--apply` - Apply sealed secret to cluster after creation
- `--dry-run` - Output to stdout only, don't write files
- `--cert PATH` - Path to sealed-secrets public certificate (auto-fetched if not provided)
- `--controller-name NAME` - Sealed-secrets controller name (default: sealed-secrets-controller)
- `--controller-namespace NS` - Controller namespace (default: kube-system)
- `--output PATH` - Output file path (default: manifests/{type}-sealedsecret.yaml)
- `--confirm` - Skip all confirmation prompts
- `--verbose` - Enable verbose output
- `--debug` - Enable debug output
- `--help` - Show help message

## Templates

### Database Template

Required environment variables:
- `DATABASE_HOST` - PostgreSQL host
- `DATABASE_PORT` - PostgreSQL port (default: 5432)
- `DATABASE_USERNAME` - Database username
- `DATABASE_PASSWORD` - Database password
- `DATABASE_NAME` - Database name
- `DATABASE_SSL_MODE` - SSL mode (disable|require|verify-ca|verify-full)

### Redis Template

Required environment variables:
- `REDIS_HOST` - Redis host
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password
- `REDIS_DB` - Redis database number (default: 0)
- `REDIS_TLS_ENABLED` - TLS enabled (true|false)

### JWT Template

Required environment variables:
- `JWT_SECRET` - JWT signing secret (min 32 chars)
- `JWT_ALGORITHM` - Algorithm (HS256|HS384|HS512|RS256|ES256)
- `JWT_EXPIRES_IN` - Token expiration (e.g., 24h, 7d)
- `JWT_ISSUER` - Token issuer
- `JWT_AUDIENCE` - Token audience

Optional (for asymmetric algorithms):
- `JWT_PUBLIC_KEY` - Public key (base64-encoded)
- `JWT_PRIVATE_KEY` - Private key (base64-encoded)

## Security Features

### 1. Never Writes Plain Secrets to Disk

The script uses process substitution and pipes to ensure plain secrets are never written to disk:

```bash
# Plain secrets only exist in memory
plain_secret=$(envsubst < template.yaml)
echo "$plain_secret" | kubeseal > sealed.yaml
```

### 2. Secret Complexity Validation

The script validates that secrets meet minimum security requirements:
- Minimum length of 12 characters for passwords
- Checks for common weak passwords
- Warns about default/development values

### 3. Restrictive File Permissions

All sealed secret files are created with 600 permissions (owner read/write only):

```bash
chmod 600 manifests/database-sealedsecret.yaml
```

### 4. Secure Cleanup

Temporary files (like auto-fetched certificates) are securely shredded:

```bash
shred -u /tmp/sealed-secrets-cert.XXXXXX
```

### 5. Metadata Tracking

Each sealed secret includes metadata for rotation tracking:

```yaml
metadata:
  annotations:
    llm-policy-engine.io/sealed-at: "2025-11-17T07:56:00Z"
    llm-policy-engine.io/sealed-by: "user@hostname"
    llm-policy-engine.io/last-rotated: "2025-11-17T07:56:00Z"
    llm-policy-engine.io/next-rotation: "2026-02-15"
```

## Common Workflows

### Initial Setup (First Time)

```bash
# 1. Install sealed-secrets controller
kubectl apply -f ../00-controller.yaml

# 2. Wait for controller to be ready
kubectl wait --for=condition=available --timeout=60s \
  deployment/sealed-secrets-controller -n kube-system

# 3. Create .env file with production secrets
cp ../../../../.env.example .env.production
# Edit .env.production with real values

# 4. Seal all secrets
./seal-secret.sh --template database --env-file .env.production
./seal-secret.sh --template redis --env-file .env.production
./seal-secret.sh --template jwt --env-file .env.production

# 5. Apply all sealed secrets
kubectl apply -f ../manifests/

# 6. Verify secrets are created
kubectl get secrets -n llm-devops
```

### Secret Rotation (Every 90 Days)

```bash
# 1. Update .env file with new values
vim .env.production

# 2. Seal the updated secret
./seal-secret.sh --template database --env-file .env.production

# 3. Review changes
git diff ../manifests/database-sealedsecret.yaml

# 4. Apply the update
kubectl apply -f ../manifests/database-sealedsecret.yaml

# 5. Verify the secret was updated
kubectl describe secret llm-policy-engine-database -n llm-devops

# 6. Commit the sealed secret
git add ../manifests/database-sealedsecret.yaml
git commit -m "chore: rotate database secrets"
git push
```

### Multi-Environment Setup

```bash
# Create environment-specific .env files
.env.development
.env.staging
.env.production

# Seal for each environment
ENVIRONMENT=development ./seal-secret.sh \
  --template database \
  --env-file .env.development \
  --output ../manifests/dev-database-sealedsecret.yaml

ENVIRONMENT=staging ./seal-secret.sh \
  --template database \
  --env-file .env.staging \
  --output ../manifests/staging-database-sealedsecret.yaml

ENVIRONMENT=production ./seal-secret.sh \
  --template database \
  --env-file .env.production \
  --output ../manifests/prod-database-sealedsecret.yaml
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Seal Kubernetes Secrets
  run: |
    # Install kubeseal
    wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/kubeseal-0.24.0-linux-amd64.tar.gz
    tar -xvzf kubeseal-0.24.0-linux-amd64.tar.gz
    sudo mv kubeseal /usr/local/bin/

    # Seal secrets
    cd k8s/sealed-secrets/scripts
    ./seal-secret.sh \
      --template database \
      --env-file .env.production \
      --cert ../controller-public-cert.pem \
      --confirm

    # Commit if changed
    git config user.name "GitHub Actions"
    git config user.email "actions@github.com"
    git add ../manifests/*.yaml
    git commit -m "chore: update sealed secrets [skip ci]" || true
    git push
```

## Troubleshooting

### Error: "kubeseal: command not found"

Install kubeseal CLI:
```bash
# Linux
wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/kubeseal-0.24.0-linux-amd64.tar.gz
tar -xvzf kubeseal-0.24.0-linux-amd64.tar.gz
sudo mv kubeseal /usr/local/bin/

# macOS
brew install kubeseal
```

### Error: "Sealed-secrets controller not found"

Install the controller:
```bash
kubectl apply -f ../00-controller.yaml
kubectl wait --for=condition=available --timeout=60s \
  deployment/sealed-secrets-controller -n kube-system
```

### Error: "Cannot connect to Kubernetes cluster"

Check kubectl configuration:
```bash
kubectl config current-context
kubectl cluster-info
```

### Error: "Missing required environment variables"

Ensure all required variables for the template are set:
```bash
# Database template requires:
export DATABASE_HOST=postgres.example.com
export DATABASE_PORT=5432
export DATABASE_USERNAME=user
export DATABASE_PASSWORD=pass
export DATABASE_NAME=db
export DATABASE_SSL_MODE=require
```

### Error: "Template file not found"

Verify template files exist:
```bash
ls -la ../templates/
# Should show:
# database-secret.template.yaml
# redis-secret.template.yaml
# jwt-secret.template.yaml
```

### Sealed Secret Not Decrypting

Check controller logs:
```bash
kubectl logs -n kube-system deployment/sealed-secrets-controller
```

Common issues:
- Wrong namespace/name scope
- Certificate mismatch (sealed with different cert)
- Controller not running

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Missing dependencies
- `3` - Validation error
- `4` - Kubernetes/cluster error
- `5` - File I/O error

## Best Practices

1. **Never commit .env files** - Only commit sealed secrets
   ```bash
   # Add to .gitignore
   .env
   .env.*
   !.env.example
   ```

2. **Rotate secrets regularly** - Every 90 days recommended
   - Script adds rotation metadata automatically
   - Set calendar reminders for rotation

3. **Use different secrets per environment**
   - Never reuse production secrets in staging/dev
   - Use separate .env files per environment

4. **Test in staging first**
   - Seal and apply to staging environment
   - Verify application works
   - Then apply to production

5. **Backup sealed-secrets keys**
   ```bash
   kubectl get secret -n kube-system \
     -l sealedsecrets.bitnami.com/sealed-secrets-key \
     -o yaml > sealed-secrets-master-key-backup.yaml
   # Store in secure location (not in git!)
   ```

6. **Use CI/CD for automation**
   - Automate sealing in CI pipeline
   - Validate sealed secrets before merge
   - Auto-apply to clusters on main branch

## Support

For issues or questions:
- Check logs: `kubectl logs -n kube-system deployment/sealed-secrets-controller`
- Review documentation: https://github.com/bitnami-labs/sealed-secrets
- Open issue: https://github.com/organization/llm-policy-engine/issues

## License

Part of the LLM Policy Engine project.
