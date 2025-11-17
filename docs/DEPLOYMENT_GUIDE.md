# LLM-Policy-Engine Deployment Guide

## Overview

This guide covers deployment strategies, configurations, and operational best practices for the LLM-Policy-Engine across different environments and use cases.

## Table of Contents

1. [Deployment Models](#deployment-models)
2. [Infrastructure Requirements](#infrastructure-requirements)
3. [Configuration](#configuration)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Docker Deployment](#docker-deployment)
6. [Cloud Deployments](#cloud-deployments)
7. [Monitoring & Observability](#monitoring--observability)
8. [High Availability](#high-availability)
9. [Security Best Practices](#security-best-practices)
10. [Performance Tuning](#performance-tuning)
11. [Troubleshooting](#troubleshooting)

---

## Deployment Models

### Model 1: Embedded Library

**Use Case**: Single application, lowest latency required

**Pros**:
- Ultra-low latency (<100μs)
- No network overhead
- Simplified deployment

**Cons**:
- Policy updates require application restart
- No policy sharing across applications
- Higher memory usage per instance

**Implementation**:

```rust
// Cargo.toml
[dependencies]
llm-policy-engine = "0.1.0"

// main.rs
use llm_policy_engine::{PolicyEngine, EvaluationContext};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let engine = PolicyEngine::builder()
        .with_policy_file("./policies/production.yaml")
        .with_cache_capacity(10000)
        .build()
        .await?;

    // Use engine for evaluations
    Ok(())
}
```

**Resource Requirements**:
- Memory: 100-200MB per instance
- CPU: 0.1 core (idle), 1-2 cores (peak)

---

### Model 2: Standalone Daemon

**Use Case**: Multiple applications sharing policies, centralized management

**Pros**:
- Centralized policy management
- Hot reload without app restarts
- Efficient resource usage

**Cons**:
- Network latency (~1ms local)
- Single point of failure (without HA)
- Additional infrastructure

**Implementation**:

```bash
# Start daemon
policy-engine daemon \
  --config /etc/policy-engine/config.yaml \
  --listen 0.0.0.0:50051
```

**Resource Requirements**:
- Memory: 256-512MB
- CPU: 1-2 cores
- Network: Low latency to clients

---

### Model 3: Sidecar Container

**Use Case**: Kubernetes deployments, per-pod policy enforcement

**Pros**:
- Isolation per application
- No shared state between apps
- Easy scaling with pods

**Cons**:
- Higher resource usage
- More complex deployment
- Inter-container communication overhead

**Implementation**:

```yaml
# See Kubernetes section below
```

**Resource Requirements (per sidecar)**:
- Memory: 256-512MB
- CPU: 0.5-1 core

---

### Model 4: Edge Deployment

**Use Case**: Distributed systems, offline capability required

**Pros**:
- Low latency at edge
- Offline operation
- Reduced central load

**Cons**:
- Policy sync complexity
- Potential inconsistency
- Higher total resource usage

**Resource Requirements (per edge)**:
- Memory: 128-256MB
- CPU: 0.25-0.5 core
- Storage: 100MB for policies

---

## Infrastructure Requirements

### Minimum Requirements

| Component | Minimum | Recommended | High Performance |
|-----------|---------|-------------|------------------|
| CPU | 1 core | 2 cores | 4+ cores |
| Memory | 512MB | 1GB | 2GB+ |
| Storage | 100MB | 1GB | 10GB+ (logs) |
| Network | 100Mbps | 1Gbps | 10Gbps |

### Scaling Guidelines

| Metric | Small | Medium | Large | Enterprise |
|--------|-------|--------|-------|------------|
| Requests/sec | <1,000 | <10,000 | <100,000 | 100,000+ |
| Instances | 1-2 | 3-5 | 10-20 | 20+ |
| Total Memory | 1GB | 5GB | 20GB | 50GB+ |
| Total CPU | 2 cores | 10 cores | 40 cores | 100+ cores |

---

## Configuration

### Daemon Configuration File

```yaml
# /etc/policy-engine/config.yaml

# Server configuration
server:
  # Listening address
  listen_address: "0.0.0.0:50051"

  # gRPC settings
  grpc:
    max_concurrent_streams: 1000
    keepalive_interval_seconds: 30
    keepalive_timeout_seconds: 10
    max_connection_age_seconds: 3600

  # HTTP settings (for REST API)
  http:
    enabled: true
    listen_address: "0.0.0.0:8080"
    cors_enabled: true
    cors_allowed_origins: ["*"]

  # TLS configuration
  tls:
    enabled: true
    cert_file: "/etc/policy-engine/tls/server.crt"
    key_file: "/etc/policy-engine/tls/server.key"
    client_auth: false  # mTLS

  # Request limits
  limits:
    max_request_size_mb: 10
    request_timeout_seconds: 5
    max_connections: 10000

# Policy registry configuration
registry:
  # Registry URL
  url: "https://policy-registry.example.com"

  # Namespace to sync
  namespace: "production"

  # Sync settings
  sync_interval_seconds: 60
  initial_sync_timeout_seconds: 300

  # Authentication
  auth:
    type: "token"  # or "mtls", "oauth2"
    token_file: "/var/run/secrets/registry-token"

  # Fallback to local policies if registry unavailable
  fallback_to_local: true
  local_policy_dir: "/var/lib/policy-engine/policies"

# Cache configuration
cache:
  # Decision cache
  decision_cache:
    enabled: true
    capacity: 10000
    ttl_seconds: 300
    eviction_policy: "lru"  # or "lfu", "ttl"

  # Policy compilation cache
  compilation_cache:
    enabled: true
    capacity: 100

  # Distributed cache (Redis)
  distributed:
    enabled: false
    redis_url: "redis://localhost:6379"
    key_prefix: "policy-engine:"
    ttl_seconds: 600

# Runtime configuration
runtime:
  # Thread pool
  worker_threads: 8
  blocking_threads: 4

  # Sandbox limits
  sandbox:
    max_memory_mb: 128
    max_execution_ms: 100
    max_stack_size_mb: 1

  # Evaluation settings
  evaluation:
    parallel_evaluation: true
    max_parallel_policies: 10

# Integration configurations
integrations:
  # LLM-Shield
  llm_shield:
    enabled: true
    url: "http://llm-shield:8080"
    timeout_ms: 500
    retry_attempts: 2

  # LLM-CostOps
  llm_costops:
    enabled: true
    url: "http://llm-costops:8080"
    timeout_ms: 500
    retry_attempts: 2

  # LLM-Governance
  llm_governance:
    enabled: true
    url: "http://llm-governance:8080"
    timeout_ms: 1000
    async_logging: true  # Don't block on audit logs

  # LLM-Edge-Agent
  llm_edge_agent:
    enabled: false
    sync_interval_seconds: 300

# Logging configuration
logging:
  # Log level: trace, debug, info, warn, error
  level: "info"

  # Log format: json, plain
  format: "json"

  # Output: stdout, stderr, file
  output: "stdout"

  # File logging
  file:
    path: "/var/log/policy-engine/engine.log"
    max_size_mb: 100
    max_files: 10
    rotate: true

  # Structured logging fields
  include_trace_id: true
  include_user_id: true
  include_metadata: true

# Metrics configuration
metrics:
  enabled: true

  # Prometheus endpoint
  prometheus:
    enabled: true
    port: 9090
    path: "/metrics"

  # OpenTelemetry
  opentelemetry:
    enabled: false
    endpoint: "http://otel-collector:4317"
    service_name: "policy-engine"

  # StatsD
  statsd:
    enabled: false
    host: "localhost"
    port: 8125
    prefix: "policy_engine"

# Tracing configuration
tracing:
  enabled: true

  # OpenTelemetry
  opentelemetry:
    enabled: true
    endpoint: "http://jaeger:4317"
    service_name: "policy-engine"
    sample_rate: 0.1  # 10% sampling

  # Jaeger
  jaeger:
    enabled: false
    agent_host: "localhost"
    agent_port: 6831

# Audit configuration
audit:
  enabled: true

  # Audit all decisions
  log_all_decisions: true

  # Audit denied requests only
  log_denied_only: false

  # Output
  output: "governance"  # or "file", "stdout"

  # File audit
  file:
    path: "/var/log/policy-engine/audit.log"
    max_size_mb: 500
    max_files: 20

# Feature flags
features:
  # Enable experimental features
  experimental_wasm: false
  experimental_distributed_tracing: true

  # Performance features
  zero_copy_serialization: true
  adaptive_caching: true

# Development/Debug settings
debug:
  # Enable debug mode
  enabled: false

  # Profile CPU
  cpu_profile: false
  cpu_profile_path: "/tmp/policy-engine-cpu.prof"

  # Profile memory
  memory_profile: false
  memory_profile_path: "/tmp/policy-engine-mem.prof"

  # Pprof endpoint
  pprof_enabled: false
  pprof_port: 6060
```

### Environment Variables

Override configuration with environment variables:

```bash
# Server
POLICY_ENGINE_LISTEN_ADDRESS=0.0.0.0:50051
POLICY_ENGINE_HTTP_ENABLED=true
POLICY_ENGINE_HTTP_PORT=8080

# Registry
POLICY_ENGINE_REGISTRY_URL=https://registry.example.com
POLICY_ENGINE_REGISTRY_NAMESPACE=production
POLICY_ENGINE_REGISTRY_AUTH_TOKEN=secret-token

# Cache
POLICY_ENGINE_CACHE_CAPACITY=10000
POLICY_ENGINE_CACHE_TTL_SECONDS=300

# Integrations
POLICY_ENGINE_SHIELD_URL=http://llm-shield:8080
POLICY_ENGINE_COSTOPS_URL=http://llm-costops:8080
POLICY_ENGINE_GOVERNANCE_URL=http://llm-governance:8080

# Logging
POLICY_ENGINE_LOG_LEVEL=info
POLICY_ENGINE_LOG_FORMAT=json

# Metrics
POLICY_ENGINE_METRICS_ENABLED=true
POLICY_ENGINE_METRICS_PORT=9090
```

---

## Kubernetes Deployment

### Complete Deployment Manifest

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: policy-system

---
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: policy-engine-config
  namespace: policy-system
data:
  config.yaml: |
    server:
      listen_address: "0.0.0.0:50051"
      http:
        enabled: true
        listen_address: "0.0.0.0:8080"
    registry:
      url: "http://policy-registry.policy-system.svc.cluster.local:8080"
      namespace: "production"
      sync_interval_seconds: 60
    cache:
      decision_cache:
        capacity: 10000
        ttl_seconds: 300
    logging:
      level: "info"
      format: "json"
    metrics:
      enabled: true
      prometheus:
        enabled: true
        port: 9090

---
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: policy-engine-secrets
  namespace: policy-system
type: Opaque
stringData:
  registry-token: "your-registry-token-here"
  tls-cert: |
    -----BEGIN CERTIFICATE-----
    ...
    -----END CERTIFICATE-----
  tls-key: |
    -----BEGIN PRIVATE KEY-----
    ...
    -----END PRIVATE KEY-----

---
# deployment.yaml (Standalone Service)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: policy-engine
  namespace: policy-system
  labels:
    app: policy-engine
    version: v1
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: policy-engine
  template:
    metadata:
      labels:
        app: policy-engine
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9090"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: policy-engine
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000

      # Init container to validate config
      initContainers:
        - name: config-validator
          image: llm-policy-engine:latest
          command: ["/bin/policy-engine"]
          args: ["validate-config", "/etc/policy-engine/config.yaml"]
          volumeMounts:
            - name: config
              mountPath: /etc/policy-engine
              readOnly: true

      containers:
        - name: policy-engine
          image: llm-policy-engine:latest
          imagePullPolicy: IfNotPresent

          command: ["/bin/policy-engine"]
          args:
            - "daemon"
            - "--config"
            - "/etc/policy-engine/config.yaml"

          ports:
            - name: grpc
              containerPort: 50051
              protocol: TCP
            - name: http
              containerPort: 8080
              protocol: TCP
            - name: metrics
              containerPort: 9090
              protocol: TCP

          env:
            - name: RUST_LOG
              value: "info"
            - name: POLICY_ENGINE_REGISTRY_AUTH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: policy-engine-secrets
                  key: registry-token

          volumeMounts:
            - name: config
              mountPath: /etc/policy-engine
              readOnly: true
            - name: policies
              mountPath: /var/lib/policy-engine/policies
            - name: tls
              mountPath: /etc/policy-engine/tls
              readOnly: true

          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "2000m"

          livenessProbe:
            grpc:
              port: 50051
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          readinessProbe:
            grpc:
              port: 50051
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            successThreshold: 1
            failureThreshold: 3

          startupProbe:
            grpc:
              port: 50051
            initialDelaySeconds: 0
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 30

          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
            readOnlyRootFilesystem: true

      volumes:
        - name: config
          configMap:
            name: policy-engine-config
        - name: policies
          emptyDir: {}
        - name: tls
          secret:
            secretName: policy-engine-secrets
            items:
              - key: tls-cert
                path: server.crt
              - key: tls-key
                path: server.key

      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - policy-engine
                topologyKey: kubernetes.io/hostname

---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: policy-engine
  namespace: policy-system
  labels:
    app: policy-engine
spec:
  type: ClusterIP
  selector:
    app: policy-engine
  ports:
    - name: grpc
      port: 50051
      targetPort: grpc
      protocol: TCP
    - name: http
      port: 8080
      targetPort: http
      protocol: TCP
    - name: metrics
      port: 9090
      targetPort: metrics
      protocol: TCP

---
# servicemonitor.yaml (for Prometheus Operator)
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: policy-engine
  namespace: policy-system
  labels:
    app: policy-engine
spec:
  selector:
    matchLabels:
      app: policy-engine
  endpoints:
    - port: metrics
      interval: 30s
      path: /metrics

---
# hpa.yaml (Horizontal Pod Autoscaler)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: policy-engine
  namespace: policy-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: policy-engine
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
        - type: Pods
          value: 2
          periodSeconds: 30
      selectPolicy: Max

---
# pdb.yaml (Pod Disruption Budget)
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: policy-engine
  namespace: policy-system
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: policy-engine

---
# serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: policy-engine
  namespace: policy-system

---
# rbac.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: policy-engine
  namespace: policy-system
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: policy-engine
  namespace: policy-system
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: policy-engine
subjects:
  - kind: ServiceAccount
    name: policy-engine
    namespace: policy-system
```

### Sidecar Deployment Pattern

```yaml
# application-with-sidecar.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-application
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: llm-application
  template:
    metadata:
      labels:
        app: llm-application
    spec:
      containers:
        # Main application container
        - name: app
          image: my-llm-app:latest
          ports:
            - containerPort: 8080
          env:
            - name: POLICY_ENGINE_URL
              value: "http://localhost:50051"
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"

        # Policy engine sidecar
        - name: policy-engine
          image: llm-policy-engine:latest
          args:
            - "daemon"
            - "--config"
            - "/etc/policy-engine/config.yaml"
          ports:
            - name: grpc
              containerPort: 50051
            - name: http
              containerPort: 8080
            - name: metrics
              containerPort: 9090
          volumeMounts:
            - name: config
              mountPath: /etc/policy-engine
            - name: policies
              mountPath: /var/lib/policy-engine/policies
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            grpc:
              port: 50051
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            grpc:
              port: 50051
            initialDelaySeconds: 5
            periodSeconds: 5

      volumes:
        - name: config
          configMap:
            name: policy-engine-config
        - name: policies
          emptyDir: {}
```

---

## Docker Deployment

### Dockerfile

```dockerfile
# Multi-stage build for optimal image size

# Stage 1: Builder
FROM rust:1.75-slim as builder

WORKDIR /build

# Install dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

# Copy source
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY proto ./proto

# Build release binary
RUN cargo build --release --locked

# Stage 2: Runtime
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 -s /bin/bash policy-engine

# Copy binary
COPY --from=builder /build/target/release/policy-engine /bin/policy-engine

# Create directories
RUN mkdir -p /etc/policy-engine \
    /var/lib/policy-engine/policies \
    /var/log/policy-engine \
    && chown -R policy-engine:policy-engine \
        /etc/policy-engine \
        /var/lib/policy-engine \
        /var/log/policy-engine

# Switch to non-root user
USER policy-engine

# Expose ports
EXPOSE 50051 8080 9090

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/bin/policy-engine", "health", "--url", "http://localhost:8080"]

# Default command
ENTRYPOINT ["/bin/policy-engine"]
CMD ["daemon", "--config", "/etc/policy-engine/config.yaml"]
```

### Docker Compose

```yaml
# docker-compose.yaml
version: '3.8'

services:
  policy-engine:
    image: llm-policy-engine:latest
    build:
      context: .
      dockerfile: Dockerfile
    container_name: policy-engine
    ports:
      - "50051:50051"  # gRPC
      - "8080:8080"    # HTTP
      - "9090:9090"    # Metrics
    volumes:
      - ./config.yaml:/etc/policy-engine/config.yaml:ro
      - ./policies:/var/lib/policy-engine/policies:ro
      - policy-logs:/var/log/policy-engine
    environment:
      - RUST_LOG=info
      - POLICY_ENGINE_REGISTRY_URL=http://policy-registry:8080
    depends_on:
      - redis
      - policy-registry
    restart: unless-stopped
    networks:
      - policy-network
    healthcheck:
      test: ["CMD", "/bin/policy-engine", "health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  redis:
    image: redis:7-alpine
    container_name: policy-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - policy-network
    command: redis-server --appendonly yes

  policy-registry:
    image: policy-registry:latest
    container_name: policy-registry
    ports:
      - "8081:8080"
    volumes:
      - registry-data:/data
    restart: unless-stopped
    networks:
      - policy-network

  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9091:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    restart: unless-stopped
    networks:
      - policy-network

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./grafana/datasources:/etc/grafana/provisioning/datasources:ro
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    restart: unless-stopped
    networks:
      - policy-network
    depends_on:
      - prometheus

volumes:
  policy-logs:
  redis-data:
  registry-data:
  prometheus-data:
  grafana-data:

networks:
  policy-network:
    driver: bridge
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'policy-engine'
    static_configs:
      - targets: ['policy-engine:9090']
        labels:
          service: 'policy-engine'
          environment: 'production'

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

---

## Cloud Deployments

### AWS ECS

```json
{
  "family": "policy-engine",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "policy-engine",
      "image": "your-account.dkr.ecr.region.amazonaws.com/policy-engine:latest",
      "portMappings": [
        {
          "containerPort": 50051,
          "protocol": "tcp"
        },
        {
          "containerPort": 8080,
          "protocol": "tcp"
        },
        {
          "containerPort": 9090,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "POLICY_ENGINE_REGISTRY_URL",
          "value": "https://registry.example.com"
        }
      ],
      "secrets": [
        {
          "name": "POLICY_ENGINE_REGISTRY_AUTH_TOKEN",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:registry-token"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/policy-engine",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "/bin/policy-engine health || exit 1"
        ],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

### Google Cloud Run

```yaml
# service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: policy-engine
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "3"
        autoscaling.knative.dev/maxScale: "100"
    spec:
      containers:
        - image: gcr.io/project-id/policy-engine:latest
          ports:
            - containerPort: 8080
          env:
            - name: POLICY_ENGINE_HTTP_PORT
              value: "8080"
          resources:
            limits:
              memory: 1Gi
              cpu: "2"
```

### Azure Container Instances

```yaml
# aci-deployment.yaml
apiVersion: 2021-09-01
location: eastus
name: policy-engine-group
properties:
  containers:
    - name: policy-engine
      properties:
        image: your-registry.azurecr.io/policy-engine:latest
        resources:
          requests:
            cpu: 1
            memoryInGb: 2
        ports:
          - port: 50051
            protocol: TCP
          - port: 8080
            protocol: TCP
        environmentVariables:
          - name: POLICY_ENGINE_REGISTRY_URL
            value: https://registry.example.com
  osType: Linux
  ipAddress:
    type: Public
    ports:
      - port: 50051
        protocol: TCP
      - port: 8080
        protocol: TCP
```

---

## Monitoring & Observability

### Prometheus Metrics

Key metrics exposed:

```
# Request metrics
policy_engine_requests_total{decision="allow|deny|throttle"}
policy_engine_request_duration_seconds{quantile="0.5|0.95|0.99"}

# Cache metrics
policy_engine_cache_hits_total
policy_engine_cache_misses_total
policy_engine_cache_size_bytes
policy_engine_cache_evictions_total

# Policy metrics
policy_engine_policies_loaded
policy_engine_policy_updates_total
policy_engine_policy_errors_total

# Performance metrics
policy_engine_evaluation_duration_seconds{quantile="0.5|0.95|0.99"}
policy_engine_sandbox_executions_total
policy_engine_sandbox_timeouts_total
```

### Grafana Dashboard

See `/grafana/dashboards/policy-engine.json` for complete dashboard.

Key panels:
- Request rate and latency
- Cache hit rate
- Error rate
- Resource usage
- Policy distribution

---

## High Availability

### Active-Active Setup

```
                    Load Balancer (gRPC)
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   Instance 1          Instance 2          Instance 3
   (Active)            (Active)            (Active)
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                    Shared Redis Cache
                            │
                    Policy Registry (S3)
```

### Failover Configuration

```yaml
# Health check configuration
readinessProbe:
  grpc:
    port: 50051
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 2

livenessProbe:
  grpc:
    port: 50051
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3

# Pod disruption budget
minAvailable: 2  # Always keep 2 instances running
```

---

This deployment guide provides comprehensive coverage for running the LLM-Policy-Engine across different environments with production-grade configurations for reliability, scalability, and observability.
