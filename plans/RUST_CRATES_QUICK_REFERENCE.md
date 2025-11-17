# Rust Crates Quick Reference - LLM Policy Engine

This document provides a quick reference for the essential Rust crates recommended for the LLM Policy Engine implementation.

---

## Policy Evaluation & Authorization

### Cedar Policy (RECOMMENDED)
```toml
cedar-policy-core = "4.0"
```
- **Purpose**: Formally verified authorization engine
- **Performance**: Millisecond evaluation times
- **Features**: Parser, AST, evaluator all included
- **AWS-backed**: Production-proven at AWS scale
- **Documentation**: https://docs.cedarpolicy.com/

### Alternative: rscel (Common Expression Language)
```toml
rscel = "0.1"
```
- **Purpose**: CEL expression evaluator
- **Features**: Flexible, sandboxed, lightweight
- **Use Case**: Simple conditional expressions

---

## Serialization & Parsing

### Core Serialization
```toml
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```
- **Purpose**: Universal serialization framework
- **Performance**: Battle-tested, production-ready
- **Features**: Derive macros, zero-copy deserialization

### YAML Parsing
```toml
serde-saphyr = "0.1"
```
- **Purpose**: Modern YAML parser (replaces deprecated serde_yaml)
- **Features**: Faster than legacy alternatives, pure Rust
- **Migration**: Drop-in replacement for serde_yaml

### High-Performance JSON
```toml
simd-json = { version = "0.13", features = ["serde_impl", "jemalloc"] }
```
- **Purpose**: SIMD-accelerated JSON parsing
- **Performance**: Significantly faster than serde_json
- **Use Case**: Hot-path JSON parsing, high-throughput scenarios

---

## DSL Parsing

### Winnow (RECOMMENDED)
```toml
winnow = "0.6"
winnow-rule = "0.1"  # Optional: DSL macro support
```
- **Purpose**: Modern parser combinator (nom fork)
- **Improvements**: Better DX, performance optimizations
- **Use Case**: Custom policy DSL, complex parsing

### Alternative: Pest (PEG Parser)
```toml
pest = "2.7"
pest_derive = "2.7"
```
- **Purpose**: PEG parser generator
- **Features**: Grammar-based, easier DSL definition
- **Trade-off**: Slower than winnow, but simpler to use

---

## WebAssembly Sandbox

### Wasmtime (RECOMMENDED)
```toml
wasmtime = "25.0"
```
- **Purpose**: Secure WebAssembly runtime
- **Features**:
  - Cranelift optimizing compiler
  - 24/7 fuzzing (Google OSS Fuzz)
  - WASI support
  - Low-overhead calls
- **Security**: Production-grade, RFC-based development
- **Documentation**: https://docs.wasmtime.dev/

### Alternative: Wasmer
```toml
wasmer = { version = "5.0", features = ["llvm"] }
```
- **Purpose**: WebAssembly runtime with LLVM backend
- **Performance**: ~50% faster with LLVM (vs Cranelift)
- **Trade-off**: Larger binary, longer compile times

---

## Caching

### Moka (RECOMMENDED)
```toml
moka = { version = "0.12", features = ["future", "sync"] }
```
- **Purpose**: High-performance concurrent cache
- **Features**:
  - TinyLFU eviction (LRU + LFU admission)
  - Async and sync APIs
  - TTL/TTI expiration
  - Weighted eviction
  - Statistics
- **Performance**: Lock-free concurrent hash table
- **Inspired by**: Caffeine (Java)
- **Documentation**: https://github.com/moka-rs/moka

**Example**:
```rust
use moka::future::Cache;
use std::time::Duration;

let cache: Cache<String, Decision> = Cache::builder()
    .max_capacity(10_000)
    .time_to_live(Duration::from_secs(300))
    .build();

// Insert
cache.insert("key".to_string(), decision).await;

// Get
if let Some(cached) = cache.get("key").await {
    // Cache hit
}
```

---

## Concurrent Data Structures

### DashMap (RECOMMENDED)
```toml
dashmap = "6.1"
```
- **Purpose**: Blazing fast concurrent HashMap
- **Features**:
  - Fine-grained sharding (not whole-map locking)
  - Multiple threads on different keys run concurrently
  - 10-100x faster than Arc<Mutex<HashMap>>
- **Use Case**: Shared policy metadata, runtime state

**Anti-pattern to avoid**:
```rust
// DON'T: Coarse-grained locking causes contention
Arc<Mutex<HashMap<K, V>>>

// DO: Fine-grained concurrent map
Arc<DashMap<K, V>>
```

### Alternative: Flurry
```toml
flurry = "0.5"
```
- **Purpose**: Lock-free concurrent HashMap
- **Features**: Epoch-based GC, port of Java ConcurrentHashMap
- **Use Case**: Lock-free alternative to DashMap

---

## Async Runtime & Concurrency

### Tokio (RECOMMENDED)
```toml
tokio = { version = "1.41", features = ["full"] }
```
- **Purpose**: Asynchronous runtime
- **Features**:
  - Multi-threaded work-stealing scheduler
  - Async I/O, timers, channels
  - mpsc/oneshot for actor pattern
- **Documentation**: https://tokio.rs/

**Actor Pattern Example**:
```rust
use tokio::sync::mpsc;

struct PolicyActor {
    receiver: mpsc::Receiver<PolicyRequest>,
}

impl PolicyActor {
    async fn run(&mut self) {
        while let Some(req) = self.receiver.recv().await {
            // Process request
        }
    }
}
```

### Actor Frameworks

#### Ractor (RECOMMENDED)
```toml
ractor = "0.13"
```
- **Purpose**: Erlang-like actor framework
- **Features**: Supervision trees, actor management
- **Use Case**: Full actor system with supervision

#### Actix
```toml
actix = "0.13"
```
- **Purpose**: Mature actor framework
- **Features**: Production-proven, Tokio-based
- **Use Case**: Complex actor systems

---

## Validation

### JSON Schema Validator
```toml
jsonschema = "0.30"
```
- **Purpose**: High-performance JSON Schema validation
- **Features**:
  - Compiles schema to validation tree
  - Reusable validators
  - Linear-time regex (DoS prevention)
- **Performance**: Faster than valico, jsonschema_valid
- **Documentation**: https://github.com/Stranger6667/jsonschema

**Example**:
```rust
use jsonschema::JSONSchema;

let schema = serde_json::json!({
    "type": "object",
    "properties": {
        "action": {"type": "string"}
    }
});

let validator = JSONSchema::compile(&schema).unwrap();
let instance = serde_json::json!({"action": "allow"});

if let Err(errors) = validator.validate(&instance) {
    for error in errors {
        println!("Validation error: {}", error);
    }
}
```

---

## Metrics & Observability

### OpenTelemetry (RECOMMENDED)
```toml
opentelemetry = "0.27"
opentelemetry-sdk = "0.27"
opentelemetry-prometheus = "0.17"
opentelemetry-otlp = "0.27"
```
- **Purpose**: Unified telemetry (metrics, traces, logs)
- **Features**:
  - Prometheus exporter
  - OTLP exporter (Grafana, Datadog, etc.)
  - Context propagation
- **Documentation**: https://opentelemetry.io/docs/languages/rust/

### Tracing
```toml
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```
- **Purpose**: Application-level tracing
- **Features**: Structured events, span context
- **Integration**: Works with OpenTelemetry

**Example**:
```rust
use tracing::{info, instrument};

#[instrument]
async fn evaluate_policy(request: &Request) -> Decision {
    info!("Evaluating policy for user {}", request.user);
    // ... evaluation logic
}
```

---

## Testing

### Proptest (RECOMMENDED)
```toml
proptest = "1.5"
```
- **Purpose**: Property-based testing (Hypothesis-like)
- **Features**:
  - Arbitrary input generation
  - Automatic shrinking to minimal failing case
  - Explicit strategies (vs type-based)
- **Documentation**: https://proptest-rs.github.io/proptest/

**Example**:
```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_policy_never_panics(prompt in ".*") {
        let request = Request { prompt, user: "test" };
        // Should always return a decision, never panic
        let decision = evaluate_policy(&request);
        assert!(matches!(decision.action, Action::Allow | Action::Deny));
    }
}
```

### Criterion (Benchmarking)
```toml
criterion = { version = "0.5", features = ["html_reports"] }
```
- **Purpose**: Statistical benchmarking
- **Features**: Regression detection, HTML reports
- **Documentation**: https://bheisler.github.io/criterion.rs/

**Example**:
```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark_policy_eval(c: &mut Criterion) {
    let policy = load_policy("test.yaml");
    let request = create_sample_request();

    c.bench_function("policy_eval", |b| {
        b.iter(|| policy.evaluate(black_box(&request)))
    });
}

criterion_group!(benches, benchmark_policy_eval);
criterion_main!(benches);
```

---

## HTTP & gRPC

### Axum (HTTP Server)
```toml
axum = "0.7"
tower = "0.5"  # Middleware
```
- **Purpose**: Ergonomic async web framework
- **Features**: Type-safe extractors, Tower middleware
- **Use Case**: REST API server

### Tonic (gRPC)
```toml
tonic = "0.12"
prost = "0.13"  # Protocol Buffers
```
- **Purpose**: gRPC server/client
- **Features**: Code generation from .proto files
- **Use Case**: High-performance RPC

---

## Distributed Coordination

### etcd Client
```toml
etcd-client = "0.14"
```
- **Purpose**: etcd client for policy registry
- **Features**: Watch for updates, distributed KV store
- **Use Case**: Policy synchronization across instances

### Consul Client
```toml
consul = "0.4"
```
- **Purpose**: Consul client for service discovery + KV
- **Features**: Service registration, health checks
- **Use Case**: Alternative to etcd with service discovery

---

## Complete Cargo.toml Example

```toml
[package]
name = "llm-policy-engine"
version = "0.1.0"
edition = "2021"

[dependencies]
# Policy evaluation
cedar-policy-core = "4.0"

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
serde-saphyr = "0.1"

# Optional: High-performance JSON
simd-json = { version = "0.13", features = ["serde_impl"], optional = true }

# Parsing
winnow = "0.6"

# Sandbox
wasmtime = "25.0"

# Caching & concurrent data structures
moka = { version = "0.12", features = ["future", "sync"] }
dashmap = "6.1"

# Async runtime
tokio = { version = "1.41", features = ["full"] }

# HTTP/gRPC
axum = "0.7"
tonic = "0.12"
prost = "0.13"

# Validation
jsonschema = "0.30"

# Observability
opentelemetry = { version = "0.27", features = ["metrics", "trace"] }
opentelemetry-sdk = "0.27"
opentelemetry-prometheus = "0.17"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Error handling
anyhow = "1.0"
thiserror = "2.0"

[dev-dependencies]
# Testing
proptest = "1.5"
tokio-test = "0.4"

# Benchmarking
criterion = { version = "0.5", features = ["html_reports"] }

[features]
default = []
high-performance = ["simd-json"]
edge = []  # WASM-compatible subset

[[bench]]
name = "policy_evaluation"
harness = false
```

---

## Performance-Critical Crates Summary

| Crate | Purpose | Performance Impact |
|-------|---------|-------------------|
| `moka` | Caching | 90%+ cache hit rate → 10x latency reduction |
| `dashmap` | Concurrent HashMap | 10-100x vs Arc<Mutex<HashMap>> |
| `simd-json` | JSON parsing | 2-5x faster than serde_json |
| `wasmtime` | Sandbox | Near-native execution (90%+ native speed) |
| `cedar-policy-core` | Policy eval | Sub-millisecond evaluation |

---

## Security-Critical Crates Summary

| Crate | Purpose | Security Benefit |
|-------|---------|------------------|
| `wasmtime` | Sandbox | Memory-safe WASM execution |
| `jsonschema` | Validation | Linear-time regex (DoS prevention) |
| `cedar-policy-core` | Policy eval | Formally verified authorization logic |

---

## Quick Start Commands

```bash
# Create new project
cargo new llm-policy-engine --lib
cd llm-policy-engine

# Add core dependencies
cargo add serde serde_json serde-saphyr --features serde/derive
cargo add cedar-policy-core
cargo add moka --features future,sync
cargo add dashmap
cargo add tokio --features full
cargo add wasmtime

# Add observability
cargo add opentelemetry opentelemetry-sdk opentelemetry-prometheus
cargo add tracing tracing-subscriber --features tracing-subscriber/env-filter

# Add dev dependencies
cargo add --dev proptest criterion --features criterion/html_reports

# Run tests
cargo test

# Run benchmarks
cargo bench

# Build for release
cargo build --release
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-17
**Companion to**: RESEARCH_FINDINGS.md
