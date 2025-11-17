# Sealed Secrets Implementation Roadmap

A step-by-step implementation plan for deploying Sealed Secrets in production.

## Phase 1: Planning and Preparation (Week 1)

### 1.1 Assessment
- [ ] Review current secret management approach
- [ ] Identify all secrets in use (databases, APIs, keys, tokens)
- [ ] Map secrets to services and dependencies
- [ ] Document current secret rotation procedures
- [ ] Identify compliance requirements

### 1.2 Infrastructure Planning
- [ ] Verify Kubernetes 1.16+ (recommend 1.24+)
- [ ] Plan namespace structure
- [ ] Document cluster topology
- [ ] Identify secret access patterns
- [ ] Plan RBAC policies

### 1.3 Team Preparation
- [ ] Train team on Sealed Secrets concepts
- [ ] Document procedures and workflows
- [ ] Assign responsibilities (backup, rotation, emergency)
- [ ] Establish communication channels
- [ ] Create runbooks for common operations

### 1.4 Deliverables
- [ ] Architecture diagram
- [ ] Secret inventory spreadsheet
- [ ] RBAC policy document
- [ ] Backup and recovery plan
- [ ] Team contact list

---

## Phase 2: Infrastructure Setup (Week 2)

### 2.1 Install Sealed Secrets Controller

```bash
# Download latest version
SEALING_SECRETS_VERSION=v0.24.5
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/${SEALING_SECRETS_VERSION}/controller.yaml

# Verify installation
kubectl rollout status deployment/sealed-secrets-controller -n kube-system
kubectl get pods -n kube-system -l name=sealed-secrets-controller
```

### 2.2 Extract and Backup Keys

```bash
# Fetch public certificate (safe to commit)
kubeseal --fetch-cert > k8s/sealed-secrets/keys/public-key.pem

# Backup private key (ENCRYPTED, NOT committed)
kubectl get secret -n kube-system sealed-secrets-key -o yaml | \
    openssl enc -aes-256-cbc -salt -out /secure/location/sealed-secrets-key-backup.yaml.enc

# Store safely
git add k8s/sealed-secrets/keys/public-key.pem
git commit -m "feat: Add sealed secrets public certificate"
```

### 2.3 Setup Monitoring

```bash
# Install Prometheus monitoring for controller
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: sealed-secrets-controller
  namespace: kube-system
spec:
  selector:
    matchLabels:
      name: sealed-secrets-controller
  endpoints:
  - port: metrics
    interval: 30s
EOF

# Create alerts
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: sealed-secrets-alerts
  namespace: kube-system
spec:
  groups:
  - name: sealed-secrets
    rules:
    - alert: SealedSecretsControllerDown
      expr: up{job="sealed-secrets-controller"} == 0
      for: 5m
      annotations:
        summary: "Sealed Secrets controller is down"

    - alert: SealedSecretsUnsealFailure
      expr: increase(sealed_secrets_unsealing_errors_total[5m]) > 0
      annotations:
        summary: "Sealed Secrets unsealing failures detected"
EOF
```

### 2.4 Deliverables
- [ ] Controller deployed and verified
- [ ] Public key committed to repository
- [ ] Private key backed up and secured
- [ ] Monitoring configured
- [ ] Team can verify controller health

---

## Phase 3: Secret Migration (Weeks 3-4)

### 3.1 Create Sealed Secret Templates

Start with database secrets (most critical):

```bash
# Create template for PostgreSQL
cat > /tmp/postgres-template.yaml <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: postgres-credentials
  namespace: production
type: Opaque
stringData:
  url: "postgresql://user:password@host:5432/db"
  host: "postgres.prod.svc"
  port: "5432"
  user: "dbuser"
  password: "REPLACE_ME"
  database: "appdb"
EOF

# Seal it
kubeseal -f /tmp/postgres-template.yaml -w k8s/namespaces/production/secrets/postgres-credentials.yaml

# Commit
git add k8s/namespaces/production/secrets/postgres-credentials.yaml
git commit -m "feat: Add sealed PostgreSQL credentials"
```

### 3.2 Migrate Secrets by Category

**Week 3: Database Secrets**
- [ ] PostgreSQL credentials
- [ ] MySQL credentials
- [ ] MongoDB credentials

**Week 4: Application Secrets**
- [ ] API keys
- [ ] OAuth credentials
- [ ] JWT signing keys
- [ ] Service tokens

### 3.3 Validation Before Deployment

```bash
# Test sealing worked
kubectl apply -f k8s/namespaces/production/secrets/postgres-credentials.yaml --dry-run=client

# Verify unsealing
kubectl apply -f k8s/namespaces/production/secrets/postgres-credentials.yaml
sleep 5
kubectl get secret postgres-credentials -n production -o yaml | head -20

# Check all keys present
kubectl get secret postgres-credentials -n production -o jsonpath='{.data}' | jq 'keys'
```

### 3.4 Deliverables
- [ ] All secrets converted to SealedSecrets
- [ ] Sealed secrets committed to repository
- [ ] Unsealing verified in test namespace
- [ ] Documentation updated with secret locations

---

## Phase 4: Deployment Integration (Week 5)

### 4.1 Update Deployments

Reference secrets in Deployments:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
  namespace: production
spec:
  template:
    spec:
      containers:
      - name: api
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: postgres-credentials
              key: url
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: api-secrets
              key: api-key
```

### 4.2 Update StatefulSets

For databases and caches:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: production
spec:
  template:
    spec:
      containers:
      - name: postgres
        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-credentials
              key: password
```

### 4.3 Testing Strategy

**Staging Validation (Week 5)**
1. Deploy to staging cluster
2. Verify all services start correctly
3. Test database connections
4. Verify cache operations
5. Check authentication flows
6. Monitor logs for errors

**Production Rollout (Week 6)**
1. Use canary deployment (10% → 25% → 50% → 100%)
2. Monitor error rates during rollout
3. Have rollback plan ready
4. Verify connectivity after each stage
5. Check logs for issues

### 4.4 Deliverables
- [ ] All Deployments/StatefulSets updated
- [ ] Staging deployment verified
- [ ] Rollout plan documented
- [ ] Monitoring dashboards created

---

## Phase 5: RBAC and Access Control (Week 5-6)

### 5.1 Configure RBAC

Restrict who can view sealed vs unsealed secrets:

```yaml
# Allow viewing SealedSecrets (encrypted)
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: sealedsecrets-viewer
rules:
- apiGroups: ["bitnami.com"]
  resources: ["sealedsecrets"]
  verbs: ["get", "list", "watch"]

---
# Restrict unsealed secret access
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: secret-reader
  namespace: production
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get"]
  # Only specific secrets
  resourceNames: ["postgres-credentials", "api-secrets"]
```

### 5.2 Service Account Policies

```yaml
# Each application gets its own service account
apiVersion: v1
kind: ServiceAccount
metadata:
  name: api-service
  namespace: production

---
# Application can only read its own secrets
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: api-service-secrets
  namespace: production
rules:
- apiGroups: [""]
  resources: ["secrets"]
  resourceNames: ["api-secrets", "postgres-credentials"]
  verbs: ["get"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: api-service-secrets
  namespace: production
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: api-service-secrets
subjects:
- kind: ServiceAccount
  name: api-service
```

### 5.3 Audit Logging

```yaml
# Configure Kubernetes audit logging for secret access
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
- level: RequestResponse
  omitStages: ["RequestReceived"]
  resources:
  - group: "bitnami.com"
    resources: ["sealedsecrets"]
  - group: ""
    resources: ["secrets"]
  namespaces: ["production", "staging"]
```

### 5.4 Deliverables
- [ ] RBAC policies configured
- [ ] Service accounts created
- [ ] Audit logging enabled
- [ ] Access verified with test queries

---

## Phase 6: Secret Rotation Setup (Week 6)

### 6.1 Implement Rotation Procedures

Create rotation runbooks for each secret type:

```bash
# Database rotation (quarterly)
./k8s/sealed-secrets/examples/04-secret-rotation-script.sh database production

# API key rotation (monthly)
./k8s/sealed-secrets/examples/04-secret-rotation-script.sh api-keys production

# JWT key rotation (bi-annually)
./k8s/sealed-secrets/examples/04-secret-rotation-script.sh jwt production
```

### 6.2 Automate Rotation with CronJobs

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: api-key-rotation
  namespace: production
spec:
  schedule: "0 2 1 * *"  # 1st of each month
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: secret-rotator
          containers:
          - name: rotate
            image: bitnami/kubectl:latest
            command: ["/scripts/rotate-api-keys.sh"]
            volumeMounts:
            - name: scripts
              mountPath: /scripts
          volumes:
          - name: scripts
            configMap:
              name: rotation-scripts
          restartPolicy: OnFailure
```

### 6.3 Set Up Reminders

```bash
# Create calendar entries
# Every quarter: Database credentials
# Every month: API keys
# Bi-annually: JWT signing keys

# Or use monitoring/alerting system
# Create events in your incident management system
```

### 6.4 Deliverables
- [ ] Rotation procedures documented
- [ ] Rotation scripts created and tested
- [ ] CronJobs configured
- [ ] Reminders/calendar entries set
- [ ] Team trained on rotation procedures

---

## Phase 7: Backup and Disaster Recovery (Week 7)

### 7.1 Implement Automated Backups

Deploy backup CronJob (see backup-recovery-guide.md):

```bash
# Install backup script
kubectl apply -f k8s/sealed-secrets/examples/05-backup-cronjob.yaml

# Verify backups running
kubectl logs -n kube-system -l job-name=sealed-secrets-backup --tail=20
```

### 7.2 Test Recovery Procedures

```bash
# Monthly recovery test
./k8s/sealed-secrets/examples/05-test-recovery.sh

# Document results
# Identify any gaps or improvements needed
```

### 7.3 Off-Site Backup Storage

- [ ] S3 with KMS encryption
- [ ] Google Cloud Storage
- [ ] Azure Blob Storage
- [ ] Or encrypted external drive

### 7.4 Document Recovery Procedures

- [ ] Full cluster recovery
- [ ] Single secret recovery
- [ ] Lost key recovery (emergency procedure)
- [ ] Partial failure recovery

### 7.5 Deliverables
- [ ] Automated backups running
- [ ] Off-site backups configured
- [ ] Recovery procedures documented and tested
- [ ] Team trained on emergency procedures

---

## Phase 8: Production Deployment (Week 8)

### 8.1 Pre-Production Checklist

- [ ] All secrets migrated and tested
- [ ] Deployments updated and verified
- [ ] RBAC policies enforced
- [ ] Monitoring and alerting configured
- [ ] Backup and recovery tested
- [ ] Team trained and ready
- [ ] Rollback plan documented

### 8.2 Deployment Steps

**Day 1-2: Blue-Green Deployment**
1. Deploy new infrastructure (blue)
2. Run all tests and validations
3. Switch traffic (green → blue)
4. Monitor for 24 hours
5. Keep old infrastructure ready for rollback

**Day 3-7: Cutover Week**
1. Decommission old infrastructure
2. Verify no rollback needed
3. Document lessons learned
4. Update runbooks based on experience
5. Schedule follow-up reviews

### 8.3 Monitoring and Validation

```bash
# Check controller health
kubectl get deployment sealed-secrets-controller -n kube-system

# Monitor unsealing success
kubectl logs -n kube-system -l name=sealed-secrets-controller | grep -i unseal

# Verify all pods have secrets
kubectl get pods -A -o jsonpath='{.items[*].spec.containers[*].env[*].valueFrom.secretKeyRef}' | jq . | grep -i secret

# Check RBAC enforcement
kubectl auth can-i get secrets -n production --as=system:serviceaccount:production:api-service
```

### 8.4 Communication

- [ ] Notify ops team: "Sealed Secrets now in production"
- [ ] Update documentation in wiki/confluence
- [ ] Send training summary to team
- [ ] Schedule follow-up training
- [ ] Publish success metrics

### 8.5 Deliverables
- [ ] Successful production deployment
- [ ] All services running with sealed secrets
- [ ] Monitoring and alerting active
- [ ] Team documentation updated
- [ ] Post-implementation review completed

---

## Post-Implementation (Ongoing)

### Monthly Tasks
- [ ] Review secret rotation schedule
- [ ] Verify backups completed
- [ ] Check monitoring alerts
- [ ] Update certificate cache if changed

### Quarterly Tasks
- [ ] Rotate database credentials
- [ ] Review RBAC policies
- [ ] Audit secret access logs
- [ ] Perform recovery test

### Bi-Annually
- [ ] Rotate JWT signing keys
- [ ] Review and update documentation
- [ ] Team training refresher
- [ ] Upgrade Sealed Secrets controller

### Annually
- [ ] Rotate encryption keys (if needed)
- [ ] Comprehensive disaster recovery drill
- [ ] Review and update security policies
- [ ] Performance review of implementation

---

## Success Criteria

- [ ] All secrets encrypted at rest in Git
- [ ] Zero unencrypted secrets in repositories
- [ ] Automated backup and recovery working
- [ ] RBAC properly restricting secret access
- [ ] Secret rotation procedures followed
- [ ] Team confident with day-to-day operations
- [ ] Monitoring and alerting functional
- [ ] Documentation complete and accessible

---

## Common Implementation Challenges

### Challenge 1: Legacy Applications
**Solution**: Create wrapper scripts that unseal secrets on startup for applications that can't read from Kubernetes

### Challenge 2: Multiple Clusters
**Solution**: Use separate sealing keys per cluster, seal secrets specific to each

### Challenge 3: Team Resistance
**Solution**: Start with non-critical secrets, demonstrate value, then migrate others

### Challenge 4: Performance Concerns
**Solution**: Controller is minimal overhead; benchmark and prove it

### Challenge 5: Emergency Access
**Solution**: Document and practice emergency procedures; have encrypted backups accessible

---

## Timeline Summary

| Phase | Duration | Status |
|---|---|---|
| 1. Planning | Week 1 | Planning |
| 2. Infrastructure | Week 2 | In Progress |
| 3. Migration | Weeks 3-4 | In Progress |
| 4. Integration | Week 5 | In Progress |
| 5. RBAC Setup | Week 5-6 | In Progress |
| 6. Rotation | Week 6 | In Progress |
| 7. Backup/Recovery | Week 7 | In Progress |
| 8. Production | Week 8 | In Progress |
| **Total** | **8 weeks** | |

---

## Resource Requirements

### Compute
- Controller: 50m CPU, 64Mi memory (requests), 500m/256Mi (limits)
- Backup jobs: Minimal, scheduled off-peak

### Storage
- Backups: ~10-50MB per cluster per day
- Logs: Standard Kubernetes logging

### Personnel
- 1 infrastructure engineer (full-time for 8 weeks)
- 0.5 security engineer (review policies)
- 1 team lead (coordination and documentation)

### Tools
- kubeseal CLI
- kubectl
- openssl
- Backup storage solution
- Monitoring/alerting system

---

## Sign-Off

- [ ] Project Lead Approval
- [ ] Security Team Approval
- [ ] Operations Team Approval
- [ ] Development Team Approval

---

## References

- [Sealed Secrets Best Practices](./SEALED_SECRETS_BEST_PRACTICES.md)
- [Quick Reference Guide](./SEALED_SECRETS_QUICK_REFERENCE.md)
- [Backup and Recovery Guide](../k8s/sealed-secrets/examples/05-backup-recovery-guide.md)
- [Official Sealed Secrets Docs](https://github.com/bitnami-labs/sealed-secrets)
- [Kubernetes Secret Security](https://kubernetes.io/docs/concepts/configuration/secret/)

