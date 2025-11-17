# LLM-Policy-Engine Architecture Diagrams

This document contains detailed architectural diagrams for the LLM-Policy-Engine system.

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Data Flow Diagrams](#data-flow-diagrams)
4. [Deployment Architecture](#deployment-architecture)
5. [Integration Architecture](#integration-architecture)
6. [Sequence Diagrams](#sequence-diagrams)

---

## System Overview

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                       LLM Infrastructure Ecosystem                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ LLM-Shield  │  │ LLM-CostOps │  │LLM-Governance│  │LLM-Edge    │ │
│  │ (Security)  │  │  (Budget)   │  │ (Audit/UI)  │  │(Distributed)│ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬─────┘ │
│         │                │                 │                │       │
│         └────────────────┼─────────────────┼────────────────┘       │
│                          │                 │                        │
│         ┌────────────────▼─────────────────▼──────────────┐         │
│         │                                                 │         │
│         │        LLM-Policy-Engine (Core)                │         │
│         │                                                 │         │
│         │  ┌────────────────────────────────────────┐    │         │
│         │  │  Policy Evaluation Runtime             │    │         │
│         │  │  • Rule Matching Engine                │    │         │
│         │  │  • CEL Expression Evaluator            │    │         │
│         │  │  • WASM Sandbox Manager                │    │         │
│         │  │  • Decision Resolver                   │    │         │
│         │  └────────────────────────────────────────┘    │         │
│         │                                                 │         │
│         │  ┌────────────────────────────────────────┐    │         │
│         │  │  Policy Registry & Sync                │    │         │
│         │  │  • Versioned Policy Storage            │    │         │
│         │  │  • Hot Reload Mechanism                │    │         │
│         │  │  • Distributed Sync Protocol           │    │         │
│         │  └────────────────────────────────────────┘    │         │
│         │                                                 │         │
│         │  ┌────────────────────────────────────────┐    │         │
│         │  │  Multi-Level Caching                   │    │         │
│         │  │  • L1: Thread-Local Cache              │    │         │
│         │  │  • L2: Shared Process Cache            │    │         │
│         │  │  • L3: Compiled Policy Cache           │    │         │
│         │  │  • L4: Distributed Cache (Redis)       │    │         │
│         │  └────────────────────────────────────────┘    │         │
│         │                                                 │         │
│         │  ┌────────────────────────────────────────┐    │         │
│         │  │  Observability Layer                   │    │         │
│         │  │  • Structured Audit Logs               │    │         │
│         │  │  • Prometheus Metrics                  │    │         │
│         │  │  • OpenTelemetry Tracing               │    │         │
│         │  └────────────────────────────────────────┘    │         │
│         │                                                 │         │
│         └─────────────────────────────────────────────────┘         │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Application Layer                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │  │
│  │  │ LLM App 1│  │ LLM App 2│  │ LLM App 3│  │ LLM App N│     │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### Core Engine Components

```
┌────────────────────────────────────────────────────────────────────┐
│                     PolicyEngine Core                              │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                          API Layer                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ gRPC Service │  │ HTTP REST API│  │  Embedded API│             │
│  │ (Port 50051) │  │ (Port 8080)  │  │   (Library)  │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         └──────────────────┼──────────────────┘                    │
└────────────────────────────┼───────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────────┐
│                    Request Processing Layer                        │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │ Request Validator                                         │     │
│  │ • Schema validation                                       │     │
│  │ • Input sanitization                                      │     │
│  │ • Rate limiting                                           │     │
│  └───────────────────────────┬──────────────────────────────┘     │
└────────────────────────────────┼──────────────────────────────────┘
                                 │
┌────────────────────────────────▼──────────────────────────────────┐
│                      Cache Lookup Layer                           │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ L1: Thread-Local Cache (100 entries, <50ns lookup)       │    │
│  └───────────────────────────┬──────────────────────────────┘    │
│                               │ miss                              │
│  ┌───────────────────────────▼──────────────────────────────┐    │
│  │ L2: Shared LRU Cache (10K entries, ~100ns lookup)        │    │
│  └───────────────────────────┬──────────────────────────────┘    │
│                               │ miss                              │
│  ┌───────────────────────────▼──────────────────────────────┐    │
│  │ L4: Redis Cache (optional, ~1ms lookup)                  │    │
│  └───────────────────────────┬──────────────────────────────┘    │
└────────────────────────────────┼──────────────────────────────────┘
                                 │ miss
┌────────────────────────────────▼──────────────────────────────────┐
│                     Policy Evaluation Core                        │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Policy Loader                                             │    │
│  │ ┌─────────────────┐  ┌─────────────────┐                 │    │
│  │ │ YAML Parser     │  │ JSON Parser     │                 │    │
│  │ └────────┬────────┘  └────────┬────────┘                 │    │
│  │          └──────────┬──────────┘                          │    │
│  │                     ▼                                     │    │
│  │          ┌──────────────────────┐                         │    │
│  │          │ Semantic Validator   │                         │    │
│  │          │ • Type checking      │                         │    │
│  │          │ • Conflict detection │                         │    │
│  │          └──────────┬───────────┘                         │    │
│  └────────────────────┼────────────────────────────────────┘    │
│                       │                                          │
│  ┌────────────────────▼────────────────────────────────────┐    │
│  │ Compiled Policy Store (Arc<RwLock<PolicySet>>)          │    │
│  │ • Indexed by namespace, tags, version                   │    │
│  │ • Thread-safe concurrent access                         │    │
│  └────────────────────┬────────────────────────────────────┘    │
│                       │                                          │
│  ┌────────────────────▼────────────────────────────────────┐    │
│  │ Rule Matcher                                             │    │
│  │ • Filter by namespace/tags                              │    │
│  │ • Sort by priority                                       │    │
│  │ • Apply enabled filter                                   │    │
│  └────────────────────┬────────────────────────────────────┘    │
│                       │                                          │
│  ┌────────────────────▼────────────────────────────────────┐    │
│  │ Expression Evaluator                                     │    │
│  │ ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │    │
│  │ │ CEL Engine   │  │ Custom DSL   │  │ WASM Sandbox  │  │    │
│  │ │ • Fast eval  │  │ • YAML-based │  │ • Isolated    │  │    │
│  │ │ • Type-safe  │  │ • Readable   │  │ • Resource    │  │    │
│  │ │              │  │              │  │   limited     │  │    │
│  │ └──────────────┘  └──────────────┘  └───────────────┘  │    │
│  └────────────────────┬────────────────────────────────────┘    │
│                       │                                          │
│  ┌────────────────────▼────────────────────────────────────┐    │
│  │ Decision Resolver                                        │    │
│  │ • Conflict resolution (highest priority wins)           │    │
│  │ • Action merging (compatible actions)                   │    │
│  │ • Default policy application                            │    │
│  └────────────────────┬────────────────────────────────────┘    │
│                       │                                          │
│  ┌────────────────────▼────────────────────────────────────┐    │
│  │ Action Executor                                          │    │
│  │ • Execute deny/allow/throttle                           │    │
│  │ • Record audit logs                                      │    │
│  │ • Emit metrics                                           │    │
│  │ • Trigger alerts                                         │    │
│  └────────────────────┬────────────────────────────────────┘    │
└────────────────────────┼───────────────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────────────┐
│                  Response Layer                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ • Build PolicyDecision                                    │ │
│  │ • Cache result                                            │ │
│  │ • Return to caller                                        │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Policy Evaluation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   Policy Evaluation Flow                        │
└─────────────────────────────────────────────────────────────────┘

 Client Request
      │
      ▼
 ┌─────────────────┐
 │ Receive Request │
 │ • gRPC/HTTP/Lib │
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │ Validate Input  │
 │ • Schema check  │
 │ • Sanitize data │
 └────────┬────────┘
          │
          ▼
 ┌─────────────────────────────────────┐
 │ Generate Cache Key                  │
 │ • Hash(policy_version, context)     │
 └────────┬────────────────────────────┘
          │
          ▼
 ┌─────────────────────────────────────┐     ┌──────────┐
 │ L1 Cache Lookup (Thread-Local)      │────►│ HIT: ────┼──┐
 └────────┬────────────────────────────┘     │ Return   │  │
          │ MISS                              └──────────┘  │
          ▼                                                 │
 ┌─────────────────────────────────────┐     ┌──────────┐  │
 │ L2 Cache Lookup (Shared LRU)        │────►│ HIT: ────┼──┤
 └────────┬────────────────────────────┘     │ Return   │  │
          │ MISS                              └──────────┘  │
          ▼                                                 │
 ┌─────────────────────────────────────┐     ┌──────────┐  │
 │ L4 Cache Lookup (Redis, optional)   │────►│ HIT: ────┼──┤
 └────────┬────────────────────────────┘     │ Return   │  │
          │ MISS                              └──────────┘  │
          ▼                                                 │
 ┌─────────────────────────────────────┐                   │
 │ Load Applicable Policies            │                   │
 │ • Filter by namespace               │                   │
 │ • Filter by tags                    │                   │
 │ • Sort by priority                  │                   │
 └────────┬────────────────────────────┘                   │
          │                                                 │
          ▼                                                 │
 ┌─────────────────────────────────────┐                   │
 │ Evaluate Rules (Priority Order)     │                   │
 │                                     │                   │
 │ For each rule:                      │                   │
 │  ┌──────────────────────────────┐   │                   │
 │  │ 1. Check if enabled          │   │                   │
 │  └──────────┬───────────────────┘   │                   │
 │             ▼                       │                   │
 │  ┌──────────────────────────────┐   │                   │
 │  │ 2. Evaluate Condition        │   │                   │
 │  │    • Parse CEL expression    │   │                   │
 │  │    • Build context           │   │                   │
 │  │    • Execute (with timeout)  │   │                   │
 │  └──────────┬───────────────────┘   │                   │
 │             ▼                       │                   │
 │  ┌──────────────────────────────┐   │                   │
 │  │ 3. If Match → Collect        │   │                   │
 │  │    If No Match → Continue    │   │                   │
 │  └──────────────────────────────┘   │                   │
 └────────┬────────────────────────────┘                   │
          │                                                 │
          ▼                                                 │
 ┌─────────────────────────────────────┐                   │
 │ Resolve Conflicts                   │                   │
 │ • Highest priority wins             │                   │
 │ • Merge compatible actions          │                   │
 └────────┬────────────────────────────┘                   │
          │                                                 │
          ▼                                                 │
 ┌─────────────────────────────────────┐                   │
 │ Apply Default Policy (if needed)    │                   │
 └────────┬────────────────────────────┘                   │
          │                                                 │
          ▼                                                 │
 ┌─────────────────────────────────────┐                   │
 │ Execute Actions                     │                   │
 │ • Audit logging                     │                   │
 │ • Metrics recording                 │                   │
 │ • Alert triggering                  │                   │
 └────────┬────────────────────────────┘                   │
          │                                                 │
          ▼                                                 │
 ┌─────────────────────────────────────┐                   │
 │ Build PolicyDecision                │                   │
 │ • decision (allow/deny/throttle)    │                   │
 │ • reason                            │                   │
 │ • matched_rules                     │                   │
 │ • actions                           │                   │
 │ • metadata                          │                   │
 │ • evaluation_time_us                │                   │
 └────────┬────────────────────────────┘                   │
          │                                                 │
          ▼                                                 │
 ┌─────────────────────────────────────┐                   │
 │ Cache Result                        │                   │
 │ • L1 (thread-local)                 │                   │
 │ • L2 (shared LRU)                   │                   │
 │ • L4 (Redis, optional)              │                   │
 └────────┬────────────────────────────┘                   │
          │                                                 │
          └─────────────────────────────────────────────────┤
                                                            │
                                                            ▼
                                                 ┌──────────────────┐
                                                 │ Return Decision  │
                                                 │ to Client        │
                                                 └──────────────────┘

Performance Targets:
• L1 Cache Hit: <50μs
• L2 Cache Hit: <100μs
• Cache Miss (simple rule): <500μs
• Cache Miss (complex rule): <2ms
• P99 Latency: <5ms
```

---

## Deployment Architecture

### Standalone Daemon Deployment

```
┌──────────────────────────────────────────────────────────────────┐
│                       Production Deployment                      │
└──────────────────────────────────────────────────────────────────┘

                         Load Balancer (gRPC)
                         ┌─────────────────┐
                         │ HAProxy/Envoy   │
                         │ Port: 50051     │
                         └────────┬────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│ Engine Pod 1  │         │ Engine Pod 2  │         │ Engine Pod 3  │
│               │         │               │         │               │
│ ┌───────────┐ │         │ ┌───────────┐ │         │ ┌───────────┐ │
│ │Policy Eng │ │         │ │Policy Eng │ │         │ │Policy Eng │ │
│ │gRPC:50051 │ │         │ │gRPC:50051 │ │         │ │gRPC:50051 │ │
│ │HTTP:8080  │ │         │ │HTTP:8080  │ │         │ │HTTP:8080  │ │
│ │Metrics:909│ │         │ │Metrics:909│ │         │ │Metrics:909│ │
│ └───────────┘ │         │ └───────────┘ │         │ └───────────┘ │
│               │         │               │         │               │
│ Resources:    │         │ Resources:    │         │ Resources:    │
│ CPU: 1 core   │         │ CPU: 1 core   │         │ CPU: 1 core   │
│ RAM: 1GB      │         │ RAM: 1GB      │         │ RAM: 1GB      │
└───────┬───────┘         └───────┬───────┘         └───────┬───────┘
        │                         │                         │
        └─────────────────────────┼─────────────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │   Redis Cache (optional)  │
                    │   • Shared decision cache │
                    │   • TTL: 10 minutes       │
                    │   • Persistence: No       │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │   Policy Registry         │
                    │   • S3 + DynamoDB         │
                    │   • Version control       │
                    │   • Hot reload            │
                    └─────────────┬─────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
  ┌───────────────┐       ┌───────────────┐     ┌───────────────┐
  │  LLM-Shield   │       │ LLM-CostOps   │     │LLM-Governance │
  │  Port: 8080   │       │ Port: 8080    │     │ Port: 8080    │
  └───────────────┘       └───────────────┘     └───────────────┘
```

### Sidecar Deployment Pattern

```
┌──────────────────────────────────────────────────────────────────┐
│                    Kubernetes Pod (Sidecar)                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Main Application Container                  │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────┐             │    │
│  │  │ LLM Application                        │             │    │
│  │  │ • Handles user requests                │             │    │
│  │  │ • Calls Policy Engine (localhost)      │             │    │
│  │  │ • Executes LLM calls if allowed        │             │    │
│  │  └────────────────────────────────────────┘             │    │
│  │                                                          │    │
│  │  Environment:                                            │    │
│  │  POLICY_ENGINE_URL=http://localhost:50051                │    │
│  │                                                          │    │
│  │  Resources:                                              │    │
│  │  CPU: 1 core                                             │    │
│  │  RAM: 512MB                                              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │        Policy Engine Sidecar Container                  │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────┐             │    │
│  │  │ Policy Engine                          │             │    │
│  │  │ • gRPC Server (localhost:50051)        │             │    │
│  │  │ • HTTP API (localhost:8080)            │             │    │
│  │  │ • Metrics (localhost:9090)             │             │    │
│  │  │ • Local policy cache                   │             │    │
│  │  └────────────────────────────────────────┘             │    │
│  │                                                          │    │
│  │  Volumes:                                                │    │
│  │  • /etc/policy-engine (ConfigMap)                        │    │
│  │  • /var/lib/policy-engine (EmptyDir)                     │    │
│  │                                                          │    │
│  │  Resources:                                              │    │
│  │  CPU: 0.5 core                                           │    │
│  │  RAM: 256MB                                              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Pod Network: localhost (shared between containers)             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Integration Architecture

### LLM Ecosystem Integration

```
┌──────────────────────────────────────────────────────────────────┐
│                    LLM Infrastructure Stack                      │
└──────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   User/Application  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   API Gateway       │
                    │   • Auth            │
                    │   • Routing         │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐      ┌───────────────┐     ┌───────────────┐
│  LLM-Shield   │      │Policy Engine  │     │ LLM-CostOps   │
│               │      │               │     │               │
│ • Input scan  │◄────►│ • Evaluate    │◄───►│ • Budget check│
│ • Output scan │      │ • Enforce     │     │ • Cost track  │
│ • Jailbreak   │      │ • Audit       │     │ • Optimize    │
│   detection   │      │               │     │               │
└───────┬───────┘      └───────┬───────┘     └───────┬───────┘
        │                      │                     │
        │                      │                     │
        │      ┌───────────────▼───────────┐         │
        │      │  LLM-Governance           │         │
        └─────►│  • Audit logs             │◄────────┘
               │  • Compliance reports     │
               │  • Dashboard              │
               └───────────────┬───────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
        ┌───────────┐  ┌───────────┐  ┌───────────┐
        │ LLM       │  │ LLM       │  │ LLM       │
        │ Provider 1│  │ Provider 2│  │ Provider N│
        │ (OpenAI)  │  │(Anthropic)│  │ (Custom)  │
        └───────────┘  └───────────┘  └───────────┘

Integration Points:

1. LLM-Shield → Policy Engine:
   • Security scan results
   • Threat detection alerts
   • Jailbreak attempts

2. Policy Engine → LLM-CostOps:
   • Budget checks
   • Cost estimates
   • Usage recording

3. Policy Engine → LLM-Governance:
   • Audit events
   • Decision logs
   • Compliance data

4. Policy Engine → LLM-Edge-Agent:
   • Policy distribution
   • Edge metrics
   • Sync status
```

---

## Sequence Diagrams

### Policy Evaluation Sequence

```
┌──────┐     ┌────────┐     ┌──────────┐     ┌──────┐     ┌────────┐
│Client│     │  API   │     │  Cache   │     │ Rule │     │ Audit  │
│      │     │ Layer  │     │  Layer   │     │Engine│     │ Logger │
└──┬───┘     └───┬────┘     └────┬─────┘     └──┬───┘     └───┬────┘
   │             │               │              │              │
   │ Evaluate    │               │              │              │
   │ Request     │               │              │              │
   ├────────────►│               │              │              │
   │             │               │              │              │
   │             │ Lookup Cache  │              │              │
   │             ├──────────────►│              │              │
   │             │               │              │              │
   │             │◄─────────────┤│              │              │
   │             │  Cache Miss   │              │              │
   │             │               │              │              │
   │             │               │ Load Policies│              │
   │             │               ├─────────────►│              │
   │             │               │              │              │
   │             │               │ Evaluate     │              │
   │             │               │ Rules        │              │
   │             │               │◄─────────────┤              │
   │             │               │              │              │
   │             │               │ Decision     │              │
   │             │               │◄─────────────┤              │
   │             │               │              │              │
   │             │               │              │ Log Decision │
   │             │               │              ├─────────────►│
   │             │               │              │              │
   │             │               │ Store Cache  │              │
   │             │               │◄─────────────┤              │
   │             │               │              │              │
   │             │ Decision      │              │              │
   │             │◄──────────────┤              │              │
   │             │               │              │              │
   │ Decision    │               │              │              │
   │◄────────────┤               │              │              │
   │             │               │              │              │
```

### Policy Hot Reload Sequence

```
┌─────────┐   ┌────────┐   ┌──────────┐   ┌────────┐   ┌──────┐
│Registry │   │ Sync   │   │  Policy  │   │ Cache  │   │Engine│
│ Server  │   │Protocol│   │  Store   │   │        │   │      │
└────┬────┘   └───┬────┘   └────┬─────┘   └───┬────┘   └──┬───┘
     │            │              │             │           │
     │ Policy     │              │             │           │
     │ Updated    │              │             │           │
     ├───────────►│              │             │           │
     │            │              │             │           │
     │            │ Fetch Update │             │           │
     │            ├─────────────►│             │           │
     │            │              │             │           │
     │            │ Policy YAML  │             │           │
     │            │◄─────────────┤             │           │
     │            │              │             │           │
     │            │              │ Validate    │           │
     │            │              ├────────────►│           │
     │            │              │             │           │
     │            │              │◄────────────┤           │
     │            │              │  Valid      │           │
     │            │              │             │           │
     │            │              │             │ Invalidate│
     │            │              │             │  Cache    │
     │            │              │             │◄──────────┤
     │            │              │             │           │
     │            │              │ Compile     │           │
     │            │              ├────────────────────────►│
     │            │              │             │           │
     │            │              │◄────────────────────────┤
     │            │              │  Compiled   │           │
     │            │              │             │           │
     │            │              │ Atomic Swap │           │
     │            │              ├────────────────────────►│
     │            │              │             │           │
     │            │ Reload Done  │             │           │
     │            │◄─────────────┤             │           │
     │            │              │             │           │
```

---

This diagrams document provides comprehensive visual representations of the LLM-Policy-Engine architecture, covering system overview, component relationships, data flows, deployment patterns, and integration points.
