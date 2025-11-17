# Sealed Secrets Backup and Recovery Guide

Production-grade backup and disaster recovery procedures for Sealed Secrets.

## Quick Start: Automated Backup

```bash
#!/bin/bash
# Run daily via CronJob

BACKUP_DIR="/secure/backups/sealed-secrets/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# Export all SealedSecrets
kubectl get sealedsecrets -A -o yaml > "$BACKUP_DIR/sealedsecrets-all.yaml"

# Backup private key (ENCRYPTED)
kubectl get secret -n kube-system sealed-secrets-key -o yaml | \
    openssl enc -aes-256-cbc -salt -out "$BACKUP_DIR/sealing-key.enc" \
    -pass pass:YOUR_SECURE_PASSWORD

# Backup public certificate (safe)
kubeseal --fetch-cert > "$BACKUP_DIR/public-key.pem"

# Create manifest
cat > "$BACKUP_DIR/BACKUP_INFO.txt" <<EOF
Sealed Secrets Backup
Generated: $(date)
Cluster: $(kubectl cluster-info | grep 'Kubernetes master' | awk '{print $NF}')

Contents:
- sealedsecrets-all.yaml: All SealedSecret resources (safe)
- sealing-key.enc: Private encryption key (encrypted, store securely)
- public-key.pem: Public certificate (safe)

Recovery: See RECOVERY.md for procedures
EOF

echo "Backup completed: $BACKUP_DIR"
```

## What to Backup

### 1. Private Sealing Key (CRITICAL - ENCRYPT)

The controller's private key that decrypts all secrets.

```bash
# Export
kubectl get secret -n kube-system sealed-secrets-key -o yaml > sealing-key.yaml

# Encrypt with strong password
openssl enc -aes-256-cbc -salt -in sealing-key.yaml -out sealing-key.enc

# Verify encryption
file sealing-key.enc  # Should show: openssl encrypted data

# Remove unencrypted copy
shred -vfz -n 10 sealing-key.yaml
```

**Storage**: Encrypted external drive, password-protected cloud storage, or HSM
**Access**: Limit to infrastructure team only
**Test**: Verify you can decrypt before storing

### 2. Public Certificate (SAFE TO COMMIT)

The public key for sealing new secrets.

```bash
# Export public certificate
kubeseal --fetch-cert > public-key.pem

# Safe to commit to Git
git add public-key.pem
git commit -m "Update sealed secrets public certificate"

# Verify validity
openssl x509 -in public-key.pem -text -noout
```

### 3. All SealedSecrets (SAFE TO COMMIT)

All sealed secret manifests.

```bash
# Export all SealedSecrets
kubectl get sealedsecrets -A -o yaml > sealedsecrets-backup.yaml

# Export namespaced
for ns in production staging development; do
    kubectl get sealedsecrets -n "$ns" -o yaml > "sealedsecrets-${ns}.yaml"
done

# Safe to commit to Git
git add sealedsecrets*.yaml
git commit -m "Backup: SealedSecrets manifests"
```

### 4. Backup Verification Checklist

```bash
#!/bin/bash

echo "Verifying Sealed Secrets Backup..."

# Check private key is encrypted
if ! file sealed-secrets-key.enc | grep -q "openssl encrypted data"; then
    echo "ERROR: Private key not encrypted"
    exit 1
fi

# Check private key can be decrypted
if ! openssl enc -aes-256-cbc -d -in sealed-secrets-key.enc \
    -pass pass:TEST_PASSWORD | grep -q "sealed-secrets-key"; then
    echo "ERROR: Cannot decrypt private key"
    exit 1
fi

# Check public certificate
if ! openssl x509 -in public-key.pem -noout >/dev/null 2>&1; then
    echo "ERROR: Public certificate invalid"
    exit 1
fi

# Check certificate expiry
EXPIRY=$(openssl x509 -in public-key.pem -noout -enddate | cut -d= -f2)
echo "Certificate valid until: $EXPIRY"

# Check SealedSecrets manifests
if ! kubectl apply -f sealedsecrets-backup.yaml --dry-run=client >/dev/null 2>&1; then
    echo "ERROR: SealedSecrets manifests invalid"
    exit 1
fi

# Check all keys referenced by secrets exist
for key in $(grep -h "encryptionKey:" sealedsecrets-backup.yaml | awk '{print $NF}' | sort -u); do
    echo "Found reference to encryption key: $key"
done

echo "Backup verification completed successfully"
```

## Backup Schedule

```yaml
# Kubernetes CronJob for automated backups
apiVersion: batch/v1
kind: CronJob
metadata:
  name: sealed-secrets-backup
  namespace: kube-system
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: sealed-secrets-backup
          containers:
          - name: backup
            image: bitnami/kubectl:latest
            command:
            - /bin/bash
            - -c
            - |
              set -e
              BACKUP_DIR="/backups/sealed-secrets/$(date +\%Y\%m\%d)"
              mkdir -p $BACKUP_DIR

              echo "Backing up sealed-secrets..."
              kubectl get sealedsecrets -A -o yaml > $BACKUP_DIR/sealedsecrets-all.yaml
              kubectl get secret -n kube-system sealed-secrets-key -o yaml | \
                openssl enc -aes-256-cbc -salt -out $BACKUP_DIR/sealing-key.enc \
                -pass pass:$BACKUP_PASSWORD
              kubeseal --fetch-cert > $BACKUP_DIR/public-key.pem

              echo "Backup completed: $BACKUP_DIR"
            env:
            - name: BACKUP_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: backup-encryption-key
                  key: password
            volumeMounts:
            - name: backup
              mountPath: /backups
          volumes:
          - name: backup
            persistentVolumeClaim:
              claimName: sealed-secrets-backup-pvc
          restartPolicy: OnFailure

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sealed-secrets-backup
  namespace: kube-system

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: sealed-secrets-backup
rules:
- apiGroups: ["bitnami.com"]
  resources: ["sealedsecrets"]
  verbs: ["get", "list"]
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: sealed-secrets-backup
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: sealed-secrets-backup
subjects:
- kind: ServiceAccount
  name: sealed-secrets-backup
  namespace: kube-system
```

## Off-Site Backup

### AWS S3 with KMS Encryption

```bash
#!/bin/bash

BACKUP_DIR="/tmp/sealed-secrets-backup-$(date +%s)"
S3_BUCKET="s3://my-backups/sealed-secrets"
AWS_KMS_KEY_ID="arn:aws:kms:region:account:key/key-id"

mkdir -p "$BACKUP_DIR"

# Backup locally
kubectl get sealedsecrets -A -o yaml > "$BACKUP_DIR/sealedsecrets-all.yaml"
kubectl get secret -n kube-system sealed-secrets-key -o yaml | \
    openssl enc -aes-256-cbc -salt -out "$BACKUP_DIR/sealing-key.enc"
kubeseal --fetch-cert > "$BACKUP_DIR/public-key.pem"

# Upload to S3 with encryption
aws s3 cp "$BACKUP_DIR/sealing-key.enc" "$S3_BUCKET/$(date +%Y-%m-%d)/" \
    --sse aws:kms \
    --sse-kms-key-id "$AWS_KMS_KEY_ID"

aws s3 cp "$BACKUP_DIR/sealedsecrets-all.yaml" "$S3_BUCKET/$(date +%Y-%m-%d)/"
aws s3 cp "$BACKUP_DIR/public-key.pem" "$S3_BUCKET/$(date +%Y-%m-%d)/"

# Verify upload
aws s3 ls "$S3_BUCKET/$(date +%Y-%m-%d)/"

# Cleanup
rm -rf "$BACKUP_DIR"
```

### Google Cloud Storage

```bash
#!/bin/bash

BACKUP_DIR="/tmp/sealed-secrets-backup"
GCS_BUCKET="gs://my-backups/sealed-secrets"

mkdir -p "$BACKUP_DIR"

# Backup locally
kubectl get sealedsecrets -A -o yaml > "$BACKUP_DIR/sealedsecrets-all.yaml"
kubectl get secret -n kube-system sealed-secrets-key -o yaml | \
    openssl enc -aes-256-cbc -salt -out "$BACKUP_DIR/sealing-key.enc"
kubeseal --fetch-cert > "$BACKUP_DIR/public-key.pem"

# Upload to GCS
gsutil -h "Cache-Control:no-cache" \
    -h "Content-Encoding:gzip" \
    cp -r "$BACKUP_DIR/*" "$GCS_BUCKET/$(date +%Y-%m-%d)/"

# Verify
gsutil ls "$GCS_BUCKET/"

# Cleanup
rm -rf "$BACKUP_DIR"
```

## Recovery Procedures

### Scenario 1: Restore Keys to New Cluster

**Situation**: Cluster destroyed, need to restore from backup

```bash
#!/bin/bash

set -e

echo "=== Sealed Secrets Cluster Recovery ==="

# Prerequisites
echo "Step 1: Prerequisites"
read -p "Have you installed a new Kubernetes cluster? (y/n) " -n 1 -r
[[ $REPLY =~ ^[Yy]$ ]] || exit 1

read -p "Have you obtained the encrypted backup? (y/n) " -n 1 -r
[[ $REPLY =~ ^[Yy]$ ]] || exit 1

# Install controller
echo "Step 2: Installing Sealed Secrets controller..."
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.5/controller.yaml
kubectl wait --for=condition=ready pod \
    -l name=sealed-secrets-controller \
    -n kube-system \
    --timeout=300s
echo "Controller installed and ready."

# Delete default key
echo "Step 3: Removing default sealing key..."
kubectl delete secret sealed-secrets-key -n kube-system || echo "No default key found"
sleep 5

# Restore encrypted key
echo "Step 4: Restoring private sealing key..."
read -sp "Enter backup encryption password: " BACKUP_PASSWORD
echo ""

openssl enc -d -aes-256-cbc -in sealed-secrets-key.enc \
    -pass pass:$BACKUP_PASSWORD | \
    kubectl apply -f -

# Restart controller to use restored key
echo "Step 5: Restarting controller to use restored key..."
kubectl rollout restart deployment/sealed-secrets-controller -n kube-system
kubectl wait --for=condition=ready pod \
    -l name=sealed-secrets-controller \
    -n kube-system \
    --timeout=300s
echo "Controller restarted with restored key."

# Restore sealed secrets
echo "Step 6: Restoring SealedSecrets..."
kubectl apply -f sealedsecrets-all.yaml
sleep 10

# Verify
echo "Step 7: Verifying restoration..."
SEALED_COUNT=$(kubectl get sealedsecrets -A --no-headers | wc -l)
UNSEALED_COUNT=$(kubectl get secrets -A --no-headers | grep -v default | wc -l)

echo "Sealed secrets restored: $SEALED_COUNT"
echo "Unsealed secrets available: $UNSEALED_COUNT"

# Final verification
echo "Step 8: Testing decryption..."
TEST_SECRET=$(kubectl get sealedsecrets -A --no-headers | head -1 | awk '{print $2}' | xargs -I{} kubectl get sealedsecrets {} -n production -o jsonpath='{.metadata.name}')

if kubectl get secret "$TEST_SECRET" -n production -o yaml 2>/dev/null | grep -q "data:"; then
    echo "SUCCESS: Secrets properly decrypted!"
else
    echo "ERROR: Secrets not decrypting properly"
    exit 1
fi

echo ""
echo "=== Recovery Completed Successfully ==="
echo "Your cluster is now restored with all sealed secrets"
```

### Scenario 2: Recover Single Secret

**Situation**: One sealed secret corrupted/lost

```bash
# Get backup of the secret
kubectl get sealedsecrets -n production my-secret -o yaml > /tmp/my-secret-backup.yaml

# Re-apply from backup
kubectl apply -f /tmp/my-secret-backup.yaml

# Verify it unseals correctly
kubectl get secret my-secret -n production -o yaml
```

### Scenario 3: Lost Private Key (No Backup)

**Situation**: Cluster compromised, need to rotate all secrets

```bash
#!/bin/bash

echo "WARNING: This process requires manual rotation of all credentials"
read -p "Continue? (y/n) " -n 1 -r
[[ $REPLY =~ ^[Yy]$ ]] || exit 1

# Generate new sealing key
echo "Generating new sealing key..."
kubectl delete secret sealed-secrets-key -n kube-system || echo "Key not found"
kubectl rollout restart deployment/sealed-secrets-controller -n kube-system

# Controller will generate new key automatically
sleep 10

# Collect all current secrets manually
echo "Collecting current secrets for re-sealing..."
kubectl get secrets -A -o yaml > /tmp/all-secrets-backup.yaml

# Get new public certificate
kubeseal --fetch-cert > public-key-new.pem

# Delete all sealed secrets (start fresh)
kubectl delete sealedsecrets -A --all

# Manually create and seal new secrets
# For each secret in all-secrets-backup.yaml:
# 1. Extract it
# 2. Seal with new certificate
# 3. Apply to cluster

echo ""
echo "Manual steps required:"
echo "1. Update all credential values in the system"
echo "2. Create new sealed secrets from the backups"
echo "3. Deploy updated manifests"
echo "4. Verify all services reconnected successfully"
```

## Disaster Recovery Runbook

### Full Cluster Recovery (Checklist)

- [ ] Verify backup integrity
- [ ] Decrypt private key backup
- [ ] Deploy new Kubernetes cluster
- [ ] Install Sealed Secrets controller
- [ ] Restore private sealing key
- [ ] Restart controller with restored key
- [ ] Apply all SealedSecrets manifests
- [ ] Verify secrets unsealing correctly
- [ ] Deploy applications
- [ ] Monitor application startup
- [ ] Verify all services healthy
- [ ] Document recovery in incident report

### Recovery Time Estimate

| Step | Time |
|---|---|
| Deploy new cluster | 30-60 minutes |
| Install Sealed Secrets | 5 minutes |
| Restore keys | 5 minutes |
| Apply secrets | 2 minutes |
| Deploy applications | 10-20 minutes |
| Verification | 10 minutes |
| **Total** | **60-100 minutes** |

## Testing Recovery

### Monthly Recovery Test

```bash
#!/bin/bash

echo "Monthly Sealed Secrets Recovery Test"

# Create test namespace
kubectl create namespace recovery-test || true

# Copy sealed secrets to test namespace
kubectl get sealedsecrets -n production -o yaml | \
    sed 's/namespace: production/namespace: recovery-test/g' | \
    kubectl apply -f -

# Verify unsealing works
sleep 10
UNSEALED=$(kubectl get secrets -n recovery-test --no-headers | wc -l)

if [ "$UNSEALED" -gt 0 ]; then
    echo "SUCCESS: Secrets properly unsealed in test namespace"
    kubectl delete namespace recovery-test
else
    echo "FAILED: Secrets not unsealing"
    exit 1
fi
```

## Best Practices Summary

1. **Backup Frequency**: Daily automated backups
2. **Encryption**: AES-256 with strong passwords
3. **Off-site Storage**: Multiple geographic locations
4. **Access Control**: Restrict to infrastructure team
5. **Regular Testing**: Monthly recovery drills
6. **Documentation**: Keep recovery procedures updated
7. **Monitoring**: Alert on backup failures
8. **Retention**: Keep 30 days of backups minimum

## References

- [Sealed Secrets Backup docs](https://github.com/bitnami-labs/sealed-secrets#backup-and-restore)
- [Kubernetes Secret Backup Best Practices](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Disaster Recovery Planning](https://www.kubernetes.io/docs/tasks/administer-cluster/manage-resources/)

