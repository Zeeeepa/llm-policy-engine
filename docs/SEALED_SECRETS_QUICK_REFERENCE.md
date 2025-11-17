# Sealed Secrets Quick Reference Guide

A concise, practical guide for day-to-day use of Sealed Secrets in production.

## 30-Second Setup

```bash
# 1. Install controller
kubectl apply -f k8s/sealed-secrets/00-controller.yaml

# 2. Wait for controller to be ready
kubectl rollout status deployment/sealed-secrets-controller -n kube-system

# 3. Fetch and save public key
kubeseal --fetch-cert > k8s/sealed-secrets/keys/public-key.pem

# 4. Done! Ready to seal secrets
```

## Create and Seal a Secret (Step-by-Step)

```bash
# 1. Create regular secret YAML
kubectl create secret generic my-app-secret \
  --from-literal=db-password=mypassword \
  --from-literal=api-key=myapikey \
  --namespace=production \
  --dry-run=client \
  -o yaml > secret.yaml

# 2. Seal it
kubeseal -f secret.yaml -w sealed-secret.yaml

# 3. Commit sealed version (NOT the plain one)
git add sealed-secret.yaml
git commit -m "Add sealed secret for my-app"

# 4. Deploy
kubectl apply -f sealed-secret.yaml

# 5. Verify unsealing worked
kubectl get secrets -n production my-app-secret -o yaml | head -20
```

## Common Tasks

### Seal a Single Value

```bash
# Get just the encrypted value for a password
echo -n "my-secret-password" | kubeseal --raw --namespace=production

# Output: AgBvK8xA9K2zN4pQ2R3sT4uV5wX6yZ7aA8bC9d...
```

### Add New Key to Existing Secret

```bash
# Get current secret
kubectl get sealedsecrets -n production my-secret -o yaml > current.yaml

# Create a new secret with all keys
kubectl create secret generic my-secret \
  --from-literal=old-key="old-value" \
  --from-literal=new-key="new-value" \
  --namespace=production \
  --dry-run=client \
  -o yaml > updated.yaml

# Seal the updated secret
kubeseal -f updated.yaml -w updated-sealed.yaml

# Apply
kubectl apply -f updated-sealed.yaml
```

### Update a Secret Value

```bash
# Same process as adding a key - provide all keys with new value
kubectl create secret generic my-secret \
  --from-literal=username="user" \
  --from-literal=password="NEW_PASSWORD_HERE" \
  --namespace=production \
  --dry-run=client \
  -o yaml | kubeseal -f - | kubectl apply -f -
```

### Rotate a Database Password

```bash
# 1. Generate new password in database
# ALTER ROLE app_user WITH PASSWORD 'new_secure_password';

# 2. Create sealed secret with new password
kubectl create secret generic db-creds \
  --from-literal=host=db.prod.svc \
  --from-literal=user=app_user \
  --from-literal=password=new_secure_password \
  --namespace=production \
  --dry-run=client \
  -o yaml | kubeseal -f - | kubectl apply -f -

# 3. Trigger rolling restart
kubectl rollout restart deployment/api-service -n production

# 4. Monitor logs
kubectl logs -f deployment/api-service -n production | grep -i "database\|connected"

# 5. Revoke old password
# DROP ROLE old_app_user;
```

### Use Offline Certificate

```bash
# Download once (safe to commit)
kubeseal --fetch-cert > k8s/sealed-secrets/public-key.pem
git add k8s/sealed-secrets/public-key.pem

# Now seal without connecting to cluster
kubeseal --cert k8s/sealed-secrets/public-key.pem -f secret.yaml -w sealed.yaml

# Works even if cluster is down!
```

## Scope Reference

```bash
# STRICT (default, safest)
# Can only unseal in specific namespace with specific name
kubeseal -f secret.yaml

# NAMESPACE-WIDE
# Can be renamed within namespace
kubeseal --scope namespace-wide -f secret.yaml

# CLUSTER-WIDE
# Can move anywhere, rename anything (least safe)
kubeseal --scope cluster-wide -f secret.yaml
```

## Troubleshooting

### Secret won't unseal

```bash
# Check if controller is running
kubectl get pods -n kube-system -l name=sealed-secrets-controller

# Check controller logs for errors
kubectl logs -n kube-system -l name=sealed-secrets-controller

# Check if sealing key exists
kubectl get secret -n kube-system sealed-secrets-key

# Describe the sealed secret
kubectl describe sealedsecrets -n production my-secret
```

### Sealed secret shows "not yet valid"

```bash
# Wait for controller to initialize
kubectl get deployment sealed-secrets-controller -n kube-system

# If stuck, check pod logs
kubectl logs -n kube-system -l name=sealed-secrets-controller --tail=50
```

### Can't seal locally

```bash
# Make sure certificate is fresh
kubeseal --fetch-cert > k8s/sealed-secrets/public-key.pem

# Try again with cert
kubeseal --cert k8s/sealed-secrets/public-key.pem -f secret.yaml
```

## Template Snippets

### Basic Secret

```yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: app-secrets
  namespace: production
spec:
  encryptedData:
    username: AgBvK8xA9K2zN4pQ2R3sT4uV5wX6yZ7aA8bC9d...
    password: AgCdL2mB7F3sO5rT6uV7wX8yZ9aB0cD1eF2g...
  template:
    metadata:
      name: app-secrets
      namespace: production
    type: Opaque
```

### Database Secret

```yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: db-creds
  namespace: production
  labels:
    component: database
spec:
  encryptedData:
    url: AgBvK8xA9K2zN4pQ...
    host: AgCdL2mB7F3sO5rT...
    user: AgEvM9nC3G4uP6sU...
    password: AgFwN0oD1pE2qF3rG...
  template:
    metadata:
      name: db-creds
      namespace: production
      labels:
        component: database
    type: Opaque
```

### Using Secret in Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: production
spec:
  template:
    spec:
      containers:
      - name: app
        image: my-app:1.0.0
        env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-creds
              key: password
```

## Backup and Restore

### Backup

```bash
# Backup private key (ENCRYPTED, off-site)
kubectl get secret -n kube-system sealed-secrets-key -o yaml | \
  openssl enc -aes-256-cbc -salt -out sealed-secrets-key.enc

# Backup public cert (safe to commit)
kubeseal --fetch-cert > sealed-secrets-key.pem

# Backup all sealed secrets
kubectl get sealedsecrets -A -o yaml > all-sealed-secrets-backup.yaml
```

### Restore

```bash
# Restore private key
openssl enc -d -aes-256-cbc -in sealed-secrets-key.enc | kubectl apply -f -

# Restart controller
kubectl rollout restart deployment/sealed-secrets-controller -n kube-system

# Restore sealed secrets
kubectl apply -f all-sealed-secrets-backup.yaml
```

## Rotation Schedule

| Secret | Frequency | When |
|---|---|---|
| Database passwords | Quarterly | Q1, Q2, Q3, Q4 |
| API keys | Monthly | 1st of each month |
| JWT keys | Bi-annually | Jan 1, Jul 1 |
| Redis password | Quarterly | Same as database |
| OAuth secrets | Monthly | Same as API keys |

## Key Facts

- Secrets are encrypted at rest in Git ✓
- Only your cluster can decrypt them ✓
- Safe to commit sealed secrets to public repo ✓
- Never commit the private key ✓
- Each cluster has unique encryption key ✓
- Old keys automatically kept for decryption ✓
- Certificate rotates automatically monthly ✓

## One-Liners

```bash
# Seal and deploy immediately
kubectl create secret generic my-secret --from-literal=key=value --namespace=prod --dry-run=client -o yaml | kubeseal -f - | kubectl apply -f -

# Check all sealed secrets
kubectl get sealedsecrets -A

# Get unsealed secret value
kubectl get secret my-secret -n prod -o jsonpath='{.data.password}' | base64 -d

# Re-seal all secrets (after cluster key rotation)
for secret in $(kubectl get sealedsecrets -A -o jsonpath='{.items[*].metadata.name}'); do kubectl get sealedsecrets $secret -o yaml | kubeseal --re-seal -f - | kubectl apply -f -; done

# Export certificate to clipboard
kubeseal --fetch-cert | pbcopy  # macOS
kubeseal --fetch-cert | xclip -selection clipboard  # Linux
```

## Common Mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Committing private key | Encryption useless | Regenerate cluster key |
| Using cluster-wide scope | Anyone can move secret | Use strict scope |
| Not backing up key | Can't restore | Backup now! |
| Sealing with wrong key | Won't decrypt | Use correct public key |
| Forgetting to rotate | Stale credentials | Set calendar reminder |
| Not testing rotation | Production failure | Test in staging first |

## File Locations

```
k8s/sealed-secrets/
├── 00-controller.yaml          # Deploy this
├── keys/
│   ├── public-key.pem          # Safe to commit
│   └── sealed-secrets-key-backup.yaml.enc  # Encrypted backup (not in Git)
└── examples/
    ├── database-secret.yaml
    ├── redis-secret.yaml
    └── jwt-secret.yaml
```

## Git Workflow

```bash
# Setup .gitignore
echo "*-backup.yaml" >> .gitignore
echo "*.enc" >> .gitignore
git add .gitignore

# Only commit sealed versions and public cert
git add k8s/sealed-secrets/
git commit -m "Add sealed secrets"

# Private key stays local
# Backup separately to encrypted storage
```

## Useful Commands

```bash
# Install kubeseal
brew install kubeseal  # macOS
sudo apt-get install kubeseal  # Ubuntu/Debian

# Update kubeseal
brew upgrade kubeseal

# Check kubeseal version
kubeseal --version

# Get help
kubeseal --help
kubeseal --help-scopes
```

## When to Use Sealed Secrets

**Use Sealed Secrets when:**
- You want GitOps with secret encryption
- You use Kubernetes (1.16+)
- You want cluster-native solution
- You need simple, built-in encryption

**Consider alternatives when:**
- You need external secret management (HashiCorp Vault)
- You need secrets outside Kubernetes
- You need advanced key rotation
- You have compliance requirements beyond encryption

## Emergency Procedures

### Controller crash
```bash
# Will auto-recover from etcd backup
# Monitor: kubectl get pods -n kube-system
```

### Lost private key (no backup)
```bash
# Generate new key (automatic on restart)
# Manually re-seal all secrets
# Rotate all actual credentials
```

### Compromised cluster
```bash
# Generate new sealing key
kubectl delete secret sealed-secrets-key -n kube-system
# Controller generates new key
# Re-seal all secrets with new key
# Rotate all credentials
```

