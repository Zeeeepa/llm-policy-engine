# Algorithm Visualizations and Flow Diagrams

## Overview

This document provides visual representations of the key algorithms and data flows in the LLM Policy Engine to aid understanding and implementation.

---

## 1. Policy Evaluation Flow

### 1.1 High-Level Evaluation Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     INCOMING LLM REQUEST                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: REQUEST PREPROCESSING                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Extract metadata (user, org, client info)                 │ │
│ │ • Generate request ID and trace ID                          │ │
│ │ • Validate request structure                                │ │
│ │ • Build evaluation context                                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: POLICY LOOKUP                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Query policy registry                                     │ │
│ │ • Filter by scope and applicability                         │ │
│ │ • Sort by priority (highest first)                          │ │
│ │ • Result: [Policy1, Policy2, ..., PolicyN]                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: CACHE LOOKUP                                            │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Compute Cache Key:                                          │ │
│ │   hash(policyID + version + request_fields + context)       │ │
│ │                                                             │ │
│ │ Check L1 Cache (Local)         Check L2 Cache (Distributed) │ │
│ │        │                                  │                 │ │
│ │        v                                  v                 │ │
│ │   ┌─────────┐                        ┌─────────┐           │ │
│ │   │  HIT?   │──Yes──────────────────>│ RETURN  │           │ │
│ │   └────┬────┘                        └─────────┘           │ │
│ │        │No                                                  │ │
│ │        v                                                    │ │
│ │   ┌─────────┐                                               │ │
│ │   │  HIT?   │──Yes──────> Promote to L1 ──> RETURN         │ │
│ │   └────┬────┘                                               │ │
│ │        │No                                                  │ │
│ │        v                                                    │ │
│ │   CACHE MISS → Continue to evaluation                       │ │
│ └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: POLICY EVALUATION (For each policy in priority order)  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ For each RULE in Policy:                                    │ │
│ │                                                             │ │
│ │   ┌───────────────────────────────────────┐                │ │
│ │   │ 4a. Evaluate Condition                │                │ │
│ │   │  • Parse condition AST                │                │ │
│ │   │  • Resolve accessors (request.*)      │                │ │
│ │   │  • Execute comparisons                │                │ │
│ │   │  • Apply logical operators (&&, ||)   │                │ │
│ │   │  • Result: Boolean (true/false)       │                │ │
│ │   └────────────────┬──────────────────────┘                │ │
│ │                    │                                        │ │
│ │                    v                                        │ │
│ │            Condition matched?                               │ │
│ │                    │                                        │ │
│ │         ┌──────────┴──────────┐                            │ │
│ │         │                     │                            │ │
│ │        Yes                   No                            │ │
│ │         │                     │                            │ │
│ │         v                     v                            │ │
│ │   ┌─────────────┐      Continue to next rule              │ │
│ │   │ 4b. Execute │                                          │ │
│ │   │   Action    │                                          │ │
│ │   └─────────────┘                                          │ │
│ │         │                                                  │ │
│ │         v                                                  │ │
│ │   ┌─────────────────────────────┐                          │ │
│ │   │ Action Type?                │                          │ │
│ │   └──┬──────────┬───────────┬───┘                          │ │
│ │      │          │           │                              │ │
│ │    ALLOW      DENY      MODIFY/WARN                        │ │
│ │      │          │           │                              │ │
│ │      v          v           v                              │ │
│ │   Terminal   Terminal   Non-terminal                       │ │
│ │   RETURN     RETURN     Continue                           │ │
│ └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: DECISION COMPOSITION                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Merge decisions from all evaluated policies:                │ │
│ │                                                             │ │
│ │ Priority Order:                                             │ │
│ │   1. DENY (highest priority - any deny wins)               │ │
│ │   2. REQUIRE_APPROVAL                                       │ │
│ │   3. RATE_LIMIT                                             │ │
│ │   4. MODIFY (merge modifications)                           │ │
│ │   5. WARN (collect all warnings)                            │ │
│ │   6. ALLOW (default)                                        │ │
│ │                                                             │ │
│ │ Conflict Resolution:                                        │ │
│ │   • Modifications: Merge or resolve by priority            │ │
│ │   • Warnings: Accumulate all                                │ │
│ │   • Approvals: Require union of all approvers              │ │
│ └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: CACHE STORAGE                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Store decision in L1 cache (local)                        │ │
│ │ • Store decision in L2 cache (distributed) if valuable      │ │
│ │ • Set TTL based on policy configuration                     │ │
│ │ • Update cache statistics                                   │ │
│ └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7: RESPONSE GENERATION                                     │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Format response based on action type                      │ │
│ │ • Add metadata (evaluation time, cache hit, etc.)           │ │
│ │ • Include warnings if present                               │ │
│ │ • Add audit trail if enabled                                │ │
│ │ • Generate trace for debugging                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────────┐
│                     RETURN POLICY RESPONSE                       │
│  {                                                              │
│    action: "allow|deny|modify|warn|...",                       │
│    reason: "...",                                               │
│    modifications: [...],                                        │
│    warnings: [...],                                             │
│    metadata: { evaluationTime, cacheHit, ... }                 │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Condition Evaluation Algorithm

### 2.1 Recursive Evaluation Tree

```
EvaluateCondition(node)
        │
        v
   ┌────────────┐
   │ Node Type? │
   └──┬─────────┘
      │
      ├─────────────────┬─────────────────┬──────────────────┐
      │                 │                 │                  │
      v                 v                 v                  v
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ LOGICAL  │      │COMPARISON│      │ FUNCTION │      │  OTHER   │
└─────┬────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
      │                │                 │                  │
      v                v                 v                  v
 ┌─────────┐      ┌─────────┐      ┌─────────┐        ERROR
 │Operator?│      │Get Left │      │Execute  │
 └────┬────┘      │Get Right│      │Function │
      │           │Compare  │      └────┬────┘
      │           └────┬────┘           │
      │                │                v
      │                v           Return Boolean
   ┌──┴───┬──────┐   Return
   │      │      │   Boolean
  AND    OR    NOT
   │      │      │
   v      v      v
 ┌────────────────────────────────────┐
 │ For AND:                           │
 │   For each operand:                │
 │     result = EvaluateCondition()   │
 │     if !result: return false       │
 │   return true                      │
 │                                    │
 │ For OR:                            │
 │   For each operand:                │
 │     result = EvaluateCondition()   │
 │     if result: return true         │
 │   return false                     │
 │                                    │
 │ For NOT:                           │
 │   result = EvaluateCondition()     │
 │   return !result                   │
 └────────────────────────────────────┘
```

### 2.2 Condition Short-Circuit Optimization

```
AND Evaluation with Short-Circuit
──────────────────────────────────

Input: [Cond1, Cond2, Cond3, Cond4]

Step 1: Sort by cost (cheapest first)
        ↓
   [Cond3, Cond1, Cond4, Cond2]
   (cost:1) (cost:2) (cost:5) (cost:10)

Step 2: Evaluate in order
        ↓
   Eval Cond3 → TRUE
        ↓
   Eval Cond1 → TRUE
        ↓
   Eval Cond4 → FALSE ──→ SHORT-CIRCUIT! Return FALSE
        ↓
   (Cond2 never evaluated - saved 10 cost units)


OR Evaluation with Short-Circuit
─────────────────────────────────

Input: [Cond1, Cond2, Cond3, Cond4]

Step 1: Sort by cost (cheapest first)
        ↓
   [Cond3, Cond1, Cond4, Cond2]
   (cost:1) (cost:2) (cost:5) (cost:10)

Step 2: Evaluate in order
        ↓
   Eval Cond3 → FALSE
        ↓
   Eval Cond1 → TRUE ──→ SHORT-CIRCUIT! Return TRUE
        ↓
   (Cond4 and Cond2 never evaluated - saved 15 cost units)
```

---

## 3. Decision Tree Construction

### 3.1 Tree Building Process

```
Input Rules:
─────────────
Rule1: IF user.tier == "free" AND request.cost > 1.0 THEN deny
Rule2: IF user.tier == "pro" AND request.cost > 10.0 THEN deny
Rule3: IF request.model == "gpt-4" THEN warn
Rule4: IF user.authenticated == false THEN deny


Step 1: Analyze Condition Frequency
────────────────────────────────────
user.tier: 2 occurrences
request.cost: 2 occurrences
request.model: 1 occurrence
user.authenticated: 1 occurrence


Step 2: Calculate Selectivity
──────────────────────────────
user.authenticated: 0.95 (very selective - few false)
user.tier: 0.6 (moderate)
request.cost: 0.4 (less selective)
request.model: 0.3 (less selective)


Step 3: Build Tree (top-down, most selective first)
────────────────────────────────────────────────────

                    ┌─────────────────────┐
                    │ user.authenticated? │  ← Most selective
                    └──────────┬──────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
              TRUE                          FALSE
                │                             │
                v                             v
        ┌──────────────┐              ┌──────────┐
        │  user.tier?  │              │  DENY    │  ← Rule4
        └──────┬───────┘              │(unauthd) │
               │                      └──────────┘
        ┌──────┴──────┐
        │             │
      FREE           PRO
        │             │
        v             v
   ┌─────────┐   ┌─────────┐
   │cost>1.0?│   │cost>10.0?│
   └────┬────┘   └────┬─────┘
        │             │
    ┌───┴───┐     ┌───┴───┐
   YES     NO    YES     NO
    │       │     │       │
    v       v     v       v
  ┌────┐ ┌────┐┌────┐ ┌────┐
  │DENY││CONT││DENY││CONT│
  │(R1)││    ││(R2)││    │
  └────┘└────┘└────┘└────┘

Legend:
  DENY = Terminal action (deny)
  CONT = Continue evaluation (check other rules)
```

### 3.2 Tree Traversal Example

```
Request: {
  user: { tier: "free", authenticated: true },
  request: { cost: 1.5, model: "gpt-4" }
}

Traversal Path:
───────────────

Start → user.authenticated?
        │
        └─→ TRUE (user is authenticated)
            │
            v
          user.tier?
            │
            └─→ FREE (user is free tier)
                │
                v
              cost > 1.0?
                │
                └─→ YES (1.5 > 1.0)
                    │
                    v
                  ┌────────────────┐
                  │ DENY (Rule1)   │
                  │ Reason: Free   │
                  │ tier exceeded  │
                  │ cost limit     │
                  └────────────────┘

Depth: 3 nodes
Time: O(log n) vs O(n) for linear scan
```

---

## 4. Multi-Level Cache Architecture

### 4.1 Cache Hierarchy

```
                          REQUEST
                             │
                             v
                    ┌────────────────┐
                    │ Compute Cache  │
                    │     Key        │
                    └────────┬───────┘
                             │
                             v
┌────────────────────────────────────────────────────────────┐
│                     L1 CACHE (Local)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  • In-memory (process-local)                         │  │
│  │  • LRU eviction                                      │  │
│  │  • Size: 10K entries                                 │  │
│  │  • TTL: 5 minutes                                    │  │
│  │  • Latency: < 1ms                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          v                                  │
│                    ┌─────────┐                              │
│                    │  HIT?   │──Yes──→ RETURN              │
│                    └────┬────┘                              │
│                         │No                                 │
└─────────────────────────┼─────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│                  L2 CACHE (Distributed)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  • Shared across instances (Redis)                   │   │
│  │  • Adaptive eviction (LRU/LFU hybrid)                │   │
│  │  • Size: 1M entries                                  │   │
│  │  • TTL: 30 minutes                                   │   │
│  │  • Latency: < 5ms                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          v                                   │
│                    ┌─────────┐                               │
│                    │  HIT?   │──Yes──→ Promote to L1        │
│                    └────┬────┘         RETURN               │
│                         │No                                  │
└─────────────────────────┼──────────────────────────────────┘
                          │
                          v
                    ┌──────────────┐
                    │ CACHE MISS   │
                    │              │
                    │ Evaluate     │
                    │ Policy       │
                    └──────┬───────┘
                           │
                           v
                    ┌──────────────┐
                    │ Store in L1  │
                    └──────┬───────┘
                           │
                           v
                    ┌──────────────┐
                    │ Store in L2  │
                    │ (if valuable)│
                    └──────────────┘
```

### 4.2 Cache Key Computation

```
Cache Key Generation
────────────────────

Input: Request + Context
       │
       v
┌──────────────────────────────────────┐
│ Extract Relevant Fields:             │
│                                      │
│ From Request:                        │
│  • model.name                        │
│  • max_tokens                        │
│  • temperature                       │
│  • prompt (hash only)                │
│                                      │
│ From Context:                        │
│  • user.id                           │
│  • user.tier                         │
│  • organization.id                   │
│  • client.country (if relevant)      │
│                                      │
│ From Policy:                         │
│  • policy.id                         │
│  • policy.version                    │
└──────────┬───────────────────────────┘
           │
           v
┌──────────────────────────────────────┐
│ Normalize and Sort:                  │
│                                      │
│ {                                    │
│   "policy_id": "cost_control_v1",    │
│   "policy_version": "1.0.0",         │
│   "user_id": "user_123",             │
│   "user_tier": "free",               │
│   "model_name": "gpt-4",             │
│   "max_tokens": 1000,                │
│   "prompt_hash": "a3f5c..."          │
│ }                                    │
└──────────┬───────────────────────────┘
           │
           v
┌──────────────────────────────────────┐
│ Hash:                                │
│                                      │
│ SHA256(JSON.stringify(fields))       │
│                                      │
│ Result:                              │
│ "e4b2a1f3c8d..."                     │
└──────────────────────────────────────┘
```

---

## 5. Policy Conflict Resolution

### 5.1 Conflict Detection Decision Tree

```
Multiple Policy Decisions
         │
         v
   ┌─────────────┐
   │ Any DENY?   │
   └──────┬──────┘
          │
      ┌───┴───┐
     Yes      No
      │       │
      v       v
   ┌────┐   ┌─────────────────┐
   │DENY│   │ Any REQUIRE     │
   │WINS│   │ APPROVAL?       │
   └────┘   └────────┬─────────┘
                     │
                 ┌───┴───┐
                Yes      No
                 │       │
                 v       v
          ┌────────┐   ┌─────────────┐
          │APPROVAL│   │ Any RATE    │
          │  WINS  │   │ LIMIT?      │
          └────────┘   └──────┬──────┘
                              │
                          ┌───┴───┐
                         Yes      No
                          │       │
                          v       v
                   ┌──────────┐ ┌─────────────┐
                   │RATE LIMIT│ │ Any MODIFY? │
                   │   WINS   │ └──────┬──────┘
                   └──────────┘        │
                                   ┌───┴───┐
                                  Yes      No
                                   │       │
                                   v       v
                            ┌──────────┐ ┌──────┐
                            │  MERGE   │ │ALLOW │
                            │  MODIFY  │ │      │
                            └──────────┘ └──────┘
```

### 5.2 Modification Conflict Resolution

```
Conflicting Modifications
─────────────────────────

Example: Two policies modify same field

Policy A: SET request.max_tokens = 1000
Policy B: SET request.max_tokens = 2000

Resolution Algorithm:
     │
     v
┌─────────────────────────────────┐
│ Group by Target Path            │
│                                 │
│ request.max_tokens:             │
│   - Policy A: SET 1000          │
│   - Policy B: SET 2000          │
└────────────┬────────────────────┘
             │
             v
┌─────────────────────────────────┐
│ Check Operation Types           │
└────────────┬────────────────────┘
             │
         ┌───┴───┐
         │       │
      REMOVE    SET
         │       │
         v       v
      ┌────┐   ┌─────────────────┐
      │WINS│   │ Compare Policy  │
      │    │   │ Priorities      │
      └────┘   └────────┬─────────┘
                        │
                    ┌───┴────┐
                    │        │
            Priority A > B   Priority B > A
                    │        │
                    v        v
              Policy A wins  Policy B wins
              SET 1000       SET 2000


Special Cases:
──────────────

APPEND operations:
  → Merge all appends into array

INCREMENT operations:
  → Sum all increments

REMOVE + SET:
  → REMOVE wins (most restrictive)
```

---

## 6. Rate Limiting Algorithm

### 6.1 Sliding Window Rate Limiter

```
Sliding Window Algorithm
────────────────────────

Window: 1 hour
Limit: 100 requests

Timeline:
─────────────────────────────────────────────────────────────
         Window Start              Current Time
              │                         │
              v                         v
──────────────┼─────────────────────────┼────────────────→
              │◄────────3600s──────────►│
              │                         │
              └─────────────────────────┘
              Count requests in window

Implementation:
───────────────

Data Structure (Redis sorted set):
  Key: "rate_limit:user_123:hourly"
  Members: Request timestamps (scores)

  ZADD rate_limit:user_123:hourly 1699564800 "req_1"
  ZADD rate_limit:user_123:hourly 1699564850 "req_2"
  ...

Check Algorithm:
  1. currentTime = NOW()
  2. windowStart = currentTime - 3600
  3. Remove old entries:
       ZREMRANGEBYSCORE rate_limit:user_123:hourly 0 windowStart
  4. Count remaining:
       count = ZCARD rate_limit:user_123:hourly
  5. If count >= 100:
       REJECT with retry_after = oldest_request_time + 3600 - currentTime
  6. Else:
       ZADD rate_limit:user_123:hourly currentTime "req_new"
       ALLOW

Visual Example:
───────────────

Requests in window:
├────┼────┼────┼────┼────┼────┼────┼────┤  (100 requests)
│    │    │    │    │    │    │    │    │
└────────────────────────────────────────┘
                                    ▲
                              Current time

New request arrives:
├────┼────┼────┼────┼────┼────┼────┼────┤X  (101 requests)
│    │    │    │    │    │    │    │    │
└────────────────────────────────────────┘
                                    ▲
                              REJECT!

After 10 minutes (oldest request ages out):
     ├────┼────┼────┼────┼────┼────┼────┤  (99 requests)
     │    │    │    │    │    │    │    │
─────┘                                    └──────────────────
     ▲
Aged out
                                          Now ALLOW new request
```

---

## 7. ML Prediction Pipeline

### 7.1 Prediction Flow

```
┌────────────────────────────────────────────────────────────┐
│                    INCOMING REQUEST                         │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           v
┌────────────────────────────────────────────────────────────┐
│ FEATURE EXTRACTION                                          │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Categorical Features:                                   ││
│ │  • model.name → one-hot encoding                        ││
│ │  • user.tier → embedding                                ││
│ │                                                         ││
│ │ Numerical Features:                                     ││
│ │  • max_tokens                                           ││
│ │  • temperature                                          ││
│ │  • estimated_cost                                       ││
│ │  • prompt_length                                        ││
│ │                                                         ││
│ │ Text Features:                                          ││
│ │  • prompt → embedding (384-dim)                         ││
│ │                                                         ││
│ │ Temporal Features:                                      ││
│ │  • hour_of_day                                          ││
│ │  • day_of_week                                          ││
│ │                                                         ││
│ │ Behavioral Features:                                    ││
│ │  • user_recent_denials                                  ││
│ │  • user_avg_cost                                        ││
│ └─────────────────────────────────────────────────────────┘│
└──────────────────────────┬─────────────────────────────────┘
                           │
                           v
┌────────────────────────────────────────────────────────────┐
│ ENSEMBLE PREDICTION                                         │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Decision     │  │   Neural     │  │  Gradient    │     │
│  │   Tree       │  │   Network    │  │  Boosting    │     │
│  │  (40% wt)    │  │  (30% wt)    │  │  (30% wt)    │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
│         v                 v                 v              │
│      ┌────┐           ┌────┐           ┌────┐             │
│      │DENY│           │ALLOW│          │DENY│             │
│      │0.85│           │0.65 │          │0.75│             │
│      └────┘           └────┘           └────┘             │
│         │                 │                 │              │
│         └─────────┬───────┴─────────────────┘              │
│                   v                                        │
│            ┌─────────────┐                                 │
│            │   WEIGHTED  │                                 │
│            │    VOTE     │                                 │
│            └──────┬──────┘                                 │
│                   │                                        │
│                   v                                        │
│          Prediction: DENY (0.75 confidence)                │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           v
                  ┌────────────────┐
                  │ Confidence OK? │
                  └────────┬───────┘
                           │
                    ┌──────┴──────┐
                    │             │
            Yes (>0.85)      No (<0.85)
                    │             │
                    v             v
            ┌───────────┐   ┌──────────────┐
            │USE        │   │FALLBACK TO   │
            │PREDICTION │   │FULL POLICY   │
            │           │   │EVALUATION    │
            └───────────┘   └──────────────┘
```

---

## 8. Distributed Consensus

### 8.1 Two-Phase Commit for Policy Updates

```
Policy Update Workflow
──────────────────────

                        COORDINATOR
                             │
                             v
                    ┌────────────────┐
                    │ PHASE 1:       │
                    │ PREPARE        │
                    └────────┬───────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            v                v                v
        ┌───────┐        ┌───────┐        ┌───────┐
        │Node 1 │        │Node 2 │        │Node 3 │
        └───┬───┘        └───┬───┘        └───┬───┘
            │                │                │
            v                v                v
        Validate         Validate         Validate
        Policy           Policy           Policy
            │                │                │
            v                v                v
         ┌─────┐          ┌─────┐          ┌─────┐
         │ OK  │          │ OK  │          │ OK  │
         └──┬──┘          └──┬──┘          └──┬──┘
            │                │                │
            └────────────────┼────────────────┘
                             │
                             v
                      ┌──────────────┐
                      │ Quorum OK?   │
                      │ (2 of 3)     │
                      └──────┬───────┘
                             │
                         ┌───┴────┐
                        Yes       No
                         │        │
                         v        v
                    ┌────────┐  ┌──────┐
                    │PROCEED │  │ABORT │
                    └────┬───┘  └──────┘
                         │
                         v
                ┌────────────────┐
                │ PHASE 2:       │
                │ COMMIT         │
                └────────┬───────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        v                v                v
    ┌───────┐        ┌───────┐        ┌───────┐
    │Node 1 │        │Node 2 │        │Node 3 │
    └───┬───┘        └───┬───┘        └───┬───┘
        │                │                │
        v                v                v
    Apply            Apply            Apply
    Policy           Policy           Policy
        │                │                │
        v                v                v
     ┌──────┐         ┌──────┐         ┌──────┐
     │DONE  │         │DONE  │         │DONE  │
     └──┬───┘         └──┬───┘         └──┬───┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                         v
                  ┌─────────────┐
                  │ INVALIDATE  │
                  │   CACHES    │
                  └─────────────┘
```

---

## Conclusion

These visualizations provide a clear understanding of:

1. **Request Flow**: End-to-end processing pipeline
2. **Condition Evaluation**: Recursive algorithm with optimization
3. **Decision Trees**: Construction and traversal
4. **Caching**: Multi-level hierarchy
5. **Conflict Resolution**: Priority-based decision making
6. **Rate Limiting**: Sliding window algorithm
7. **ML Prediction**: Feature extraction and ensemble
8. **Distributed Consensus**: Two-phase commit protocol

Use these diagrams during implementation to ensure correct algorithm flow and to communicate the system design to stakeholders.
