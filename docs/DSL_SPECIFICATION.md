# LLM Policy Engine - DSL Specification

## Table of Contents
1. [Language Overview](#language-overview)
2. [Formal Grammar](#formal-grammar)
3. [Type System](#type-system)
4. [Built-in Functions](#built-in-functions)
5. [Example Policies](#example-policies)
6. [Best Practices](#best-practices)

---

## 1. Language Overview

### 1.1 Design Principles

The LLM Policy DSL is designed with the following principles:

1. **Declarative**: Express *what* policies enforce, not *how* to enforce them
2. **Type-Safe**: Static type checking prevents common errors
3. **Composable**: Policies can be combined and layered
4. **Human-Readable**: Non-technical stakeholders can read and understand policies
5. **Performance-Oriented**: Designed for efficient compilation and execution

### 1.2 File Format

Policy documents can be written in:
- **YAML**: Recommended for human-authored policies
- **JSON**: Recommended for machine-generated policies
- **TOML**: Alternative format with good readability

### 1.3 Basic Structure

```yaml
# Every policy document has this structure
policy:
  # Metadata section
  id: unique_policy_identifier
  version: semver_version
  priority: integer
  enabled: boolean
  description: string
  scope: optional_scope_definition

rules:
  # One or more named rules
  rule_name:
    condition: boolean_expression
    action: action_specification
    metadata: optional_metadata
```

---

## 2. Formal Grammar

### 2.1 Complete EBNF Grammar

```ebnf
(* Policy Document *)
PolicyDocument  ::= PolicySection RulesSection FunctionsSection?

PolicySection   ::= "policy" ":" PolicyMetadata

PolicyMetadata  ::= "{"
                    "id" ":" Identifier ","
                    "version" ":" Version ","
                    "priority" ":" Integer ","
                    "enabled" ":" Boolean ","
                    "description" ":" String
                    ("," PolicyOption)*
                    "}"

PolicyOption    ::= "scope" ":" Scope
                  | "cache_ttl" ":" Duration
                  | "tags" ":" StringArray
                  | "owner" ":" String

(* Rules Section *)
RulesSection    ::= "rules" ":" "{" Rule ("," Rule)* "}"

Rule            ::= Identifier ":" "{"
                    "condition" ":" Condition ","
                    "action" ":" Action
                    ("," "metadata" ":" RuleMetadata)?
                    "}"

(* Conditions *)
Condition       ::= LogicalExpr
                  | ComparisonExpr
                  | FunctionCall
                  | "(" Condition ")"

LogicalExpr     ::= Condition LogicalOp Condition
                  | UnaryLogicalOp Condition

LogicalOp       ::= "&&" | "||" | "and" | "or"
UnaryLogicalOp  ::= "!" | "not"

ComparisonExpr  ::= Accessor CompOp Value

CompOp          ::= "==" | "!=" | ">" | "<" | ">=" | "<="
                  | "in" | "not_in" | "matches" | "contains"
                  | "starts_with" | "ends_with"

Accessor        ::= Scope "." Path

Scope           ::= "request" | "context" | "metadata" | "response" | "env"

Path            ::= Identifier ("." Identifier | "[" Index "]")*

FunctionCall    ::= FunctionName "(" ArgumentList? ")"

ArgumentList    ::= Argument ("," Argument)*

Argument        ::= Value | Accessor | Condition

(* Actions *)
Action          ::= SimpleAction
                  | "modify" ":" ModifySpec
                  | "rate_limit" ":" RateLimitSpec
                  | "require_approval" ":" ApprovalSpec

SimpleAction    ::= "allow" | "deny" | "warn"

ModifySpec      ::= "{" ModifyOp ("," ModifyOp)* "}"

ModifyOp        ::= "set" ":" Path "=" Value
                  | "remove" ":" Path
                  | "append" ":" Path "=" Value
                  | "increment" ":" Path ("=" Integer)?

RateLimitSpec   ::= "{"
                    "max_requests" ":" Integer ","
                    "window" ":" Duration ","
                    "scope" ":" RateLimitScope
                    ("," RateLimitOption)*
                    "}"

RateLimitScope  ::= "user" | "organization" | "ip" | "global"
                  | "user_endpoint" | "user_model"

ApprovalSpec    ::= "{"
                    "approvers" ":" ApproverList ","
                    "timeout" ":" Duration
                    ("," ApprovalOption)*
                    "}"

ApproverList    ::= "[" Approver ("," Approver)* "]"

Approver        ::= "{" "role" ":" String "}"
                  | "{" "user" ":" String "}"
                  | "{" "group" ":" String "}"

(* Functions Section *)
FunctionsSection ::= "functions" ":" "{" Function ("," Function)* "}"

Function        ::= Identifier ":" "{"
                    "params" ":" StringArray ","
                    "implementation" ":" Implementation
                    "}"

Implementation  ::= "{"
                    "type" ":" ImplType ","
                    (ImplOption ",")*
                    "}"

ImplType        ::= "lookup" | "calculation" | "database_query"
                  | "http_call" | "ml_model" | "regex" | "custom"

(* Values and Types *)
Value           ::= String | Number | Boolean | Array | Object | Null

String          ::= '"' Character* '"'

Number          ::= Integer | Float

Integer         ::= ["-"] Digit+

Float           ::= ["-"] Digit+ "." Digit+ [("e"|"E") ["-"|"+"] Digit+]

Boolean         ::= "true" | "false"

Array           ::= "[" [Value ("," Value)*] "]"

Object          ::= "{" [KeyValue ("," KeyValue)*] "}"

KeyValue        ::= String ":" Value

Null            ::= "null"

(* Identifiers and Literals *)
Identifier      ::= Letter (Letter | Digit | "_")*

Version         ::= Integer "." Integer "." Integer ["-" Identifier]

Duration        ::= Integer TimeUnit

TimeUnit        ::= "s" | "m" | "h" | "d" | "w"

Index           ::= Integer | Identifier

(* Lexical *)
Letter          ::= [a-zA-Z]
Digit           ::= [0-9]
Character       ::= (* any Unicode character except " *)
```

### 2.2 Operator Precedence

From highest to lowest precedence:

1. `()` - Parentheses
2. `!`, `not` - Logical negation
3. `>`, `<`, `>=`, `<=` - Comparison
4. `==`, `!=` - Equality
5. `in`, `not_in`, `matches`, `contains` - Membership/pattern
6. `&&`, `and` - Logical AND
7. `||`, `or` - Logical OR

---

## 3. Type System

### 3.1 Primitive Types

```typescript
// Scalar types
type String = string;
type Integer = number;  // No fractional part
type Float = number;
type Boolean = boolean;
type Null = null;

// Composite types
type Array<T> = T[];
type Object = { [key: string]: Value };

// Union type for all values
type Value = String | Integer | Float | Boolean | Array<Value> | Object | Null;
```

### 3.2 Accessor Types

```typescript
// Request scope - data from the LLM request
type RequestScope = {
  model: {
    name: String;
    provider: String;
    version: String;
    capabilities: String[];
  };
  prompt: String;
  system_message?: String;
  max_tokens: Integer;
  temperature: Float;
  parameters: Object;
  endpoint: String;
  structured_input?: Object;
};

// Context scope - execution environment
type ContextScope = {
  user: {
    id: String;
    tier: String;
    authenticated: Boolean;
    roles: String[];
    permissions: String[];
  };
  organization: {
    id: String;
    name: String;
    tier: String;
    settings: Object;
  };
  client: {
    ip: String;
    user_agent: String;
    country: String;
    region: String;
  };
  environment: {
    timestamp: Integer;
    request_id: String;
    trace_id: String;
  };
};

// Metadata scope - additional data attached to request
type MetadataScope = Object;

// Response scope - available only for post-processing rules
type ResponseScope = {
  status: Integer;
  tokens_used: Integer;
  cost: Float;
  latency_ms: Integer;
  content: String;
};

// Environment scope - system configuration
type EnvScope = {
  region: String;
  deployment: String;
  feature_flags: Object;
};
```

### 3.3 Type Checking Rules

```typescript
// Type checking for comparison operators
interface ComparisonTypeRules {
  "==": (left: Value, right: Value) => boolean;  // Any types
  "!=": (left: Value, right: Value) => boolean;  // Any types
  ">": (left: Number, right: Number) => boolean;  // Numeric only
  "<": (left: Number, right: Number) => boolean;  // Numeric only
  ">=": (left: Number, right: Number) => boolean; // Numeric only
  "<=": (left: Number, right: Number) => boolean; // Numeric only
  "in": (left: Value, right: Array<Value>) => boolean;
  "not_in": (left: Value, right: Array<Value>) => boolean;
  "matches": (left: String, right: String) => boolean;  // Regex pattern
  "contains": (left: String | Array<Value>, right: Value) => boolean;
  "starts_with": (left: String, right: String) => boolean;
  "ends_with": (left: String, right: String) => boolean;
}
```

---

## 4. Built-in Functions

### 4.1 String Functions

```yaml
# String manipulation and analysis
functions:

  # Convert to lowercase
  ToLower:
    params: [text]
    returns: String
    example: ToLower("HELLO") => "hello"

  # Convert to uppercase
  ToUpper:
    params: [text]
    returns: String
    example: ToUpper("hello") => "HELLO"

  # Get string length
  Length:
    params: [text]
    returns: Integer
    example: Length("hello") => 5

  # Check if string contains substring
  Contains:
    params: [text, substring]
    returns: Boolean
    example: Contains("hello world", "world") => true

  # Extract substring
  Substring:
    params: [text, start, length?]
    returns: String
    example: Substring("hello", 1, 3) => "ell"

  # Match regex pattern
  RegexMatch:
    params: [text, pattern]
    returns: Boolean
    example: RegexMatch("test@example.com", "^[a-z]+@[a-z]+\\.[a-z]+$") => true

  # Extract regex groups
  RegexExtract:
    params: [text, pattern, group?]
    returns: String | Array<String>
    example: RegexExtract("user:123", "user:(\\d+)", 1) => "123"

  # Replace string
  Replace:
    params: [text, pattern, replacement]
    returns: String
    example: Replace("hello world", "world", "there") => "hello there"
```

### 4.2 Numeric Functions

```yaml
functions:

  # Mathematical operations
  Add:
    params: [a, b]
    returns: Number
    example: Add(5, 3) => 8

  Subtract:
    params: [a, b]
    returns: Number
    example: Subtract(5, 3) => 2

  Multiply:
    params: [a, b]
    returns: Number
    example: Multiply(5, 3) => 15

  Divide:
    params: [a, b]
    returns: Float
    example: Divide(10, 3) => 3.333...

  Modulo:
    params: [a, b]
    returns: Number
    example: Modulo(10, 3) => 1

  # Rounding
  Round:
    params: [n, decimals?]
    returns: Number
    example: Round(3.14159, 2) => 3.14

  Floor:
    params: [n]
    returns: Integer
    example: Floor(3.7) => 3

  Ceil:
    params: [n]
    returns: Integer
    example: Ceil(3.2) => 4

  # Aggregations
  Sum:
    params: [numbers]
    returns: Number
    example: Sum([1, 2, 3, 4]) => 10

  Average:
    params: [numbers]
    returns: Float
    example: Average([1, 2, 3, 4]) => 2.5

  Min:
    params: [numbers]
    returns: Number
    example: Min([3, 1, 4, 1, 5]) => 1

  Max:
    params: [numbers]
    returns: Number
    example: Max([3, 1, 4, 1, 5]) => 5
```

### 4.3 Array Functions

```yaml
functions:

  # Get array length
  ArrayLength:
    params: [array]
    returns: Integer
    example: ArrayLength([1, 2, 3]) => 3

  # Check if array contains value
  ArrayContains:
    params: [array, value]
    returns: Boolean
    example: ArrayContains([1, 2, 3], 2) => true

  # Filter array
  ArrayFilter:
    params: [array, predicate]
    returns: Array
    example: ArrayFilter([1, 2, 3, 4], x => x > 2) => [3, 4]

  # Map array
  ArrayMap:
    params: [array, transform]
    returns: Array
    example: ArrayMap([1, 2, 3], x => x * 2) => [2, 4, 6]

  # Get array element
  ArrayGet:
    params: [array, index]
    returns: Value
    example: ArrayGet([1, 2, 3], 1) => 2

  # Check if any element matches
  ArrayAny:
    params: [array, predicate]
    returns: Boolean
    example: ArrayAny([1, 2, 3], x => x > 5) => false

  # Check if all elements match
  ArrayAll:
    params: [array, predicate]
    returns: Boolean
    example: ArrayAll([1, 2, 3], x => x > 0) => true
```

### 4.4 Date/Time Functions

```yaml
functions:

  # Get current timestamp
  Now:
    params: []
    returns: Integer
    example: Now() => 1699564800

  # Parse date string
  ParseDate:
    params: [date_string, format?]
    returns: Integer
    example: ParseDate("2024-01-15", "YYYY-MM-DD") => 1705276800

  # Format timestamp
  FormatDate:
    params: [timestamp, format?]
    returns: String
    example: FormatDate(1705276800, "YYYY-MM-DD") => "2024-01-15"

  # Get hour of day
  HourOfDay:
    params: [timestamp?]
    returns: Integer
    example: HourOfDay() => 14  # 2 PM

  # Get day of week
  DayOfWeek:
    params: [timestamp?]
    returns: Integer
    example: DayOfWeek() => 1  # Monday

  # Check if weekend
  IsWeekend:
    params: [timestamp?]
    returns: Boolean
    example: IsWeekend() => false

  # Add duration to timestamp
  AddDuration:
    params: [timestamp, duration]
    returns: Integer
    example: AddDuration(Now(), "1h") => Now() + 3600

  # Check if timestamp is in range
  InTimeRange:
    params: [timestamp, start_time, end_time]
    returns: Boolean
    example: InTimeRange(Now(), "09:00", "17:00") => true
```

### 4.5 Policy-Specific Functions

```yaml
functions:

  # Estimate request cost
  EstimateRequestCost:
    params: [request]
    returns: Float
    description: Calculate estimated cost based on model and tokens
    example: EstimateRequestCost(request) => 0.05

  # Get user's recent request count
  GetRequestCount:
    params: [user_id, window]
    returns: Integer
    description: Count requests in time window
    example: GetRequestCount(context.user.id, "1h") => 42

  # Get token usage
  GetTokenUsage:
    params: [user_id, window]
    returns: Integer
    description: Sum of tokens used in window
    example: GetTokenUsage(context.user.id, "24h") => 50000

  # Get error rate
  GetErrorRate:
    params: [user_id, window]
    returns: Float
    description: Percentage of requests that errored
    example: GetErrorRate(context.user.id, "1h") => 0.02

  # Check if IP is suspicious
  IsIPSuspicious:
    params: [ip_address]
    returns: Boolean
    description: Check against threat intelligence
    example: IsIPSuspicious(context.client.ip) => false

  # Get IP reputation score
  GetIPReputation:
    params: [ip_address]
    returns: Integer
    description: Reputation score 0-100
    example: GetIPReputation(context.client.ip) => 85

  # Detect PII in text
  ContainsPII:
    params: [text]
    returns: Boolean
    description: ML-based PII detection
    example: ContainsPII(request.prompt) => false

  # Redact PII from text
  RedactPII:
    params: [text]
    returns: String
    description: Replace PII with placeholders
    example: RedactPII("Email: john@example.com") => "Email: [EMAIL]"

  # Check for prompt injection
  ContainsPromptInjection:
    params: [text]
    returns: Boolean
    description: Detect prompt injection attempts
    example: ContainsPromptInjection(request.prompt) => false

  # Get spending this period
  GetPeriodSpending:
    params: [user_id, period]
    returns: Float
    description: Total spending in period (day/week/month)
    example: GetPeriodSpending(context.user.id, "day") => 12.50
```

---

## 5. Example Policies

### 5.1 Simple Cost Control

```yaml
policy:
  id: simple_cost_control
  version: 1.0.0
  priority: 100
  enabled: true
  description: Basic cost control for all users

rules:
  # Block very expensive requests
  block_expensive:
    condition: EstimateRequestCost(request) > 10.0
    action: deny
    metadata:
      reason: Request exceeds maximum cost limit of $10
      severity: high

  # Warn on moderately expensive requests
  warn_moderate:
    condition: EstimateRequestCost(request) > 1.0
    action: warn
    metadata:
      message: This request will cost approximately ${{EstimateRequestCost(request)}}
      severity: medium
```

### 5.2 Tiered Rate Limiting

```yaml
policy:
  id: tiered_rate_limiting
  version: 1.0.0
  priority: 50
  enabled: true
  description: Different rate limits for different user tiers

rules:
  # Free tier - 10 requests per hour
  rate_limit_free:
    condition: |
      context.user.tier == "free" &&
      GetRequestCount(context.user.id, "1h") >= 10
    action:
      rate_limit:
        max_requests: 10
        window: 1h
        scope: user
    metadata:
      description: Free tier rate limit
      upgrade_message: Upgrade to Pro for 1000 requests/hour

  # Pro tier - 1000 requests per hour
  rate_limit_pro:
    condition: |
      context.user.tier == "pro" &&
      GetRequestCount(context.user.id, "1h") >= 1000
    action:
      rate_limit:
        max_requests: 1000
        window: 1h
        scope: user
    metadata:
      description: Pro tier rate limit

  # Enterprise - no rate limit (just monitoring)
  monitor_enterprise:
    condition: |
      context.user.tier == "enterprise" &&
      GetRequestCount(context.user.id, "1h") > 10000
    action: warn
    metadata:
      message: Unusually high usage detected
      severity: low
```

### 5.3 Advanced Security Policy

```yaml
policy:
  id: advanced_security
  version: 2.1.0
  priority: 200
  enabled: true
  description: Comprehensive security controls
  tags: [security, compliance]

rules:
  # Block prompt injection attempts
  block_injection:
    condition: |
      ContainsPromptInjection(request.prompt) ||
      (request.system_message != null &&
       ContainsPromptInjection(request.system_message))
    action: deny
    metadata:
      description: Prompt injection attack detected
      severity: critical
      reason: |
        Request blocked due to potential prompt injection.
        If this is a false positive, please contact support.

  # Redact PII automatically
  auto_redact_pii:
    condition: ContainsPII(request.prompt)
    action:
      modify:
        - set: request.prompt = RedactPII(request.prompt)
        - set: metadata.pii_redacted = true
    metadata:
      description: Automatic PII redaction
      severity: high

  # Block suspicious IPs
  block_suspicious_ip:
    condition: |
      GetIPReputation(context.client.ip) < 30 ||
      IsIPSuspicious(context.client.ip)
    action: deny
    metadata:
      description: Request from suspicious IP address
      severity: high
      reason: IP address flagged by threat intelligence

  # Require approval for sensitive operations
  approval_for_sensitive:
    condition: |
      request.metadata.sensitivity == "high" ||
      Contains(ToLower(request.prompt), "confidential")
    action:
      require_approval:
        approvers:
          - role: security_admin
          - role: compliance_officer
        timeout: 1h
    metadata:
      description: Sensitive request requires approval
      severity: medium

  # Rate limit on authentication failures
  rate_limit_on_failures:
    condition: |
      !context.user.authenticated &&
      GetErrorRate(context.client.ip, "5m") > 0.5
    action:
      rate_limit:
        max_requests: 5
        window: 15m
        scope: ip
    metadata:
      description: Rate limit due to high error rate
      severity: high
```

### 5.4 Business Hours Policy

```yaml
policy:
  id: business_hours_control
  version: 1.0.0
  priority: 75
  enabled: true
  description: Different behavior during/outside business hours

rules:
  # Outside business hours - reduce limits
  after_hours_limit:
    condition: |
      HourOfDay() < 9 || HourOfDay() >= 17 ||
      IsWeekend()
    action:
      modify:
        - set: request.max_tokens = Min(request.max_tokens, 1000)
        - set: metadata.business_hours = false
    metadata:
      description: Reduced limits outside business hours
      message: |
        Outside business hours (9 AM - 5 PM weekdays).
        Max tokens limited to 1000.

  # Weekend warnings
  weekend_warning:
    condition: IsWeekend()
    action: warn
    metadata:
      message: |
        Processing on weekends may have reduced support availability.
        For urgent issues, contact on-call support.
      severity: low
```

### 5.5 Compliance Policy (GDPR)

```yaml
policy:
  id: gdpr_compliance
  version: 1.0.0
  priority: 250
  enabled: true
  description: GDPR compliance enforcement
  tags: [compliance, gdpr, privacy]

rules:
  # Require DPA for EU users
  require_dpa_eu:
    condition: |
      context.client.country in ["DE", "FR", "IT", "ES", "NL", "BE",
                                  "AT", "SE", "PL", "IE", "DK", "FI"] &&
      !HasDataProcessingAgreement(context.organization.id)
    action: deny
    metadata:
      description: GDPR DPA required
      severity: critical
      reason: |
        GDPR requires a Data Processing Agreement for EU users.
        Contact compliance@company.com to set up DPA.
      regulation: Article 28 GDPR

  # Enforce data residency
  enforce_eu_residency:
    condition: |
      context.organization.data_residency == "EU" &&
      request.model.region != "EU"
    action:
      modify:
        - set: request.model.region = "EU"
    metadata:
      description: Enforce EU data residency
      severity: high
      regulation: Article 44 GDPR

  # Block training on EU user data
  no_training_eu:
    condition: |
      context.client.country in ["DE", "FR", "IT", "ES", "NL", "BE",
                                  "AT", "SE", "PL", "IE", "DK", "FI"]
    action:
      modify:
        - set: request.allow_training = false
        - set: request.store_conversation = false
    metadata:
      description: GDPR - No training on EU user data
      severity: high
      regulation: Article 6, Article 9 GDPR

  # Automatic data deletion
  set_retention_policy:
    condition: |
      context.client.country in ["DE", "FR", "IT", "ES", "NL", "BE",
                                  "AT", "SE", "PL", "IE", "DK", "FI"]
    action:
      modify:
        - set: metadata.retention_days = 30
        - set: metadata.auto_delete = true
    metadata:
      description: GDPR - Automatic deletion after 30 days
      severity: medium
      regulation: Article 5 GDPR (storage limitation)
```

### 5.6 Model Routing Policy

```yaml
policy:
  id: smart_model_routing
  version: 1.0.0
  priority: 60
  enabled: true
  description: Route requests to appropriate models based on characteristics

rules:
  # Route simple queries to cheaper models
  route_simple_to_cheap:
    condition: |
      Length(request.prompt) < 500 &&
      request.max_tokens <= 100 &&
      !Contains(ToLower(request.prompt), "complex") &&
      !Contains(ToLower(request.prompt), "analyze")
    action:
      modify:
        - set: request.model.name = "gpt-3.5-turbo"
    metadata:
      description: Route simple queries to cost-effective model
      estimated_savings: 80%

  # Route code generation to specialized model
  route_code_generation:
    condition: |
      Contains(ToLower(request.prompt), "code") ||
      Contains(ToLower(request.prompt), "function") ||
      Contains(ToLower(request.prompt), "implement") ||
      RegexMatch(request.prompt, "```")
    action:
      modify:
        - set: request.model.name = "gpt-4-code"
    metadata:
      description: Route code requests to code-specialized model

  # Route long context to appropriate model
  route_long_context:
    condition: Length(request.prompt) > 10000
    action:
      modify:
        - set: request.model.name = "claude-opus-3"
    metadata:
      description: Route long-context requests to capable model

  # Fallback to default
  default_routing:
    condition: request.model.name == null
    action:
      modify:
        - set: request.model.name = "gpt-4"
    metadata:
      description: Default model selection
```

---

## 6. Best Practices

### 6.1 Policy Organization

```yaml
# Good: Organized by concern
# cost_policies.yaml
policy:
  id: cost_policies
  description: All cost-related policies

# security_policies.yaml
policy:
  id: security_policies
  description: All security-related policies

# compliance_policies.yaml
policy:
  id: compliance_policies
  description: All compliance-related policies
```

### 6.2 Rule Naming

```yaml
rules:
  # Good: Descriptive, action-oriented names
  block_expensive_models_for_free_tier:
    condition: ...

  warn_on_high_token_usage:
    condition: ...

  require_approval_for_sensitive_data:
    condition: ...

  # Bad: Vague names
  rule1:
    condition: ...

  check:
    condition: ...
```

### 6.3 Condition Clarity

```yaml
rules:
  # Good: Clear, readable condition
  block_unauthorized_models:
    condition: |
      context.user.tier == "free" &&
      request.model.name in ["gpt-4", "claude-opus-3"]
    action: deny

  # Bad: Complex, hard to understand
  check_access:
    condition: |
      (context.user.tier == "free" &&
       (request.model.name == "gpt-4" ||
        request.model.name == "claude-opus-3")) ||
      (context.user.tier == "pro" &&
       request.model.name == "some-model" &&
       GetRequestCount(context.user.id, "1h") > 100)
    action: deny

  # Better: Split into multiple rules
  block_premium_models_free:
    condition: |
      context.user.tier == "free" &&
      request.model.name in ["gpt-4", "claude-opus-3"]
    action: deny

  rate_limit_pro_special:
    condition: |
      context.user.tier == "pro" &&
      request.model.name == "some-model" &&
      GetRequestCount(context.user.id, "1h") > 100
    action: deny
```

### 6.4 Documentation

```yaml
rules:
  enforce_budget:
    condition: GetDailySpend(context.user.id) >= GetDailyBudget(context.user.tier)
    action: deny
    metadata:
      description: Enforce daily spending budget
      severity: high
      reason: |
        Daily budget limit reached.
        Current spend: ${{GetDailySpend(context.user.id)}}
        Daily limit: ${{GetDailyBudget(context.user.tier)}}
        Budget resets at midnight UTC.
      contact: billing@company.com
      documentation: https://docs.company.com/billing/budgets
```

### 6.5 Performance Optimization

```yaml
# Good: Most selective conditions first
rules:
  # This rule is very selective (few users are free tier)
  free_tier_limit:
    condition: context.user.tier == "free"
    action: ...

  # This rule is less selective (many requests are GET)
  rate_limit_reads:
    condition: request.method == "GET"
    action: ...

# Good: Cache expensive function results
functions:
  GetDailySpend:
    params: [user_id]
    implementation:
      type: database_query
      cache_ttl: 5m  # Cache for 5 minutes
      query: SELECT SUM(cost) FROM requests WHERE ...
```

### 6.6 Testing Policies

```yaml
# Include test cases in policy metadata
policy:
  id: cost_control
  version: 1.0.0
  test_cases:
    - name: "Block expensive request"
      input:
        request:
          model: {name: "gpt-4"}
          max_tokens: 100000
      expected:
        action: deny
        rule: block_expensive_requests

    - name: "Allow cheap request"
      input:
        request:
          model: {name: "gpt-3.5-turbo"}
          max_tokens: 100
      expected:
        action: allow
```

---

## Appendix A: Reserved Keywords

The following keywords are reserved and cannot be used as identifiers:

```
policy, rules, functions, condition, action, metadata
allow, deny, warn, require_approval, modify, rate_limit
and, or, not, in, not_in, matches, contains
true, false, null
request, context, response, env
set, remove, append, increment
```

---

## Appendix B: Standard Error Codes

```yaml
error_codes:
  PARSE_ERROR: "Syntax error in policy document"
  TYPE_ERROR: "Type mismatch in expression"
  UNDEFINED_FUNCTION: "Function not defined"
  UNDEFINED_ACCESSOR: "Accessor path not found"
  INVALID_OPERATOR: "Operator not supported for type"
  CIRCULAR_DEPENDENCY: "Circular dependency in policy rules"
  CONFLICTING_RULES: "Rules have conflicting actions"
  INVALID_REGEX: "Invalid regular expression pattern"
  EVALUATION_TIMEOUT: "Rule evaluation exceeded timeout"
```

---

## Conclusion

This DSL specification provides a complete, formal definition of the LLM Policy Engine's policy language. The grammar is designed to be:

- **Expressive**: Can represent complex policy logic
- **Type-safe**: Static type checking prevents errors
- **Readable**: Natural syntax for policy authors
- **Efficient**: Designed for fast compilation and execution
- **Extensible**: Easy to add new functions and operators
