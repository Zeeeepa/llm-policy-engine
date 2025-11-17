# LLM-Policy-Engine: Algorithms and Pseudocode Specification

## Table of Contents
1. [Policy DSL Syntax and Grammar](#policy-dsl-syntax-and-grammar)
2. [Core Algorithms](#core-algorithms)
3. [Data Flow Architecture](#data-flow-architecture)
4. [Example Policy Documents](#example-policy-documents)
5. [Performance Optimization Strategies](#performance-optimization-strategies)

---

## 1. Policy DSL Syntax and Grammar

### 1.1 DSL Grammar Definition (EBNF)

```ebnf
# Top-level policy document structure
Policy          ::= PolicyMetadata RuleSet

PolicyMetadata  ::= "policy" PolicyID "{"
                    "version:" Version
                    "priority:" Integer
                    "enabled:" Boolean
                    "description:" String
                    "}"

RuleSet         ::= "rules" "{" Rule+ "}"

Rule            ::= RuleID "{"
                    "condition:" Condition
                    "action:" Action
                    "metadata:" RuleMetadata?
                    "}"

# Condition expressions
Condition       ::= LogicalExpr | ComparisonExpr | FunctionCall | "(" Condition ")"

LogicalExpr     ::= Condition ("&&" | "||" | "!") Condition

ComparisonExpr  ::= Accessor Operator Value

Accessor        ::= "request." Path
                  | "context." Path
                  | "metadata." Path
                  | "response." Path

Operator        ::= "==" | "!=" | ">" | "<" | ">=" | "<="
                  | "in" | "not_in" | "matches" | "contains"

Value           ::= String | Number | Boolean | Array | Variable

FunctionCall    ::= FunctionName "(" ArgList? ")"

# Actions
Action          ::= "allow" | "deny" | "warn" | "require_approval"
                  | "modify" ModifySpec | "rate_limit" RateLimitSpec

ModifySpec      ::= "{" ModifyOperation+ "}"

ModifyOperation ::= "set:" Path "=" Value
                  | "remove:" Path
                  | "append:" Path "=" Value

RateLimitSpec   ::= "{"
                    "max_requests:" Integer
                    "window:" Duration
                    "scope:" Scope
                    "}"

# Metadata and utilities
RuleMetadata    ::= "{"
                    "description:" String
                    "severity:" Severity
                    "tags:" StringArray
                    "}"

Severity        ::= "critical" | "high" | "medium" | "low" | "info"

Path            ::= Identifier ("." Identifier | "[" Index "]")*

PolicyID        ::= Identifier
RuleID          ::= Identifier
FunctionName    ::= Identifier
Identifier      ::= [a-zA-Z_][a-zA-Z0-9_]*
Integer         ::= [0-9]+
Duration        ::= Integer ("s" | "m" | "h" | "d")
```

### 1.2 Type System

```typescript
// Type definitions for policy DSL
type PolicyDocument = {
  policy: {
    id: string;
    version: string;
    priority: number;
    enabled: boolean;
    description: string;
  };
  rules: Rule[];
};

type Rule = {
  id: string;
  condition: Condition;
  action: Action;
  metadata?: RuleMetadata;
};

type Condition =
  | LogicalCondition
  | ComparisonCondition
  | FunctionCondition;

type LogicalCondition = {
  type: 'and' | 'or' | 'not';
  operands: Condition[];
};

type ComparisonCondition = {
  type: 'comparison';
  left: Accessor;
  operator: ComparisonOperator;
  right: Value;
};

type Accessor = {
  scope: 'request' | 'context' | 'metadata' | 'response';
  path: string[];
};

type Action =
  | { type: 'allow' }
  | { type: 'deny'; reason?: string }
  | { type: 'warn'; message: string }
  | { type: 'require_approval'; approvers: string[] }
  | { type: 'modify'; operations: ModifyOperation[] }
  | { type: 'rate_limit'; spec: RateLimitSpec };

type Value = string | number | boolean | Value[] | null;
```

---

## 2. Core Algorithms

### 2.1 Policy Parser

```pseudocode
ALGORITHM ParsePolicy(policyText: String) -> Result<PolicyDocument, ParseError>
INPUT: policyText - Raw policy document as string
OUTPUT: Parsed and validated PolicyDocument or ParseError

PROCEDURE:
  1. Initialize tokenizer with policyText
  2. tokens ← Tokenize(policyText)
  3.
  4. // Lexical analysis
  5. IF tokens contains syntax errors THEN
  6.   RETURN ParseError(line, column, "Invalid syntax")
  7. END IF
  8.
  9. // Parse metadata section
 10. metadata ← ParsePolicyMetadata(tokens)
 11. IF metadata is invalid THEN
 12.   RETURN ParseError("Invalid policy metadata")
 13. END IF
 14.
 15. // Validate version format
 16. IF NOT IsValidSemVer(metadata.version) THEN
 17.   RETURN ParseError("Invalid version format")
 18. END IF
 19.
 20. // Parse rules section
 21. rules ← []
 22. WHILE hasNextRule(tokens) DO
 23.   rule ← ParseRule(tokens)
 24.
 25.   // Validate rule structure
 26.   IF rule.condition is invalid THEN
 27.     RETURN ParseError("Invalid condition in rule " + rule.id)
 28.   END IF
 29.
 30.   IF rule.action is invalid THEN
 31.     RETURN ParseError("Invalid action in rule " + rule.id)
 32.   END IF
 33.
 34.   // Type check condition expressions
 35.   typeCheckResult ← TypeCheckCondition(rule.condition)
 36.   IF typeCheckResult is error THEN
 37.     RETURN ParseError("Type error: " + typeCheckResult.message)
 38.   END IF
 39.
 40.   rules.append(rule)
 41. END WHILE
 42.
 43. // Build abstract syntax tree
 44. policyDoc ← {
 45.   policy: metadata,
 46.   rules: rules
 47. }
 48.
 49. // Perform semantic validation
 50. validationErrors ← ValidatePolicy(policyDoc)
 51. IF validationErrors is not empty THEN
 52.   RETURN ParseError(validationErrors)
 53. END IF
 54.
 55. RETURN Success(policyDoc)
END ALGORITHM


ALGORITHM ParseRule(tokens: TokenStream) -> Rule
INPUT: tokens - Stream of lexical tokens
OUTPUT: Parsed Rule object

PROCEDURE:
  1. EXPECT token.type == "RULE_ID"
  2. ruleId ← token.value
  3. ADVANCE tokens
  4.
  5. EXPECT token.value == "{"
  6. ADVANCE tokens
  7.
  8. // Parse condition
  9. EXPECT token.value == "condition:"
 10. ADVANCE tokens
 11. condition ← ParseCondition(tokens)
 12.
 13. // Parse action
 14. EXPECT token.value == "action:"
 15. ADVANCE tokens
 16. action ← ParseAction(tokens)
 17.
 18. // Parse optional metadata
 19. metadata ← NULL
 20. IF current_token.value == "metadata:" THEN
 21.   ADVANCE tokens
 22.   metadata ← ParseRuleMetadata(tokens)
 23. END IF
 24.
 25. EXPECT token.value == "}"
 26. ADVANCE tokens
 27.
 28. RETURN {
 29.   id: ruleId,
 30.   condition: condition,
 31.   action: action,
 32.   metadata: metadata
 33. }
END ALGORITHM


ALGORITHM ParseCondition(tokens: TokenStream) -> Condition
INPUT: tokens - Stream of lexical tokens
OUTPUT: Condition AST node

PROCEDURE:
  1. // Parse primary expression
  2. left ← ParsePrimary(tokens)
  3.
  4. // Check for binary operators
  5. IF current_token.type == "LOGICAL_OP" THEN
  6.   operator ← current_token.value  // "&&", "||"
  7.   ADVANCE tokens
  8.   right ← ParseCondition(tokens)  // Right-associative recursion
  9.   RETURN {
 10.     type: operator == "&&" ? "and" : "or",
 11.     operands: [left, right]
 12.   }
 13. END IF
 14.
 15. RETURN left
END ALGORITHM


ALGORITHM ParsePrimary(tokens: TokenStream) -> Condition
INPUT: tokens - Stream of lexical tokens
OUTPUT: Primary condition expression

PROCEDURE:
  1. IF current_token.value == "!" THEN
  2.   ADVANCE tokens
  3.   operand ← ParsePrimary(tokens)
  4.   RETURN { type: "not", operands: [operand] }
  5. END IF
  6.
  7. IF current_token.value == "(" THEN
  8.   ADVANCE tokens
  9.   expr ← ParseCondition(tokens)
 10.   EXPECT current_token.value == ")"
 11.   ADVANCE tokens
 12.   RETURN expr
 13. END IF
 14.
 15. // Parse accessor (request.*, context.*, etc.)
 16. accessor ← ParseAccessor(tokens)
 17.
 18. // Parse comparison operator
 19. EXPECT current_token.type == "COMPARISON_OP"
 20. operator ← current_token.value
 21. ADVANCE tokens
 22.
 23. // Parse value
 24. value ← ParseValue(tokens)
 25.
 26. RETURN {
 27.   type: "comparison",
 28.   left: accessor,
 29.   operator: operator,
 30.   right: value
 31. }
END ALGORITHM
```

### 2.2 Rule Evaluation Engine

```pseudocode
ALGORITHM EvaluatePolicy(policyDoc: PolicyDocument, context: RequestContext)
  -> PolicyDecision

INPUT:
  - policyDoc: Parsed policy document
  - context: Current request context with all available data
OUTPUT:
  - PolicyDecision with action and reasoning

PROCEDURE:
  1. // Initialize evaluation context
  2. evalContext ← {
  3.   request: context.request,
  4.   metadata: context.metadata,
  5.   context: context.environment,
  6.   timestamp: NOW(),
  7.   evaluationTrace: []
  8. }
  9.
 10. // Sort rules by priority (if specified in metadata)
 11. sortedRules ← SORT(policyDoc.rules, BY rule.metadata.priority DESC)
 12.
 13. // Evaluate rules in order
 14. FOR EACH rule IN sortedRules DO
 15.
 16.   // Add trace entry
 17.   evalContext.evaluationTrace.append({
 18.     ruleId: rule.id,
 19.     startTime: NOW()
 20.   })
 21.
 22.   // Evaluate condition
 23.   conditionResult ← EvaluateCondition(rule.condition, evalContext)
 24.
 25.   // Record condition result
 26.   currentTrace ← evalContext.evaluationTrace[LAST]
 27.   currentTrace.conditionResult = conditionResult
 28.   currentTrace.endTime = NOW()
 29.
 30.   IF conditionResult.matched THEN
 31.     // Rule condition matched - execute action
 32.     decision ← ExecuteAction(rule.action, evalContext)
 33.
 34.     currentTrace.actionExecuted = rule.action.type
 35.     currentTrace.decision = decision
 36.
 37.     // Check if action is terminal (deny, allow with no warnings)
 38.     IF IsTerminalAction(decision) THEN
 39.       RETURN {
 40.         action: decision.action,
 41.         reason: decision.reason,
 42.         matchedRule: rule.id,
 43.         evaluationTrace: evalContext.evaluationTrace,
 44.         modifiedRequest: decision.modifiedRequest
 45.       }
 46.     END IF
 47.
 48.     // For non-terminal actions (warn, modify), continue evaluation
 49.     IF decision.action == "modify" THEN
 50.       ApplyModifications(evalContext.request, decision.modifications)
 51.     END IF
 52.
 53.     IF decision.action == "warn" THEN
 54.       evalContext.warnings.append(decision.message)
 55.     END IF
 56.   END IF
 57. END FOR
 58.
 59. // No rules matched or only non-terminal actions
 60. RETURN {
 61.   action: "allow",
 62.   reason: "No blocking rules matched",
 63.   evaluationTrace: evalContext.evaluationTrace,
 64.   warnings: evalContext.warnings
 65. }
END ALGORITHM


ALGORITHM EvaluateCondition(condition: Condition, context: EvalContext)
  -> ConditionResult

INPUT:
  - condition: Condition AST node
  - context: Evaluation context with request data
OUTPUT:
  - ConditionResult with matched status and details

PROCEDURE:
  1. SWITCH condition.type
  2.
  3.   CASE "and":
  4.     FOR EACH operand IN condition.operands DO
  5.       result ← EvaluateCondition(operand, context)
  6.       IF NOT result.matched THEN
  7.         RETURN {
  8.           matched: FALSE,
  9.           reason: "AND clause failed: " + result.reason
 10.         }
 11.       END IF
 12.     END FOR
 13.     RETURN { matched: TRUE }
 14.
 15.   CASE "or":
 16.     FOR EACH operand IN condition.operands DO
 17.       result ← EvaluateCondition(operand, context)
 18.       IF result.matched THEN
 19.         RETURN { matched: TRUE }
 20.       END IF
 21.     END FOR
 22.     RETURN {
 23.       matched: FALSE,
 24.       reason: "No OR clause matched"
 25.     }
 26.
 27.   CASE "not":
 28.     result ← EvaluateCondition(condition.operands[0], context)
 29.     RETURN {
 30.       matched: NOT result.matched,
 31.       reason: "NOT " + result.reason
 32.     }
 33.
 34.   CASE "comparison":
 35.     leftValue ← ResolveAccessor(condition.left, context)
 36.     rightValue ← ResolveValue(condition.right, context)
 37.
 38.     matched ← ApplyOperator(
 39.       leftValue,
 40.       condition.operator,
 41.       rightValue
 42.     )
 43.
 44.     RETURN {
 45.       matched: matched,
 46.       reason: FORMAT("{} {} {}", condition.left, condition.operator, condition.right),
 47.       leftValue: leftValue,
 48.       rightValue: rightValue
 49.     }
 50.
 51.   CASE "function":
 52.     result ← ExecuteFunction(condition.function, condition.args, context)
 53.     RETURN {
 54.       matched: result,
 55.       reason: FORMAT("Function {} returned {}", condition.function, result)
 56.     }
 57.
 58.   DEFAULT:
 59.     THROW Error("Unknown condition type: " + condition.type)
 60.
 61. END SWITCH
END ALGORITHM


ALGORITHM ResolveAccessor(accessor: Accessor, context: EvalContext) -> Value
INPUT:
  - accessor: Path to data in context (e.g., "request.model.name")
  - context: Evaluation context
OUTPUT:
  - Resolved value or NULL

PROCEDURE:
  1. // Start at the appropriate scope
  2. current ← SWITCH accessor.scope
  3.   CASE "request": context.request
  4.   CASE "context": context.context
  5.   CASE "metadata": context.metadata
  6.   CASE "response": context.response
  7.   DEFAULT: THROW Error("Invalid scope: " + accessor.scope)
  8. END SWITCH
  9.
 10. // Traverse the path
 11. FOR EACH segment IN accessor.path DO
 12.   IF current is NULL THEN
 13.     RETURN NULL
 14.   END IF
 15.
 16.   IF segment is array index THEN
 17.     index ← ParseInt(segment)
 18.     IF current is not Array OR index >= current.length THEN
 19.       RETURN NULL
 20.     END IF
 21.     current ← current[index]
 22.   ELSE
 23.     IF current is not Object OR NOT current.hasProperty(segment) THEN
 24.       RETURN NULL
 25.     END IF
 26.     current ← current[segment]
 27.   END IF
 28. END FOR
 29.
 30. RETURN current
END ALGORITHM


ALGORITHM ApplyOperator(left: Value, operator: String, right: Value) -> Boolean
INPUT:
  - left: Left operand value
  - operator: Comparison operator
  - right: Right operand value
OUTPUT:
  - Boolean result of comparison

PROCEDURE:
  1. SWITCH operator
  2.   CASE "==":
  3.     RETURN left == right
  4.
  5.   CASE "!=":
  6.     RETURN left != right
  7.
  8.   CASE ">":
  9.     RETURN ToNumber(left) > ToNumber(right)
 10.
 11.   CASE "<":
 12.     RETURN ToNumber(left) < ToNumber(right)
 13.
 14.   CASE ">=":
 15.     RETURN ToNumber(left) >= ToNumber(right)
 16.
 17.   CASE "<=":
 18.     RETURN ToNumber(left) <= ToNumber(right)
 19.
 20.   CASE "in":
 21.     IF right is not Array THEN
 22.       RETURN FALSE
 23.     END IF
 24.     RETURN right.contains(left)
 25.
 26.   CASE "not_in":
 27.     IF right is not Array THEN
 28.       RETURN TRUE
 29.     END IF
 30.     RETURN NOT right.contains(left)
 31.
 32.   CASE "matches":
 33.     regex ← CompileRegex(right)
 34.     RETURN regex.test(ToString(left))
 35.
 36.   CASE "contains":
 37.     IF left is Array THEN
 38.       RETURN left.contains(right)
 39.     ELSE IF left is String THEN
 40.       RETURN left.includes(ToString(right))
 41.     ELSE
 42.       RETURN FALSE
 43.     END IF
 44.
 45.   DEFAULT:
 46.     THROW Error("Unknown operator: " + operator)
 47. END SWITCH
END ALGORITHM
```

### 2.3 Decision Tree Traversal

```pseudocode
ALGORITHM BuildDecisionTree(policies: PolicyDocument[]) -> DecisionTree
INPUT: Array of policy documents
OUTPUT: Optimized decision tree for fast evaluation

PROCEDURE:
  1. // Collect all unique condition paths
  2. conditionPaths ← SET()
  3. FOR EACH policy IN policies DO
  4.     FOR EACH rule IN policy.rules DO
  5.         paths ← ExtractConditionPaths(rule.condition)
  6.         conditionPaths.addAll(paths)
  7.     END FOR
  8. END FOR
  9.
 10. // Analyze condition frequency and selectivity
 11. pathStats ← MAP()
 12. FOR EACH path IN conditionPaths DO
 13.     pathStats[path] = {
 14.         frequency: CountUsage(path, policies),
 15.         selectivity: EstimateSelectivity(path),
 16.         avgEvalTime: EstimateEvalTime(path)
 17.     }
 18. END FOR
 19.
 20. // Sort paths by optimization score
 21. // Score = frequency * selectivity / avgEvalTime
 22. sortedPaths ← SORT(conditionPaths, BY path =>
 23.     (pathStats[path].frequency * pathStats[path].selectivity)
 24.     / pathStats[path].avgEvalTime
 25.     DESC
 26. )
 27.
 28. // Build decision tree using greedy algorithm
 29. root ← CREATE TreeNode("root")
 30.
 31. FOR EACH policy IN policies DO
 32.     FOR EACH rule IN policy.rules DO
 33.         InsertRuleIntoTree(root, rule, sortedPaths)
 34.     END FOR
 35. END FOR
 36.
 37. // Optimize tree structure
 38. OptimizeTree(root)
 39.
 40. RETURN root
END ALGORITHM


ALGORITHM InsertRuleIntoTree(node: TreeNode, rule: Rule, pathOrder: Path[])
INPUT:
  - node: Current tree node
  - rule: Rule to insert
  - pathOrder: Ordered list of condition paths
OUTPUT: None (modifies tree in place)

PROCEDURE:
  1. // Extract all conditions from rule
  2. conditions ← FlattenConditions(rule.condition)
  3.
  4. // Find best condition to split on at this level
  5. bestCondition ← NULL
  6. bestScore ← -INFINITY
  7.
  8. FOR EACH cond IN conditions DO
  9.     IF cond already used in path to node THEN
 10.         CONTINUE
 11.     END IF
 12.
 13.     score ← GetConditionScore(cond, pathOrder)
 14.     IF score > bestScore THEN
 15.         bestScore ← score
 16.         bestCondition ← cond
 17.     END IF
 18. END FOR
 19.
 20. IF bestCondition is NULL THEN
 21.     // No more conditions to split on - this is a leaf
 22.     node.action ← rule.action
 23.     node.rule ← rule
 24.     RETURN
 25. END IF
 26.
 27. // Create or find child nodes for true/false branches
 28. IF node.condition is NULL THEN
 29.     node.condition ← bestCondition
 30.     node.trueChild ← CREATE TreeNode()
 31.     node.falseChild ← CREATE TreeNode()
 32. END IF
 33.
 34. // Recursively insert into appropriate branch
 35. IF RuleRequiresCondition(rule, bestCondition, TRUE) THEN
 36.     InsertRuleIntoTree(node.trueChild, rule, pathOrder)
 37. ELSE IF RuleRequiresCondition(rule, bestCondition, FALSE) THEN
 38.     InsertRuleIntoTree(node.falseChild, rule, pathOrder)
 39. ELSE
 40.     // Rule doesn't care about this condition - insert into both branches
 41.     InsertRuleIntoTree(node.trueChild, rule, pathOrder)
 42.     InsertRuleIntoTree(node.falseChild, rule, pathOrder)
 43. END IF
END ALGORITHM


ALGORITHM TraverseDecisionTree(tree: DecisionTree, context: EvalContext)
  -> PolicyDecision

INPUT:
  - tree: Pre-built decision tree
  - context: Evaluation context
OUTPUT:
  - Policy decision

PROCEDURE:
  1. node ← tree.root
  2. evaluationPath ← []
  3.
  4. WHILE node is not NULL DO
  5.     evaluationPath.append(node)
  6.
  7.     // Check if leaf node
  8.     IF node.isLeaf() THEN
  9.         RETURN {
 10.             action: node.action,
 11.             rule: node.rule,
 12.             evaluationPath: evaluationPath
 13.         }
 14.     END IF
 15.
 16.     // Evaluate condition at this node
 17.     conditionResult ← EvaluateCondition(node.condition, context)
 18.
 19.     // Traverse to appropriate child
 20.     IF conditionResult.matched THEN
 21.         node ← node.trueChild
 22.     ELSE
 23.         node ← node.falseChild
 24.     END IF
 25. END WHILE
 26.
 27. // No matching rule found
 28. RETURN {
 29.     action: "allow",
 30.     reason: "Default allow - no matching rules",
 31.     evaluationPath: evaluationPath
 32. }
END ALGORITHM
```

### 2.4 Cache Lookup and Storage

```pseudocode
ALGORITHM CacheLookup(cacheKey: CacheKey) -> CachedDecision | NULL
INPUT: Cache key derived from request context
OUTPUT: Cached decision if found and valid, NULL otherwise

PROCEDURE:
  1. // Compute hash of cache key
  2. keyHash ← ComputeHash(cacheKey)
  3.
  4. // Check L1 cache (in-memory, process-local)
  5. IF L1Cache.has(keyHash) THEN
  6.     entry ← L1Cache.get(keyHash)
  7.
  8.     // Validate cache entry
  9.     IF NOT IsExpired(entry) AND IsValid(entry, cacheKey) THEN
 10.         L1Cache.recordHit(keyHash)
 11.         RETURN entry.decision
 12.     ELSE
 13.         L1Cache.invalidate(keyHash)
 14.     END IF
 15. END IF
 16.
 17. // Check L2 cache (distributed, shared)
 18. IF L2Cache.has(keyHash) THEN
 19.     entry ← L2Cache.get(keyHash)
 20.
 21.     IF NOT IsExpired(entry) AND IsValid(entry, cacheKey) THEN
 22.         // Promote to L1 cache
 23.         L1Cache.set(keyHash, entry)
 24.         L2Cache.recordHit(keyHash)
 25.         RETURN entry.decision
 26.     ELSE
 27.         L2Cache.invalidate(keyHash)
 28.     END IF
 29. END IF
 30.
 31. // Cache miss
 32. RETURN NULL
END ALGORITHM


ALGORITHM ComputeCacheKey(context: RequestContext, policy: PolicyDocument)
  -> CacheKey

INPUT:
  - context: Request context
  - policy: Policy document
OUTPUT:
  - Cache key

PROCEDURE:
  1. // Extract cacheable fields from context
  2. cacheableFields ← ExtractCacheableFields(context, policy)
  3.
  4. // Sort fields for consistent hashing
  5. sortedFields ← SORT(cacheableFields, BY field.name)
  6.
  7. // Build cache key structure
  8. cacheKey ← {
  9.     policyId: policy.id,
 10.     policyVersion: policy.version,
 11.     fields: sortedFields,
 12.     timestamp: FLOOR(NOW() / policy.cacheTTL) * policy.cacheTTL
 13. }
 14.
 15. RETURN cacheKey
END ALGORITHM


ALGORITHM ExtractCacheableFields(context: RequestContext, policy: PolicyDocument)
  -> Field[]

INPUT:
  - context: Request context
  - policy: Policy document
OUTPUT:
  - Array of cacheable fields

PROCEDURE:
  1. // Analyze policy to determine which fields affect decisions
  2. accessedPaths ← SET()
  3.
  4. FOR EACH rule IN policy.rules DO
  5.     paths ← ExtractAccessedPaths(rule.condition)
  6.     accessedPaths.addAll(paths)
  7. END FOR
  8.
  9. // Extract values for accessed paths
 10. cacheableFields ← []
 11. FOR EACH path IN accessedPaths DO
 12.     value ← ResolveAccessor(path, context)
 13.
 14.     // Only cache deterministic, non-sensitive fields
 15.     IF IsCacheable(path, value) THEN
 16.         cacheableFields.append({
 17.             path: path,
 18.             value: value
 19.         })
 20.     END IF
 21. END FOR
 22.
 23. RETURN cacheableFields
END ALGORITHM


ALGORITHM StoreInCache(cacheKey: CacheKey, decision: PolicyDecision, ttl: Duration)
INPUT:
  - cacheKey: Cache key
  - decision: Policy decision to cache
  - ttl: Time-to-live
OUTPUT: None

PROCEDURE:
  1. keyHash ← ComputeHash(cacheKey)
  2.
  3. entry ← {
  4.     key: cacheKey,
  5.     decision: decision,
  6.     createdAt: NOW(),
  7.     expiresAt: NOW() + ttl,
  8.     accessCount: 0
  9. }
 10.
 11. // Store in L1 cache
 12. L1Cache.set(keyHash, entry, ttl)
 13.
 14. // Store in L2 cache if decision is expensive or frequently accessed
 15. IF ShouldCacheInL2(decision, cacheKey) THEN
 16.     L2Cache.set(keyHash, entry, ttl)
 17. END IF
 18.
 19. // Update cache statistics
 20. CacheStats.recordStore(keyHash, entry.size)
END ALGORITHM


ALGORITHM InvalidateCache(pattern: InvalidationPattern)
INPUT: Pattern for cache invalidation
OUTPUT: Number of entries invalidated

PROCEDURE:
  1. invalidatedCount ← 0
  2.
  3. SWITCH pattern.type
  4.   CASE "policy_update":
  5.     // Invalidate all entries for a specific policy
  6.     FOR EACH entry IN L1Cache.entries() DO
  7.       IF entry.key.policyId == pattern.policyId THEN
  8.         L1Cache.delete(entry.hash)
  9.         invalidatedCount++
 10.       END IF
 11.     END FOR
 12.
 13.     FOR EACH entry IN L2Cache.entries() DO
 14.       IF entry.key.policyId == pattern.policyId THEN
 15.         L2Cache.delete(entry.hash)
 16.         invalidatedCount++
 17.       END IF
 18.     END FOR
 19.
 20.   CASE "pattern_match":
 21.     // Invalidate entries matching a pattern
 22.     FOR EACH entry IN L1Cache.entries() DO
 23.       IF MatchesPattern(entry.key, pattern.matcher) THEN
 24.         L1Cache.delete(entry.hash)
 25.         invalidatedCount++
 26.       END IF
 27.     END FOR
 28.
 29.     L2Cache.invalidateByPattern(pattern.matcher)
 30.
 31.   CASE "full_flush":
 32.     invalidatedCount ← L1Cache.size() + L2Cache.size()
 33.     L1Cache.clear()
 34.     L2Cache.clear()
 35.
 36.   DEFAULT:
 37.     THROW Error("Unknown invalidation pattern type")
 38. END SWITCH
 39.
 40. RETURN invalidatedCount
END ALGORITHM
```

### 2.5 Response Generation

```pseudocode
ALGORITHM GenerateResponse(decision: PolicyDecision, context: RequestContext)
  -> PolicyResponse

INPUT:
  - decision: Policy evaluation decision
  - context: Original request context
OUTPUT:
  - Formatted policy response

PROCEDURE:
  1. response ← {
  2.   action: decision.action,
  3.   timestamp: NOW(),
  4.   requestId: context.requestId
  5. }
  6.
  7. SWITCH decision.action
  8.
  9.   CASE "allow":
 10.     response.status ← "approved"
 11.     response.message ← "Request approved"
 12.
 13.     IF decision.warnings is not empty THEN
 14.       response.warnings ← decision.warnings
 15.     END IF
 16.
 17.     IF decision.modifiedRequest is not NULL THEN
 18.       response.modifiedRequest ← decision.modifiedRequest
 19.       response.message ← "Request approved with modifications"
 20.     END IF
 21.
 22.   CASE "deny":
 23.     response.status ← "denied"
 24.     response.message ← decision.reason OR "Request denied by policy"
 25.     response.matchedRule ← decision.matchedRule
 26.     response.policyId ← decision.policyId
 27.
 28.     IF context.includeDebugInfo THEN
 29.       response.evaluationTrace ← decision.evaluationTrace
 30.     END IF
 31.
 32.   CASE "warn":
 33.     response.status ← "warning"
 34.     response.message ← decision.message
 35.     response.severity ← decision.severity
 36.     response.recommendation ← decision.recommendation
 37.
 38.   CASE "require_approval":
 39.     response.status ← "pending_approval"
 40.     response.message ← "Request requires approval"
 41.     response.approvers ← decision.approvers
 42.     response.approvalToken ← GenerateApprovalToken(context, decision)
 43.     response.expiresAt ← NOW() + decision.approvalTimeout
 44.
 45.   CASE "rate_limit":
 46.     response.status ← "rate_limited"
 47.     response.message ← "Rate limit exceeded"
 48.     response.retryAfter ← decision.retryAfter
 49.     response.limitInfo ← {
 50.       maxRequests: decision.rateLimit.maxRequests,
 51.       window: decision.rateLimit.window,
 52.       currentCount: decision.currentCount
 53.     }
 54.
 55.   DEFAULT:
 56.     THROW Error("Unknown decision action: " + decision.action)
 57.
 58. END SWITCH
 59.
 60. // Add metadata
 61. response.metadata ← {
 62.   evaluationTimeMs: decision.evaluationTime,
 63.   cacheHit: decision.cacheHit,
 64.   policyVersion: decision.policyVersion
 65. }
 66.
 67. // Add audit trail if configured
 68. IF context.enableAudit THEN
 69.   LogAuditEvent(response, context, decision)
 70. END IF
 71.
 72. RETURN response
END ALGORITHM
```

---

## 3. Data Flow Architecture

### 3.1 Main Request Flow

```pseudocode
ALGORITHM HandlePolicyRequest(request: LLMRequest) -> PolicyResponse
INPUT: Incoming LLM request
OUTPUT: Policy response (allow/deny/modify)

PROCEDURE:
  1. // Step 1: Request Preprocessing
  2. context ← {
  3.   requestId: GenerateRequestId(),
  4.   timestamp: NOW(),
  5.   request: request,
  6.   metadata: ExtractMetadata(request),
  7.   environment: GetEnvironmentContext()
  8. }
  9.
 10. // Step 2: Policy Lookup
 11. applicablePolicies ← FindApplicablePolicies(context)
 12.
 13. IF applicablePolicies is empty THEN
 14.   RETURN {
 15.     action: "allow",
 16.     reason: "No applicable policies"
 17.   }
 18. END IF
 19.
 20. // Step 3: Sort by priority
 21. sortedPolicies ← SORT(applicablePolicies, BY policy.priority DESC)
 22.
 23. // Step 4: Check cache
 24. FOR EACH policy IN sortedPolicies DO
 25.   cacheKey ← ComputeCacheKey(context, policy)
 26.   cachedDecision ← CacheLookup(cacheKey)
 27.
 28.   IF cachedDecision is not NULL THEN
 29.     cachedDecision.cacheHit ← TRUE
 30.     RETURN GenerateResponse(cachedDecision, context)
 31.   END IF
 32. END FOR
 33.
 34. // Step 5: Evaluate policies
 35. decisions ← []
 36.
 37. FOR EACH policy IN sortedPolicies DO
 38.   startTime ← NOW()
 39.   decision ← EvaluatePolicy(policy, context)
 40.   decision.evaluationTime ← NOW() - startTime
 41.   decision.policyId ← policy.id
 42.   decision.policyVersion ← policy.version
 43.
 44.   decisions.append(decision)
 45.
 46.   // Check if terminal decision
 47.   IF decision.action == "deny" THEN
 48.     // Cache and return immediately
 49.     StoreInCache(cacheKey, decision, policy.cacheTTL)
 50.     RETURN GenerateResponse(decision, context)
 51.   END IF
 52. END FOR
 53.
 54. // Step 6: Compose multi-policy results
 55. finalDecision ← ComposeDecisions(decisions)
 56.
 57. // Step 7: Cache result
 58. cacheKey ← ComputeCacheKey(context, sortedPolicies[0])
 59. StoreInCache(cacheKey, finalDecision, sortedPolicies[0].cacheTTL)
 60.
 61. // Step 8: Generate response
 62. response ← GenerateResponse(finalDecision, context)
 63.
 64. RETURN response
END ALGORITHM


ALGORITHM FindApplicablePolicies(context: RequestContext) -> PolicyDocument[]
INPUT: Request context
OUTPUT: List of applicable policies

PROCEDURE:
  1. // Get all active policies from registry
  2. allPolicies ← PolicyRegistry.getActivePolicies()
  3.
  4. applicablePolicies ← []
  5.
  6. FOR EACH policy IN allPolicies DO
  7.   // Check if policy is enabled
  8.   IF NOT policy.enabled THEN
  9.     CONTINUE
 10.   END IF
 11.
 12.   // Check scope/applicability conditions
 13.   IF policy.scope is defined THEN
 14.     IF NOT MatchesScope(context, policy.scope) THEN
 15.       CONTINUE
 16.     END IF
 17.   END IF
 18.
 19.   // Check tenant/organization filters
 20.   IF policy.tenantFilter is defined THEN
 21.     IF NOT MatchesTenant(context, policy.tenantFilter) THEN
 22.       CONTINUE
 23.     END IF
 24.   END IF
 25.
 26.   applicablePolicies.append(policy)
 27. END FOR
 28.
 29. RETURN applicablePolicies
END ALGORITHM
```

### 3.2 Policy Registry Sync Protocol

```pseudocode
ALGORITHM SyncPolicyRegistry() -> SyncResult
INPUT: None (uses configured policy sources)
OUTPUT: Sync result with statistics

PROCEDURE:
  1. syncResult ← {
  2.   startTime: NOW(),
  3.   added: 0,
  4.   updated: 0,
  5.   removed: 0,
  6.   errors: []
  7. }
  8.
  9. // Step 1: Fetch policies from all sources
 10. policySources ← Config.getPolicySources()
 11. remotePolicies ← MAP()  // policyId -> policy
 12.
 13. FOR EACH source IN policySources DO
 14.   TRY
 15.     policies ← FetchPoliciesFromSource(source)
 16.
 17.     FOR EACH policy IN policies DO
 18.       // Validate policy
 19.       validationResult ← ValidatePolicy(policy)
 20.
 21.       IF validationResult.isValid THEN
 22.         remotePolicies[policy.id] ← policy
 23.       ELSE
 24.         syncResult.errors.append({
 25.           policyId: policy.id,
 26.           source: source.name,
 27.           error: validationResult.errors
 28.         })
 29.       END IF
 30.     END FOR
 31.   CATCH error
 32.     syncResult.errors.append({
 33.       source: source.name,
 34.       error: error.message
 35.     })
 36.   END TRY
 37. END FOR
 38.
 39. // Step 2: Compute diff with current registry
 40. currentPolicies ← PolicyRegistry.getAllPolicies()
 41.
 42. toAdd ← []
 43. toUpdate ← []
 44. toRemove ← []
 45.
 46. // Find additions and updates
 47. FOR EACH (policyId, remotePolicy) IN remotePolicies DO
 48.   IF NOT currentPolicies.has(policyId) THEN
 49.     toAdd.append(remotePolicy)
 50.   ELSE
 51.     currentPolicy ← currentPolicies[policyId]
 52.     IF remotePolicy.version != currentPolicy.version THEN
 53.       toUpdate.append(remotePolicy)
 54.     END IF
 55.   END IF
 56. END FOR
 57.
 58. // Find removals
 59. FOR EACH (policyId, currentPolicy) IN currentPolicies DO
 60.   IF NOT remotePolicies.has(policyId) THEN
 61.     toRemove.append(policyId)
 62.   END IF
 63. END FOR
 64.
 65. // Step 3: Apply changes atomically
 66. BEGIN TRANSACTION
 67.
 68. FOR EACH policy IN toAdd DO
 69.   PolicyRegistry.add(policy)
 70.   syncResult.added++
 71. END FOR
 72.
 73. FOR EACH policy IN toUpdate DO
 74.   PolicyRegistry.update(policy)
 75.   syncResult.updated++
 76.
 77.   // Invalidate cache for updated policy
 78.   InvalidateCache({
 79.     type: "policy_update",
 80.     policyId: policy.id
 81.   })
 82. END FOR
 83.
 84. FOR EACH policyId IN toRemove DO
 85.   PolicyRegistry.remove(policyId)
 86.   syncResult.removed++
 87.
 88.   // Invalidate cache for removed policy
 89.   InvalidateCache({
 90.     type: "policy_update",
 91.     policyId: policyId
 92.   })
 93. END FOR
 94.
 95. COMMIT TRANSACTION
 96.
 97. // Step 4: Update sync metadata
 98. syncResult.endTime ← NOW()
 99. syncResult.duration ← syncResult.endTime - syncResult.startTime
100.
101. PolicyRegistry.updateSyncMetadata(syncResult)
102.
103. // Step 5: Notify listeners
104. NotifyPolicyUpdateListeners(syncResult)
105.
106. RETURN syncResult
END ALGORITHM


ALGORITHM FetchPoliciesFromSource(source: PolicySource) -> PolicyDocument[]
INPUT: Policy source configuration
OUTPUT: Array of policy documents

PROCEDURE:
  1. SWITCH source.type
  2.
  3.   CASE "git":
  4.     // Clone or pull Git repository
  5.     repo ← GitClient.clone(source.url, source.branch)
  6.
  7.     // Find all policy files
  8.     policyFiles ← FindFiles(repo.path, "*.policy.*")
  9.
 10.     policies ← []
 11.     FOR EACH file IN policyFiles DO
 12.       content ← ReadFile(file)
 13.       policy ← ParsePolicy(content)
 14.       policies.append(policy)
 15.     END FOR
 16.
 17.     RETURN policies
 18.
 19.   CASE "http":
 20.     // Fetch from HTTP endpoint
 21.     response ← HttpClient.get(source.url, {
 22.       headers: source.headers,
 23.       timeout: source.timeout
 24.     })
 25.
 26.     IF response.status != 200 THEN
 27.       THROW Error("HTTP error: " + response.status)
 28.     END IF
 29.
 30.     policiesData ← JSON.parse(response.body)
 31.
 32.     policies ← []
 33.     FOR EACH policyData IN policiesData DO
 34.       policy ← DeserializePolicy(policyData)
 35.       policies.append(policy)
 36.     END FOR
 37.
 38.     RETURN policies
 39.
 40.   CASE "s3":
 41.     // Fetch from S3 bucket
 42.     objects ← S3Client.listObjects(source.bucket, source.prefix)
 43.
 44.     policies ← []
 45.     FOR EACH object IN objects DO
 46.       IF object.key.endsWith(".policy.json") OR
 47.          object.key.endsWith(".policy.yaml") THEN
 48.         content ← S3Client.getObject(source.bucket, object.key)
 49.         policy ← ParsePolicy(content)
 50.         policies.append(policy)
 51.       END IF
 52.     END FOR
 53.
 54.     RETURN policies
 55.
 56.   CASE "database":
 57.     // Fetch from database
 58.     query ← "SELECT * FROM policies WHERE active = true"
 59.     rows ← Database.query(source.connection, query)
 60.
 61.     policies ← []
 62.     FOR EACH row IN rows DO
 63.       policy ← DeserializePolicy(row.policy_document)
 64.       policies.append(policy)
 65.     END FOR
 66.
 67.     RETURN policies
 68.
 69.   DEFAULT:
 70.     THROW Error("Unknown source type: " + source.type)
 71.
 72. END SWITCH
END ALGORITHM
```

### 3.3 Multi-Policy Composition and Conflict Resolution

```pseudocode
ALGORITHM ComposeDecisions(decisions: PolicyDecision[]) -> PolicyDecision
INPUT: Array of decisions from multiple policies
OUTPUT: Single composed decision

PROCEDURE:
  1. // Priority order: deny > require_approval > rate_limit > warn > allow
  2.
  3. // Check for any deny decisions
  4. FOR EACH decision IN decisions DO
  5.   IF decision.action == "deny" THEN
  6.     // Deny takes precedence - return immediately
  7.     RETURN decision
  8.   END IF
  9. END FOR
 10.
 11. // Check for approval requirements
 12. approvalDecisions ← FILTER(decisions, d => d.action == "require_approval")
 13. IF approvalDecisions is not empty THEN
 14.   // Merge all approval requirements
 15.   allApprovers ← SET()
 16.   FOR EACH decision IN approvalDecisions DO
 17.     allApprovers.addAll(decision.approvers)
 18.   END FOR
 19.
 20.   RETURN {
 21.     action: "require_approval",
 22.     approvers: allApprovers.toArray(),
 23.     reason: "Multiple policies require approval",
 24.     sourceDecisions: approvalDecisions
 25.   }
 26. END IF
 27.
 28. // Check for rate limits
 29. rateLimitDecisions ← FILTER(decisions, d => d.action == "rate_limit")
 30. IF rateLimitDecisions is not empty THEN
 31.   // Take most restrictive rate limit
 32.   mostRestrictive ← rateLimitDecisions[0]
 33.
 34.   FOR EACH decision IN rateLimitDecisions DO
 35.     IF decision.rateLimit.maxRequests < mostRestrictive.rateLimit.maxRequests THEN
 36.       mostRestrictive ← decision
 37.     END IF
 38.   END FOR
 39.
 40.   RETURN mostRestrictive
 41. END IF
 42.
 43. // Collect all modifications
 44. modifications ← []
 45. FOR EACH decision IN decisions DO
 46.   IF decision.action == "modify" THEN
 47.     modifications.addAll(decision.modifications)
 48.   END IF
 49. END FOR
 50.
 51. // Resolve modification conflicts
 52. resolvedModifications ← ResolveModificationConflicts(modifications)
 53.
 54. // Collect all warnings
 55. warnings ← []
 56. FOR EACH decision IN decisions DO
 57.   IF decision.action == "warn" THEN
 58.     warnings.append(decision.message)
 59.   ELSE IF decision.warnings is not empty THEN
 60.     warnings.addAll(decision.warnings)
 61.   END IF
 62. END FOR
 63.
 64. // Compose final allow decision
 65. RETURN {
 66.   action: "allow",
 67.   reason: "All policies satisfied",
 68.   modifications: resolvedModifications,
 69.   warnings: warnings,
 70.   sourceDecisions: decisions
 71. }
END ALGORITHM


ALGORITHM ResolveModificationConflicts(modifications: Modification[])
  -> Modification[]

INPUT: Array of modifications from different policies
OUTPUT: Resolved modifications

PROCEDURE:
  1. // Group modifications by target path
  2. modsByPath ← MAP()
  3.
  4. FOR EACH mod IN modifications DO
  5.   path ← mod.path
  6.   IF NOT modsByPath.has(path) THEN
  7.     modsByPath[path] ← []
  8.   END IF
  9.   modsByPath[path].append(mod)
 10. END FOR
 11.
 12. resolved ← []
 13.
 14. // Resolve conflicts for each path
 15. FOR EACH (path, mods) IN modsByPath DO
 16.   IF mods.length == 1 THEN
 17.     // No conflict
 18.     resolved.append(mods[0])
 19.   ELSE
 20.     // Multiple modifications to same path - apply conflict resolution
 21.     resolvedMod ← ResolvePathConflict(path, mods)
 22.     resolved.append(resolvedMod)
 23.   END IF
 24. END FOR
 25.
 26. RETURN resolved
END ALGORITHM


ALGORITHM ResolvePathConflict(path: String, modifications: Modification[])
  -> Modification

INPUT:
  - path: Target path with conflict
  - modifications: Conflicting modifications
OUTPUT:
  - Resolved modification

PROCEDURE:
  1. // Categorize operation types
  2. sets ← FILTER(modifications, m => m.operation == "set")
  3. removes ← FILTER(modifications, m => m.operation == "remove")
  4. appends ← FILTER(modifications, m => m.operation == "append")
  5.
  6. // Apply conflict resolution rules:
  7.
  8. // Rule 1: Remove takes precedence over everything
  9. IF removes is not empty THEN
 10.   RETURN removes[0]  // Any remove wins
 11. END IF
 12.
 13. // Rule 2: Multiple sets - take highest priority
 14. IF sets is not empty THEN
 15.   highestPriority ← MAX(sets, BY s => s.priority)
 16.   RETURN highestPriority
 17. END IF
 18.
 19. // Rule 3: Multiple appends - merge them
 20. IF appends is not empty THEN
 21.   mergedValue ← []
 22.   FOR EACH append IN appends DO
 23.     mergedValue.append(append.value)
 24.   END FOR
 25.
 26.   RETURN {
 27.     operation: "append",
 28.     path: path,
 29.     value: mergedValue
 30.   }
 31. END IF
 32.
 33. // Should never reach here
 34. THROW Error("No modifications to resolve")
END ALGORITHM
```

---

## 4. Example Policy Documents

### 4.1 Cost Ceiling Enforcement Policy

```yaml
# cost_ceiling.policy.yaml

policy:
  id: cost_ceiling_v1
  version: 1.0.0
  priority: 100
  enabled: true
  description: |
    Enforces cost ceilings on LLM requests based on model selection,
    token limits, and organizational budgets.

rules:
  # Rule 1: Block expensive models for basic tier
  block_expensive_models_basic:
    condition: |
      context.user.tier == "basic" &&
      request.model.name in ["gpt-4", "claude-opus-3", "gemini-ultra"]
    action: deny
    metadata:
      description: Basic tier users cannot use premium models
      severity: high
      reason: |
        Your subscription tier does not include access to premium models.
        Please upgrade to Professional or Enterprise tier.

  # Rule 2: Enforce token limits by tier
  enforce_token_limits:
    condition: |
      (context.user.tier == "basic" && request.max_tokens > 2000) ||
      (context.user.tier == "professional" && request.max_tokens > 8000)
    action: modify
    modifications:
      - operation: set
        path: request.max_tokens
        value: |
          context.user.tier == "basic" ? 2000 : 8000
    metadata:
      description: Enforce maximum token limits based on subscription tier
      severity: medium

  # Rule 3: Daily budget enforcement
  check_daily_budget:
    condition: |
      GetDailySpend(context.user.id, context.organization.id) >=
      GetDailyBudget(context.user.tier)
    action: deny
    metadata:
      description: Daily budget exceeded
      severity: critical
      reason: |
        Daily budget limit reached. Budget resets at midnight UTC.
        Current spend: ${{GetDailySpend(context.user.id)}}
        Daily limit: ${{GetDailyBudget(context.user.tier)}}

  # Rule 4: Warn on high-cost requests
  warn_high_cost:
    condition: |
      EstimateRequestCost(request) > 1.00
    action: warn
    metadata:
      description: High-cost request warning
      severity: medium
      message: |
        This request is estimated to cost ${{EstimateRequestCost(request)}}.
        Consider using a smaller model or reducing max_tokens.

  # Rule 5: Require approval for very expensive requests
  approval_for_expensive:
    condition: |
      EstimateRequestCost(request) > 10.00
    action: require_approval
    approvers:
      - role: finance_admin
      - role: engineering_manager
    timeout: 24h
    metadata:
      description: Require approval for requests exceeding $10
      severity: high

# Helper function definitions
functions:
  GetDailySpend:
    params: [userId, orgId]
    implementation: database_query
    query: |
      SELECT SUM(cost) FROM llm_requests
      WHERE user_id = ? AND org_id = ?
      AND timestamp > CURRENT_DATE

  GetDailyBudget:
    params: [tier]
    implementation: lookup
    values:
      basic: 10.00
      professional: 100.00
      enterprise: 1000.00

  EstimateRequestCost:
    params: [request]
    implementation: calculation
    formula: |
      modelCost = GetModelCostPerToken(request.model.name)
      estimatedTokens = request.max_tokens * 1.2  // 20% overhead
      return modelCost * estimatedTokens

  GetModelCostPerToken:
    params: [modelName]
    implementation: lookup
    values:
      gpt-4: 0.00003
      gpt-3.5-turbo: 0.000002
      claude-opus-3: 0.000015
      claude-sonnet-3.5: 0.000003
      gemini-pro: 0.0000005
```

### 4.2 Security Filtering Policy

```yaml
# security_filtering.policy.yaml

policy:
  id: security_filtering_v1
  version: 1.0.0
  priority: 200
  enabled: true
  description: |
    Prevents injection attacks, filters sensitive data, and enforces
    security best practices for LLM requests.

rules:
  # Rule 1: Block prompt injection attempts
  block_prompt_injection:
    condition: |
      ContainsPromptInjection(request.prompt) ||
      ContainsPromptInjection(request.system_message)
    action: deny
    metadata:
      description: Potential prompt injection detected
      severity: critical
      reason: |
        Request blocked due to potential prompt injection attack.
        Detected patterns: {{GetInjectionPatterns(request)}}
      tags: [security, injection, attack-prevention]

  # Rule 2: Filter PII from requests
  filter_pii:
    condition: |
      ContainsPII(request.prompt)
    action: modify
    modifications:
      - operation: set
        path: request.prompt
        value: RedactPII(request.prompt)
      - operation: set
        path: metadata.pii_filtered
        value: true
    metadata:
      description: Automatically redact PII from prompts
      severity: high
      tags: [security, privacy, pii]

  # Rule 3: Block requests containing API keys or secrets
  block_exposed_secrets:
    condition: |
      ContainsAPIKey(request.prompt) ||
      ContainsPassword(request.prompt) ||
      ContainsPrivateKey(request.prompt)
    action: deny
    metadata:
      description: Request contains exposed secrets
      severity: critical
      reason: |
        Request blocked because it contains potential API keys or secrets.
        Never include credentials in LLM prompts.
      tags: [security, secrets, credentials]

  # Rule 4: Enforce content safety filters
  enforce_content_safety:
    condition: |
      request.disable_content_filter == true
    action: modify
    modifications:
      - operation: set
        path: request.disable_content_filter
        value: false
      - operation: remove
        path: request.content_filter_override
    metadata:
      description: Content safety filters cannot be disabled
      severity: high
      tags: [security, content-safety]

  # Rule 5: Rate limit by IP for suspicious activity
  rate_limit_suspicious_ips:
    condition: |
      IsIPSuspicious(context.client.ip) ||
      GetRecentFailureCount(context.client.ip) > 5
    action: rate_limit
    spec:
      max_requests: 10
      window: 1h
      scope: ip_address
    metadata:
      description: Rate limit suspicious IP addresses
      severity: high
      tags: [security, rate-limiting, abuse-prevention]

  # Rule 6: Warn on requests without authentication
  warn_unauthenticated:
    condition: |
      context.user.authenticated == false
    action: warn
    metadata:
      description: Unauthenticated request
      severity: medium
      message: |
        This request is not authenticated. Authenticated requests have
        higher rate limits and access to additional features.
      tags: [security, authentication]

  # Rule 7: Block SQL injection in structured inputs
  block_sql_injection:
    condition: |
      request.structured_input != null &&
      ContainsSQLInjection(request.structured_input)
    action: deny
    metadata:
      description: Potential SQL injection in structured input
      severity: critical
      reason: SQL injection pattern detected in request parameters
      tags: [security, injection, sql]

# Security function definitions
functions:
  ContainsPromptInjection:
    params: [text]
    implementation: pattern_matching
    patterns:
      - "ignore (previous|above|all) (instructions|rules)"
      - "system:.*override"
      - "\\[SYSTEM\\].*\\[/SYSTEM\\]"
      - "you are now (a|in|under)"
      - "disregard (all|any|your) (instructions|programming)"
      - "new instructions:"
      - "sudo mode"

  ContainsPII:
    params: [text]
    implementation: ml_model
    model: pii_detection_v2
    threshold: 0.85
    categories:
      - email
      - phone_number
      - ssn
      - credit_card
      - ip_address
      - street_address

  RedactPII:
    params: [text]
    implementation: ml_model
    model: pii_redaction_v2
    replacement_strategy: entity_type  # e.g., [EMAIL], [PHONE]

  ContainsAPIKey:
    params: [text]
    implementation: regex
    patterns:
      - "(?i)(api[_-]?key|apikey)['\"]?\\s*[:=]\\s*['\"]?[a-zA-Z0-9_\\-]{20,}"
      - "(?i)sk-[a-zA-Z0-9]{48}"  # OpenAI format
      - "(?i)AIza[0-9A-Za-z\\-_]{35}"  # Google API key

  ContainsPassword:
    params: [text]
    implementation: regex
    patterns:
      - "(?i)password['\"]?\\s*[:=]\\s*['\"]?\\S+"
      - "(?i)passwd['\"]?\\s*[:=]\\s*['\"]?\\S+"

  ContainsSQLInjection:
    params: [text]
    implementation: pattern_matching
    patterns:
      - "(?i)(union|select|insert|update|delete|drop|create).*from"
      - "(?i)or\\s+1\\s*=\\s*1"
      - "(?i)';\\s*(drop|delete|update)"

  IsIPSuspicious:
    params: [ip]
    implementation: threat_intelligence
    sources:
      - abuse_ipdb
      - threat_intel_feed
    threshold: 50  # Confidence score
```

### 4.3 Compliance Validation Policy

```yaml
# compliance_validation.policy.yaml

policy:
  id: compliance_validation_v1
  version: 1.0.0
  priority: 150
  enabled: true
  description: |
    Ensures compliance with GDPR, HIPAA, SOC2, and other regulatory
    requirements for LLM usage.

rules:
  # Rule 1: GDPR - Require data processing agreement for EU users
  gdpr_dpa_required:
    condition: |
      IsEUUser(context.user) &&
      !HasDataProcessingAgreement(context.organization.id)
    action: deny
    metadata:
      description: GDPR Data Processing Agreement required
      severity: critical
      reason: |
        GDPR compliance requires a Data Processing Agreement for EU users.
        Please contact compliance@company.com to set up DPA.
      compliance_frameworks: [GDPR]
      regulation_reference: Article 28

  # Rule 2: GDPR - Block training on user data without consent
  gdpr_no_training_without_consent:
    condition: |
      IsEUUser(context.user) &&
      request.allow_training == true &&
      !HasTrainingConsent(context.user.id)
    action: modify
    modifications:
      - operation: set
        path: request.allow_training
        value: false
    metadata:
      description: Training on user data requires explicit consent (GDPR)
      severity: high
      compliance_frameworks: [GDPR]
      regulation_reference: Article 6, Article 9

  # Rule 3: HIPAA - Require BAA for healthcare data
  hipaa_baa_required:
    condition: |
      request.data_classification in ["PHI", "ePHI", "healthcare"] &&
      !HasBusinessAssociateAgreement(context.organization.id)
    action: deny
    metadata:
      description: HIPAA Business Associate Agreement required
      severity: critical
      reason: |
        Processing Protected Health Information requires a Business
        Associate Agreement. Contact compliance team.
      compliance_frameworks: [HIPAA]
      regulation_reference: 45 CFR 164.502(e)

  # Rule 4: HIPAA - Ensure encryption for PHI
  hipaa_encryption_required:
    condition: |
      request.data_classification in ["PHI", "ePHI"] &&
      context.connection.encryption != "TLS_1_3"
    action: deny
    metadata:
      description: PHI requires TLS 1.3 encryption
      severity: critical
      reason: HIPAA requires encryption in transit for Protected Health Information
      compliance_frameworks: [HIPAA]
      regulation_reference: 45 CFR 164.312(e)(1)

  # Rule 5: SOC2 - Audit all high-risk requests
  soc2_audit_logging:
    condition: |
      request.risk_level in ["high", "critical"] ||
      request.data_classification in ["confidential", "restricted"]
    action: modify
    modifications:
      - operation: set
        path: metadata.audit_required
        value: true
      - operation: set
        path: metadata.audit_retention_days
        value: 2555  # 7 years
    metadata:
      description: SOC2 requires audit logging for high-risk requests
      severity: medium
      compliance_frameworks: [SOC2]
      control_reference: CC6.1, CC7.2

  # Rule 6: PCI-DSS - Block credit card data
  pci_block_cardholder_data:
    condition: |
      ContainsCreditCard(request.prompt)
    action: deny
    metadata:
      description: Credit card data detected in prompt
      severity: critical
      reason: |
        PCI-DSS prohibits processing cardholder data through unvalidated systems.
        Credit card patterns detected and request blocked.
      compliance_frameworks: [PCI-DSS]
      requirement: 3.4, 4.2

  # Rule 7: Data residency requirements
  enforce_data_residency:
    condition: |
      context.organization.data_residency != null &&
      request.model.region != context.organization.data_residency
    action: modify
    modifications:
      - operation: set
        path: request.model.region
        value: context.organization.data_residency
    metadata:
      description: Enforce data residency requirements
      severity: high
      compliance_frameworks: [GDPR, CCPA, local_regulations]

  # Rule 8: Retention policy enforcement
  enforce_retention_policy:
    condition: |
      context.organization.retention_policy != null
    action: modify
    modifications:
      - operation: set
        path: metadata.retention_days
        value: GetRetentionDays(context.organization.retention_policy)
      - operation: set
        path: metadata.auto_delete_after
        value: GetAutoDeleteDate(context.organization.retention_policy)
    metadata:
      description: Apply organization retention policy
      severity: medium
      compliance_frameworks: [GDPR, CCPA, SOC2]

  # Rule 9: Export control compliance
  export_control_check:
    condition: |
      IsRestrictedCountry(context.client.country) &&
      request.model.capabilities contains "advanced_reasoning"
    action: deny
    metadata:
      description: Export control restrictions apply
      severity: critical
      reason: |
        Advanced AI capabilities cannot be exported to restricted countries
        per export control regulations.
      compliance_frameworks: [EAR, ITAR]

# Compliance function definitions
functions:
  IsEUUser:
    params: [user]
    implementation: geo_lookup
    check: user.country in EU_COUNTRIES

  HasDataProcessingAgreement:
    params: [orgId]
    implementation: database_query
    query: |
      SELECT EXISTS(
        SELECT 1 FROM data_processing_agreements
        WHERE org_id = ? AND status = 'active'
      )

  HasBusinessAssociateAgreement:
    params: [orgId]
    implementation: database_query
    query: |
      SELECT EXISTS(
        SELECT 1 FROM business_associate_agreements
        WHERE org_id = ? AND status = 'active'
      )

  ContainsCreditCard:
    params: [text]
    implementation: regex
    patterns:
      # Visa, MasterCard, Amex, Discover
      - "\\b4[0-9]{12}(?:[0-9]{3})?\\b"
      - "\\b5[1-5][0-9]{14}\\b"
      - "\\b3[47][0-9]{13}\\b"
      - "\\b6(?:011|5[0-9]{2})[0-9]{12}\\b"
    validation: luhn_check

  GetRetentionDays:
    params: [policy]
    implementation: lookup
    values:
      minimal: 30
      standard: 365
      extended: 2555  # 7 years
      permanent: -1

  IsRestrictedCountry:
    params: [country]
    implementation: lookup
    source: export_control_list
    update_frequency: daily
```

### 4.4 Rate Limiting Policy

```yaml
# rate_limiting.policy.yaml

policy:
  id: rate_limiting_v1
  version: 1.0.0
  priority: 50
  enabled: true
  description: |
    Comprehensive rate limiting to prevent abuse and ensure fair usage
    across different dimensions.

rules:
  # Rule 1: Per-user rate limiting by tier
  user_rate_limit_basic:
    condition: |
      context.user.tier == "basic" &&
      GetRequestCount(context.user.id, "1h") >= 100
    action: rate_limit
    spec:
      max_requests: 100
      window: 1h
      scope: user
    metadata:
      description: Basic tier rate limit - 100 requests/hour
      severity: medium

  user_rate_limit_professional:
    condition: |
      context.user.tier == "professional" &&
      GetRequestCount(context.user.id, "1h") >= 1000
    action: rate_limit
    spec:
      max_requests: 1000
      window: 1h
      scope: user
    metadata:
      description: Professional tier rate limit - 1000 requests/hour
      severity: medium

  # Rule 2: Token-based rate limiting
  token_rate_limit:
    condition: |
      GetTokenUsage(context.user.id, "1h") >= GetTokenLimit(context.user.tier)
    action: rate_limit
    spec:
      max_tokens: GetTokenLimit(context.user.tier)
      window: 1h
      scope: user
    metadata:
      description: Token consumption rate limit
      severity: medium
      message: |
        Hourly token limit reached.
        Used: {{GetTokenUsage(context.user.id, "1h")}}
        Limit: {{GetTokenLimit(context.user.tier)}}

  # Rule 3: Organization-wide rate limiting
  org_rate_limit:
    condition: |
      GetRequestCount(context.organization.id, "1d") >=
      context.organization.daily_limit
    action: rate_limit
    spec:
      max_requests: context.organization.daily_limit
      window: 1d
      scope: organization
    metadata:
      description: Organization daily request limit
      severity: high

  # Rule 4: Per-endpoint rate limiting
  expensive_endpoint_limit:
    condition: |
      request.endpoint in ["embedding", "image-generation"] &&
      GetEndpointRequestCount(context.user.id, request.endpoint, "5m") >= 10
    action: rate_limit
    spec:
      max_requests: 10
      window: 5m
      scope: user_endpoint
    metadata:
      description: Expensive endpoints limited to 10 req/5min
      severity: medium

  # Rule 5: Concurrent request limiting
  concurrent_request_limit:
    condition: |
      GetConcurrentRequests(context.user.id) >= GetConcurrentLimit(context.user.tier)
    action: rate_limit
    spec:
      max_concurrent: GetConcurrentLimit(context.user.tier)
      scope: user
    metadata:
      description: Maximum concurrent requests exceeded
      severity: medium
      message: |
        Too many concurrent requests.
        Current: {{GetConcurrentRequests(context.user.id)}}
        Limit: {{GetConcurrentLimit(context.user.tier)}}

  # Rule 6: Burst protection
  burst_protection:
    condition: |
      GetRequestCount(context.user.id, "10s") >= 20
    action: rate_limit
    spec:
      max_requests: 20
      window: 10s
      scope: user
    metadata:
      description: Burst protection - max 20 requests per 10 seconds
      severity: high

  # Rule 7: IP-based rate limiting for unauthenticated requests
  ip_rate_limit_unauth:
    condition: |
      context.user.authenticated == false &&
      GetRequestCount(context.client.ip, "1h") >= 50
    action: rate_limit
    spec:
      max_requests: 50
      window: 1h
      scope: ip
    metadata:
      description: Unauthenticated IP rate limit
      severity: medium

  # Rule 8: Model-specific rate limiting
  premium_model_rate_limit:
    condition: |
      request.model.name in ["gpt-4", "claude-opus-3"] &&
      GetModelRequestCount(context.user.id, request.model.name, "1h") >=
      GetPremiumModelLimit(context.user.tier)
    action: rate_limit
    spec:
      max_requests: GetPremiumModelLimit(context.user.tier)
      window: 1h
      scope: user_model
    metadata:
      description: Premium model rate limiting
      severity: medium

  # Rule 9: Adaptive rate limiting based on error rate
  adaptive_rate_limit:
    condition: |
      GetErrorRate(context.user.id, "5m") > 0.5  # 50% error rate
    action: rate_limit
    spec:
      max_requests: GetRequestCount(context.user.id, "5m") * 0.5
      window: 5m
      scope: user
    metadata:
      description: Adaptive rate limiting due to high error rate
      severity: high
      message: |
        Rate limit reduced due to high error rate.
        Fix errors before increasing request volume.

# Rate limiting function definitions
functions:
  GetRequestCount:
    params: [scope_id, window]
    implementation: redis_counter
    key_pattern: "rate_limit:requests:{scope_id}:{window}"

  GetTokenUsage:
    params: [user_id, window]
    implementation: redis_counter
    key_pattern: "rate_limit:tokens:{user_id}:{window}"

  GetTokenLimit:
    params: [tier]
    implementation: lookup
    values:
      basic: 100000      # 100K tokens/hour
      professional: 1000000   # 1M tokens/hour
      enterprise: 10000000    # 10M tokens/hour

  GetConcurrentRequests:
    params: [user_id]
    implementation: redis_gauge
    key_pattern: "concurrent:requests:{user_id}"

  GetConcurrentLimit:
    params: [tier]
    implementation: lookup
    values:
      basic: 5
      professional: 20
      enterprise: 100

  GetPremiumModelLimit:
    params: [tier]
    implementation: lookup
    values:
      basic: 0
      professional: 100
      enterprise: 1000

  GetErrorRate:
    params: [user_id, window]
    implementation: calculation
    formula: |
      errors = GetErrorCount(user_id, window)
      total = GetRequestCount(user_id, window)
      return total > 0 ? errors / total : 0
```

---

## 5. Performance Optimization Strategies

### 5.1 Rule Evaluation Optimization

```pseudocode
ALGORITHM OptimizeRuleEvaluation(policy: PolicyDocument) -> OptimizedPolicy
INPUT: Original policy document
OUTPUT: Optimized policy with performance improvements

PROCEDURE:
  1. optimizedPolicy ← COPY(policy)
  2.
  3. // Strategy 1: Reorder rules by selectivity
  4. selectivityScores ← []
  5. FOR EACH rule IN optimizedPolicy.rules DO
  6.   score ← EstimateRuleSelectivity(rule)
  7.   selectivityScores.append({rule: rule, score: score})
  8. END FOR
  9.
 10. // Sort by selectivity (most selective first)
 11. sortedRules ← SORT(selectivityScores, BY score DESC)
 12. optimizedPolicy.rules ← MAP(sortedRules, r => r.rule)
 13.
 14. // Strategy 2: Extract common sub-expressions
 15. commonExprs ← FindCommonSubexpressions(optimizedPolicy.rules)
 16. FOR EACH expr IN commonExprs DO
 17.   IF expr.frequency > 2 THEN
 18.     // Hoist to computed field
 19.     optimizedPolicy.computedFields[expr.id] ← expr
 20.     ReplaceWithReference(optimizedPolicy.rules, expr)
 21.   END IF
 22. END FOR
 23.
 24. // Strategy 3: Index frequently accessed fields
 25. accessPatterns ← AnalyzeAccessPatterns(optimizedPolicy.rules)
 26. optimizedPolicy.indexes ← CreateIndexes(accessPatterns)
 27.
 28. // Strategy 4: Compile static conditions
 29. FOR EACH rule IN optimizedPolicy.rules DO
 30.   IF IsStaticCondition(rule.condition) THEN
 31.     rule.condition ← CompileCondition(rule.condition)
 32.   END IF
 33. END FOR
 34.
 35. RETURN optimizedPolicy
END ALGORITHM


ALGORITHM EstimateRuleSelectivity(rule: Rule) -> Float
INPUT: Policy rule
OUTPUT: Selectivity score (0-1, higher = more selective)

PROCEDURE:
  1. // Analyze historical match rate
  2. historicalMatchRate ← GetHistoricalMatchRate(rule.id)
  3.
  4. // Analyze condition complexity
  5. conditionComplexity ← AnalyzeComplexity(rule.condition)
  6.
  7. // Estimate from condition structure
  8. structuralSelectivity ← EstimateStructuralSelectivity(rule.condition)
  9.
 10. // Combine factors
 11. selectivity ← (
 12.   0.5 * (1 - historicalMatchRate) +
 13.   0.3 * structuralSelectivity +
 14.   0.2 * (1 / conditionComplexity)
 15. )
 16.
 17. RETURN selectivity
END ALGORITHM
```

### 5.2 Cache Optimization

```pseudocode
ALGORITHM OptimizeCacheStrategy(stats: CacheStatistics) -> CacheConfiguration
INPUT: Cache performance statistics
OUTPUT: Optimized cache configuration

PROCEDURE:
  1. config ← {
  2.   l1_size: DEFAULT_L1_SIZE,
  3.   l2_size: DEFAULT_L2_SIZE,
  4.   ttl: DEFAULT_TTL,
  5.   eviction_policy: "LRU"
  6. }
  7.
  8. // Analyze cache hit rate
  9. IF stats.hitRate < 0.5 THEN
 10.   // Low hit rate - increase cache size
 11.   config.l1_size ← config.l1_size * 1.5
 12.   config.l2_size ← config.l2_size * 1.5
 13. END IF
 14.
 15. // Analyze access patterns
 16. IF stats.temporalLocality > 0.8 THEN
 17.   // High temporal locality - use LRU
 18.   config.eviction_policy ← "LRU"
 19. ELSE IF stats.frequencyImportant THEN
 20.   // Frequency matters more - use LFU
 21.   config.eviction_policy ← "LFU"
 22. END IF
 23.
 24. // Analyze TTL effectiveness
 25. IF stats.staleCacheHits > 0.1 THEN
 26.   // Too many stale hits - reduce TTL
 27.   config.ttl ← config.ttl * 0.8
 28. ELSE IF stats.prematureEvictions > 0.2 THEN
 29.   // Evicting too early - increase TTL
 30.   config.ttl ← config.ttl * 1.2
 31. END IF
 32.
 33. // Apply cost-benefit analysis
 34. IF stats.avgEvaluationTime < 5ms THEN
 35.   // Evaluation is fast - reduce cache investment
 36.   config.l1_size ← config.l1_size * 0.7
 37. END IF
 38.
 39. RETURN config
END ALGORITHM
```

### 5.3 Parallel Evaluation

```pseudocode
ALGORITHM ParallelPolicyEvaluation(policies: PolicyDocument[], context: RequestContext)
  -> PolicyDecision

INPUT:
  - policies: Multiple independent policies
  - context: Request context
OUTPUT:
  - Composed policy decision

PROCEDURE:
  1. // Partition policies into dependency groups
  2. dependencyGraph ← BuildDependencyGraph(policies)
  3. evaluationLevels ← TopologicalSort(dependencyGraph)
  4.
  5. allDecisions ← []
  6.
  7. // Evaluate each level in parallel
  8. FOR EACH level IN evaluationLevels DO
  9.
 10.   // Create evaluation tasks
 11.   tasks ← []
 12.   FOR EACH policy IN level DO
 13.     task ← CREATE_ASYNC_TASK(() => {
 14.       RETURN EvaluatePolicy(policy, context)
 15.     })
 16.     tasks.append(task)
 17.   END FOR
 18.
 19.   // Execute in parallel
 20.   levelDecisions ← AWAIT_ALL(tasks)
 21.
 22.   // Check for early termination
 23.   FOR EACH decision IN levelDecisions DO
 24.     IF decision.action == "deny" THEN
 25.       // Immediate denial - cancel remaining tasks
 26.       CANCEL_REMAINING_TASKS()
 27.       RETURN decision
 28.     END IF
 29.   END FOR
 30.
 31.   allDecisions.addAll(levelDecisions)
 32. END FOR
 33.
 34. // Compose all decisions
 35. finalDecision ← ComposeDecisions(allDecisions)
 36.
 37. RETURN finalDecision
END ALGORITHM
```

---

## Complexity Analysis

### Time Complexity

| Operation | Best Case | Average Case | Worst Case | Notes |
|-----------|-----------|--------------|------------|-------|
| Policy Parsing | O(n) | O(n) | O(n) | n = policy size |
| Rule Evaluation (linear) | O(1) | O(r) | O(r) | r = number of rules |
| Rule Evaluation (tree) | O(log r) | O(log r) | O(r) | With decision tree |
| Cache Lookup | O(1) | O(1) | O(1) | Hash-based cache |
| Condition Evaluation | O(1) | O(c) | O(c²) | c = condition complexity |
| Multi-policy Composition | O(p) | O(p) | O(p²) | p = number of policies |

### Space Complexity

| Component | Space Complexity | Notes |
|-----------|------------------|-------|
| Parsed Policy AST | O(n) | n = policy size |
| Decision Tree | O(r × c) | r = rules, c = conditions |
| L1 Cache | O(k₁) | k₁ = cache size limit |
| L2 Cache | O(k₂) | k₂ = distributed cache size |
| Evaluation Context | O(d) | d = request data size |

---

## Conclusion

This pseudocode specification provides a comprehensive foundation for implementing the LLM-Policy-Engine with:

1. **Robust DSL** with formal grammar and type system
2. **Efficient algorithms** for parsing, evaluation, and caching
3. **Scalable architecture** supporting parallel evaluation and multi-level caching
4. **Flexible policy composition** with conflict resolution
5. **Real-world examples** covering cost, security, compliance, and rate limiting

The design prioritizes performance, type safety, and composability while maintaining clarity and maintainability.
