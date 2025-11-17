# Sealed Secrets Documentation Index

Complete reference guide for implementing Bitnami Sealed Secrets in production Kubernetes environments.

## Quick Navigation

### For First-Time Users
1. Start with [Quick Reference Guide](./SEALED_SECRETS_QUICK_REFERENCE.md) - 15 minute read
2. Review [Best Practices](./SEALED_SECRETS_BEST_PRACTICES.md) - 45 minute read
3. Check example manifests in `k8s/sealed-secrets/examples/`

### For Implementation Teams
1. Follow the [Implementation Roadmap](./SEALED_SECRETS_IMPLEMENTATION_ROADMAP.md) - 8 week plan
2. Use example manifests and scripts as templates
3. Refer to best practices for design decisions

### For Operators
1. Use [Quick Reference](./SEALED_SECRETS_QUICK_REFERENCE.md) for daily tasks
2. Refer to backup/recovery guide for disaster scenarios
3. Review rotation scripts for secret lifecycle management

### For Security/Compliance Teams
1. Review security considerations in [Best Practices](./SEALED_SECRETS_BEST_PRACTICES.md#security-considerations-summary)
2. Check backup and encryption procedures
3. Review RBAC and audit logging sections

---

## Document Overview

### 1. SEALED_SECRETS_BEST_PRACTICES.md
**Purpose**: Comprehensive reference for all aspects of Sealed Secrets implementation
**Length**: ~150 pages (detailed)
**Best For**: Deep understanding and reference material

**Sections**:
- SealedSecret manifest structure
- Multi-service secret organization
- Database credential management patterns
- Redis secret management
- JWT and signing key management
- Secret rotation strategies
- Backup and recovery procedures
- Common pitfalls and solutions
- kubeseal command reference
- Integration patterns with K8s resources
- Security considerations
- FAQs

### 2. SEALED_SECRETS_QUICK_REFERENCE.md
**Purpose**: Quick lookup guide for day-to-day operations
**Length**: ~30 pages (concise)
**Best For**: Quick answers and common tasks

**Sections**:
- 30-second setup
- Step-by-step secret creation
- Common tasks (seal, rotate, update)
- Troubleshooting guide
- Template snippets
- Backup/restore one-liners
- Common mistakes
- Useful commands
- Emergency procedures

### 3. SEALED_SECRETS_IMPLEMENTATION_ROADMAP.md
**Purpose**: Structured 8-week implementation plan
**Length**: ~40 pages (actionable)
**Best For**: Planning and executing a production rollout

**Phases**:
1. Planning and preparation
2. Infrastructure setup
3. Secret migration
4. Deployment integration
5. RBAC and access control
6. Secret rotation setup
7. Backup and disaster recovery
8. Production deployment

**Includes**: Checklists, timelines, resource requirements

---

## Example Manifests

Located in: `k8s/sealed-secrets/examples/`

### 01-database-secret.yaml
Example: PostgreSQL database credentials
- Plain secret template
- Sealed secret format
- Usage in Deployment

**Use Cases**:
- PostgreSQL
- MySQL
- MongoDB

### 02-redis-secret.yaml
Example: Redis connection secrets
- Redis standalone
- Redis cluster
- Redis Sentinel

**Includes**:
- Plain templates
- Sealed secret format
- Deployment and StatefulSet usage

### 03-jwt-secret.yaml
Example: JWT and signing key secrets
- Symmetric (HS256) approach
- Asymmetric (RS256) approach
- OAuth/OIDC integration
- Key rotation patterns

**Covers**:
- Auth service (signing)
- API services (verification)
- Multiple public keys for rotation

### 04-secret-rotation-script.sh
Executable script for automated secret rotation

**Features**:
- Database credential rotation
- API key rotation
- JWT key generation
- Zero-downtime rolling restart
- Automated backup before rotation

**Usage**:
```bash
./04-secret-rotation-script.sh database production
./04-secret-rotation-script.sh api-keys staging
./04-secret-rotation-script.sh jwt production
```

### 05-backup-recovery-guide.md
Comprehensive backup and disaster recovery procedures

**Includes**:
- Automated backup setup (CronJob)
- Private key encryption
- Public certificate backup
- Off-site backup to S3/GCS
- Recovery procedures for various scenarios
- Disaster recovery runbook
- Monthly recovery testing

---

## Controller Configuration

Location: `k8s/sealed-secrets/00-controller.yaml`

**Includes**:
- Sealed Secrets CustomResourceDefinition
- ServiceAccount with proper RBAC
- Deployment with security best practices
- Service for internal communication
- Health checks and resource limits

**Key Features**:
- Secure by default (non-root, read-only filesystem)
- Resource limits configured
- Automatic certificate renewal (30 days)
- Metrics endpoint on port 8081

---

## Folder Structure

```
k8s/
├── sealed-secrets/
│   ├── 00-controller.yaml              # Deploy this first
│   ├── keys/
│   │   ├── public-key.pem              # Safe to commit
│   │   └── private-key-backup.yaml.enc # Encrypted, not committed
│   └── examples/
│       ├── 01-database-secret.yaml
│       ├── 02-redis-secret.yaml
│       ├── 03-jwt-secret.yaml
│       ├── 04-secret-rotation-script.sh
│       └── 05-backup-recovery-guide.md

docs/
├── SEALED_SECRETS_BEST_PRACTICES.md
├── SEALED_SECRETS_QUICK_REFERENCE.md
├── SEALED_SECRETS_IMPLEMENTATION_ROADMAP.md
└── SEALED_SECRETS_INDEX.md (this file)
```

---

## Implementation Checklist

### Pre-Implementation
- [ ] Read Quick Reference Guide
- [ ] Review Best Practices
- [ ] Understand your current secret management
- [ ] Identify all secrets to migrate
- [ ] Get team buy-in

### Setup Phase
- [ ] Install Sealed Secrets controller
- [ ] Backup and secure private key
- [ ] Save public certificate to repo
- [ ] Setup monitoring and alerting
- [ ] Configure RBAC policies

### Migration Phase
- [ ] Seal database secrets
- [ ] Seal API credentials
- [ ] Seal JWT/signing keys
- [ ] Test unsealing in non-prod
- [ ] Update deployment manifests

### Rotation Phase
- [ ] Document rotation procedures
- [ ] Create rotation scripts
- [ ] Schedule rotation reminders
- [ ] Test rotation in staging
- [ ] Train team on procedures

### Backup Phase
- [ ] Setup automated backups
- [ ] Configure off-site storage
- [ ] Test recovery procedures
- [ ] Document emergency procedures
- [ ] Schedule recovery drills

### Production Phase
- [ ] Final validation checklist
- [ ] Deploy to production
- [ ] Monitor for issues
- [ ] Verify all services healthy
- [ ] Decommission old system

---

## Common Use Cases

### Use Case 1: Setup from Scratch (New Cluster)
**Time**: 30-40 minutes
1. Deploy controller (00-controller.yaml)
2. Create sealed secrets (use examples)
3. Update deployments to reference secrets
4. Setup backup/rotation

### Use Case 2: Migrate Existing Secrets
**Time**: Varies by secret count
1. Export current secrets as YAML
2. Seal each secret type
3. Update deployments gradually
4. Verify before cutting over

### Use Case 3: Rotate Credentials
**Time**: 15-30 minutes per secret
1. Generate new credential
2. Create and seal new secret
3. Apply to cluster
4. Rolling restart deployments
5. Update underlying system

### Use Case 4: Disaster Recovery
**Time**: 60-100 minutes for full cluster recovery
1. Deploy new cluster
2. Restore encryption keys
3. Apply sealed secret manifests
4. Verify unsealing works
5. Deploy applications

---

## Security Principles

### Encryption
- AES-256 in GCM mode
- 4096-bit RSA keys (minimum 2048-bit)
- Automatic certificate rotation every 30 days

### Access Control
- RBAC for unsealing permissions
- Service accounts per application
- Resource namespacing
- Audit logging of secret access

### Secret Handling
- Secrets encrypted at rest in Git
- Only cluster can decrypt
- Support for key rotation
- No shared secrets between clusters

### Backup Security
- Private keys encrypted with strong passwords
- Off-site storage with encryption
- Regular recovery testing
- Access restricted to ops team

---

## Troubleshooting Quick Links

| Issue | Solution |
|---|---|
| Secret won't unseal | Check controller logs, verify encryption key |
| Can't seal offline | Update public certificate, verify cert path |
| Controller not starting | Check service account RBAC, verify secret quota |
| Unsealing takes too long | Monitor controller resources, check metrics |
| Lost private key | Follow emergency recovery procedure |
| Secrets leaked to logs | Configure log filtering/masking |

See [Troubleshooting section](./SEALED_SECRETS_QUICK_REFERENCE.md#troubleshooting) for detailed steps.

---

## Key Concepts

### Scope Types
- **Strict** (default): Secret tied to specific name and namespace - most secure
- **Namespace-wide**: Can be renamed within namespace - moderate flexibility
- **Cluster-wide**: No restrictions - least secure, use rarely

### Secret Components
- **SealedSecret**: Encrypted custom resource (safe in Git)
- **Secret**: Decrypted Kubernetes secret (in cluster only)
- **encryptedData**: Sealed values
- **template**: Template for resulting Secret

### Rotation Strategy
- **Application secrets**: Rotate monthly
- **Database credentials**: Rotate quarterly
- **JWT/signing keys**: Rotate bi-annually
- **Encryption keys**: Rotate on compromise

---

## Best Practices Summary

### General Principles
1. **Encrypt at rest** - Use Sealed Secrets for all sensitive data
2. **Rotate regularly** - Follow rotation schedule
3. **Backup securely** - Encrypted backups in multiple locations
4. **Restrict access** - Use strict RBAC
5. **Audit everything** - Enable audit logging
6. **Test recovery** - Monthly disaster recovery drills
7. **Document procedures** - Keep runbooks updated
8. **Train team** - Ensure everyone knows procedures

### Do's
- DO seal before committing to Git
- DO use strict scope by default
- DO rotate on schedule
- DO backup private keys securely
- DO test recovery procedures
- DO use RBAC to restrict access
- DO monitor controller health
- DO document your setup

### Don'ts
- DON'T commit unencrypted secrets to Git
- DON'T use cluster-wide scope for sensitive secrets
- DON'T forget to backup private key
- DON'T skip security updates
- DON'T log secret values
- DON'T use same key for multiple clusters
- DON'T ignore backup failures
- DON'T skip recovery testing

---

## Support and Resources

### Official Resources
- [GitHub Repository](https://github.com/bitnami-labs/sealed-secrets)
- [Official Documentation](https://sealed-secrets.netlify.app/)
- [Release Notes](https://github.com/bitnami-labs/sealed-secrets/releases)

### Related Technologies
- [Kubernetes Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- [HashiCorp Vault](https://www.vaultproject.io/) (alternative approach)
- [External Secrets Operator](https://external-secrets.io/) (for external secret sources)

### Learning Resources
- Sealed Secrets Blog Posts
- Kubernetes Security Course
- Container Security Best Practices
- GitOps Workflows with ArgoCD/Flux

---

## Version Information

This documentation covers:
- **Sealed Secrets**: v0.24.5 and compatible versions
- **Kubernetes**: 1.16+ (tested on 1.24+)
- **kubeseal CLI**: v0.24.5 and compatible versions

---

## Feedback and Updates

To contribute improvements to this documentation:
1. Review current content
2. Identify gaps or improvements
3. Test procedures in your environment
4. Submit feedback with specific examples
5. Help keep documentation accurate

---

## Document Revision History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2024-11-17 | Initial comprehensive documentation |

---

## Quick Start Commands

```bash
# Install kubeseal
brew install kubeseal

# Fetch public certificate
kubeseal --fetch-cert > public-key.pem

# Create and seal a secret
echo -n "mysecret" | \
  kubectl create secret generic my-secret \
  --from-literal=key=value \
  --namespace=production \
  --dry-run=client -o yaml | \
  kubeseal -f - | \
  kubectl apply -f -

# View all sealed secrets
kubectl get sealedsecrets -A

# Rotate a secret
./k8s/sealed-secrets/examples/04-secret-rotation-script.sh database production

# Test recovery
./k8s/sealed-secrets/examples/05-test-recovery.sh
```

---

## Contact and Questions

For implementation questions or issues:
1. Check [Quick Reference](./SEALED_SECRETS_QUICK_REFERENCE.md) for common tasks
2. Review [Best Practices](./SEALED_SECRETS_BEST_PRACTICES.md) for design guidance
3. Consult example manifests in `k8s/sealed-secrets/examples/`
4. Check [official documentation](https://github.com/bitnami-labs/sealed-secrets)
5. Contact your infrastructure team for operational questions

---

**Last Updated**: November 17, 2024
**Status**: Production Ready
**Maintained By**: Infrastructure Team

