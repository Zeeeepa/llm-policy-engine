/**
 * Comprehensive Unit Tests for ConditionEvaluator
 * Enterprise-grade test coverage for all 14 operators and edge cases
 * Target: 90%+ coverage
 */
import { ConditionEvaluator } from '../condition-evaluator';
import { Condition, ConditionOperator, EvaluationContext } from '../../../types/policy';
import { PolicyEvaluationError } from '@utils/errors';

describe('ConditionEvaluator', () => {
  let evaluator: ConditionEvaluator;

  beforeEach(() => {
    evaluator = new ConditionEvaluator();
  });

  describe('Logical Operators', () => {
    describe('AND operator', () => {
      it('should return true when all conditions are true', () => {
        const condition: Condition = {
          operator: ConditionOperator.AND,
          conditions: [
            { operator: ConditionOperator.EQUALS, field: 'user.id', value: 'user-123' },
            { operator: ConditionOperator.GREATER_THAN, field: 'cost.daily', value: 100 },
          ],
        };

        const context: EvaluationContext = {
          user: { id: 'user-123' },
          cost: { daily: 150 },
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
        expect(result.evaluationTimeMs).toBeGreaterThanOrEqual(0);
      });

      it('should return false when any condition is false', () => {
        const condition: Condition = {
          operator: ConditionOperator.AND,
          conditions: [
            { operator: ConditionOperator.EQUALS, field: 'user.id', value: 'user-123' },
            { operator: ConditionOperator.GREATER_THAN, field: 'cost.daily', value: 200 },
          ],
        };

        const context: EvaluationContext = {
          user: { id: 'user-123' },
          cost: { daily: 150 },
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should handle empty conditions array', () => {
        const condition: Condition = {
          operator: ConditionOperator.AND,
          conditions: [],
        };

        const context: EvaluationContext = {} as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true); // Empty AND is vacuously true
      });

      it('should handle nested AND conditions', () => {
        const condition: Condition = {
          operator: ConditionOperator.AND,
          conditions: [
            {
              operator: ConditionOperator.AND,
              conditions: [
                { operator: ConditionOperator.EQUALS, field: 'a', value: 1 },
                { operator: ConditionOperator.EQUALS, field: 'b', value: 2 },
              ],
            },
            { operator: ConditionOperator.EQUALS, field: 'c', value: 3 },
          ],
        };

        const context: EvaluationContext = { a: 1, b: 2, c: 3 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });
    });

    describe('OR operator', () => {
      it('should return true when at least one condition is true', () => {
        const condition: Condition = {
          operator: ConditionOperator.OR,
          conditions: [
            { operator: ConditionOperator.EQUALS, field: 'user.id', value: 'user-999' },
            { operator: ConditionOperator.GREATER_THAN, field: 'cost.daily', value: 100 },
          ],
        };

        const context: EvaluationContext = {
          user: { id: 'user-123' },
          cost: { daily: 150 },
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should return false when all conditions are false', () => {
        const condition: Condition = {
          operator: ConditionOperator.OR,
          conditions: [
            { operator: ConditionOperator.EQUALS, field: 'user.id', value: 'user-999' },
            { operator: ConditionOperator.GREATER_THAN, field: 'cost.daily', value: 200 },
          ],
        };

        const context: EvaluationContext = {
          user: { id: 'user-123' },
          cost: { daily: 150 },
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should handle empty conditions array', () => {
        const condition: Condition = {
          operator: ConditionOperator.OR,
          conditions: [],
        };

        const context: EvaluationContext = {} as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false); // Empty OR is false
      });

      it('should handle nested OR conditions', () => {
        const condition: Condition = {
          operator: ConditionOperator.OR,
          conditions: [
            {
              operator: ConditionOperator.OR,
              conditions: [
                { operator: ConditionOperator.EQUALS, field: 'a', value: 999 },
                { operator: ConditionOperator.EQUALS, field: 'b', value: 2 },
              ],
            },
            { operator: ConditionOperator.EQUALS, field: 'c', value: 999 },
          ],
        };

        const context: EvaluationContext = { a: 1, b: 2, c: 3 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });
    });

    describe('NOT operator', () => {
      it('should negate true condition to false', () => {
        const condition: Condition = {
          operator: ConditionOperator.NOT,
          conditions: [
            { operator: ConditionOperator.EQUALS, field: 'user.id', value: 'user-123' },
          ],
        };

        const context: EvaluationContext = {
          user: { id: 'user-123' },
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should negate false condition to true', () => {
        const condition: Condition = {
          operator: ConditionOperator.NOT,
          conditions: [
            { operator: ConditionOperator.EQUALS, field: 'user.id', value: 'user-999' },
          ],
        };

        const context: EvaluationContext = {
          user: { id: 'user-123' },
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should handle double negation', () => {
        const condition: Condition = {
          operator: ConditionOperator.NOT,
          conditions: [
            {
              operator: ConditionOperator.NOT,
              conditions: [
                { operator: ConditionOperator.EQUALS, field: 'value', value: true },
              ],
            },
          ],
        };

        const context: EvaluationContext = { value: true } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });
    });
  });

  describe('Comparison Operators', () => {
    describe('EQUALS operator', () => {
      it('should compare identical numbers', () => {
        const condition: Condition = {
          operator: ConditionOperator.EQUALS,
          field: 'count',
          value: 42,
        };

        const context: EvaluationContext = { count: 42 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should compare identical strings', () => {
        const condition: Condition = {
          operator: ConditionOperator.EQUALS,
          field: 'name',
          value: 'test',
        };

        const context: EvaluationContext = { name: 'test' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should compare different values as false', () => {
        const condition: Condition = {
          operator: ConditionOperator.EQUALS,
          field: 'count',
          value: 42,
        };

        const context: EvaluationContext = { count: 99 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should handle null values', () => {
        const condition: Condition = {
          operator: ConditionOperator.EQUALS,
          field: 'value',
          value: null,
        };

        const context: EvaluationContext = { value: null } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should handle undefined values', () => {
        const condition: Condition = {
          operator: ConditionOperator.EQUALS,
          field: 'nonexistent',
          value: undefined,
        };

        const context: EvaluationContext = {} as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should compare objects using deep equality', () => {
        const condition: Condition = {
          operator: ConditionOperator.EQUALS,
          field: 'user',
          value: { id: '123', name: 'Test' },
        };

        const context: EvaluationContext = {
          user: { id: '123', name: 'Test' },
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should compare arrays using deep equality', () => {
        const condition: Condition = {
          operator: ConditionOperator.EQUALS,
          field: 'tags',
          value: ['a', 'b', 'c'],
        };

        const context: EvaluationContext = {
          tags: ['a', 'b', 'c'],
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should use string coercion for mismatched types', () => {
        const condition: Condition = {
          operator: ConditionOperator.EQUALS,
          field: 'value',
          value: '42',
        };

        const context: EvaluationContext = { value: 42 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true); // String coercion: "42" === "42"
      });
    });

    describe('NOT_EQUALS operator', () => {
      it('should return true for different values', () => {
        const condition: Condition = {
          operator: ConditionOperator.NOT_EQUALS,
          field: 'status',
          value: 'inactive',
        };

        const context: EvaluationContext = { status: 'active' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should return false for identical values', () => {
        const condition: Condition = {
          operator: ConditionOperator.NOT_EQUALS,
          field: 'status',
          value: 'active',
        };

        const context: EvaluationContext = { status: 'active' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });
    });

    describe('GREATER_THAN operator', () => {
      it('should compare numbers correctly', () => {
        const condition: Condition = {
          operator: ConditionOperator.GREATER_THAN,
          field: 'age',
          value: 18,
        };

        const context: EvaluationContext = { age: 25 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should return false when values are equal', () => {
        const condition: Condition = {
          operator: ConditionOperator.GREATER_THAN,
          field: 'age',
          value: 18,
        };

        const context: EvaluationContext = { age: 18 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should return false when left is smaller', () => {
        const condition: Condition = {
          operator: ConditionOperator.GREATER_THAN,
          field: 'age',
          value: 30,
        };

        const context: EvaluationContext = { age: 18 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should handle string comparison when not numeric', () => {
        const condition: Condition = {
          operator: ConditionOperator.GREATER_THAN,
          field: 'name',
          value: 'apple',
        };

        const context: EvaluationContext = { name: 'banana' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true); // "banana" > "apple" lexicographically
      });

      it('should handle numeric strings', () => {
        const condition: Condition = {
          operator: ConditionOperator.GREATER_THAN,
          field: 'value',
          value: '100',
        };

        const context: EvaluationContext = { value: '200' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });
    });

    describe('GREATER_THAN_OR_EQUAL operator', () => {
      it('should return true when greater', () => {
        const condition: Condition = {
          operator: ConditionOperator.GREATER_THAN_OR_EQUAL,
          field: 'score',
          value: 50,
        };

        const context: EvaluationContext = { score: 75 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should return true when equal', () => {
        const condition: Condition = {
          operator: ConditionOperator.GREATER_THAN_OR_EQUAL,
          field: 'score',
          value: 50,
        };

        const context: EvaluationContext = { score: 50 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should return false when less', () => {
        const condition: Condition = {
          operator: ConditionOperator.GREATER_THAN_OR_EQUAL,
          field: 'score',
          value: 50,
        };

        const context: EvaluationContext = { score: 25 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });
    });

    describe('LESS_THAN operator', () => {
      it('should compare numbers correctly', () => {
        const condition: Condition = {
          operator: ConditionOperator.LESS_THAN,
          field: 'age',
          value: 30,
        };

        const context: EvaluationContext = { age: 18 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should return false when values are equal', () => {
        const condition: Condition = {
          operator: ConditionOperator.LESS_THAN,
          field: 'age',
          value: 18,
        };

        const context: EvaluationContext = { age: 18 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should return false when left is greater', () => {
        const condition: Condition = {
          operator: ConditionOperator.LESS_THAN,
          field: 'age',
          value: 18,
        };

        const context: EvaluationContext = { age: 30 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });
    });

    describe('LESS_THAN_OR_EQUAL operator', () => {
      it('should return true when less', () => {
        const condition: Condition = {
          operator: ConditionOperator.LESS_THAN_OR_EQUAL,
          field: 'age',
          value: 30,
        };

        const context: EvaluationContext = { age: 18 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should return true when equal', () => {
        const condition: Condition = {
          operator: ConditionOperator.LESS_THAN_OR_EQUAL,
          field: 'age',
          value: 30,
        };

        const context: EvaluationContext = { age: 30 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should return false when greater', () => {
        const condition: Condition = {
          operator: ConditionOperator.LESS_THAN_OR_EQUAL,
          field: 'age',
          value: 18,
        };

        const context: EvaluationContext = { age: 30 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });
    });
  });

  describe('Membership Operators', () => {
    describe('IN operator', () => {
      it('should find value in array', () => {
        const condition: Condition = {
          operator: ConditionOperator.IN,
          field: 'status',
          value: ['active', 'pending', 'processing'],
        };

        const context: EvaluationContext = { status: 'active' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should not find value not in array', () => {
        const condition: Condition = {
          operator: ConditionOperator.IN,
          field: 'status',
          value: ['active', 'pending'],
        };

        const context: EvaluationContext = { status: 'inactive' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should return false for non-array value', () => {
        const condition: Condition = {
          operator: ConditionOperator.IN,
          field: 'status',
          value: 'active',
        };

        const context: EvaluationContext = { status: 'active' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should handle empty array', () => {
        const condition: Condition = {
          operator: ConditionOperator.IN,
          field: 'status',
          value: [],
        };

        const context: EvaluationContext = { status: 'active' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should find number in array', () => {
        const condition: Condition = {
          operator: ConditionOperator.IN,
          field: 'code',
          value: [200, 201, 204],
        };

        const context: EvaluationContext = { code: 200 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });
    });

    describe('NOT_IN operator', () => {
      it('should return true when value not in array', () => {
        const condition: Condition = {
          operator: ConditionOperator.NOT_IN,
          field: 'status',
          value: ['active', 'pending'],
        };

        const context: EvaluationContext = { status: 'inactive' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should return false when value in array', () => {
        const condition: Condition = {
          operator: ConditionOperator.NOT_IN,
          field: 'status',
          value: ['active', 'pending'],
        };

        const context: EvaluationContext = { status: 'active' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });
    });
  });

  describe('Collection Operators', () => {
    describe('CONTAINS operator', () => {
      it('should find substring in string', () => {
        const condition: Condition = {
          operator: ConditionOperator.CONTAINS,
          field: 'message',
          value: 'error',
        };

        const context: EvaluationContext = {
          message: 'This is an error message',
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should not find non-existent substring', () => {
        const condition: Condition = {
          operator: ConditionOperator.CONTAINS,
          field: 'message',
          value: 'success',
        };

        const context: EvaluationContext = {
          message: 'This is an error message',
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should find value in array', () => {
        const condition: Condition = {
          operator: ConditionOperator.CONTAINS,
          field: 'tags',
          value: 'urgent',
        };

        const context: EvaluationContext = {
          tags: ['urgent', 'critical', 'high-priority'],
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should find value in object', () => {
        const condition: Condition = {
          operator: ConditionOperator.CONTAINS,
          field: 'metadata',
          value: 'test-value',
        };

        const context: EvaluationContext = {
          metadata: { key1: 'test-value', key2: 'other' },
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should return false for null haystack', () => {
        const condition: Condition = {
          operator: ConditionOperator.CONTAINS,
          field: 'value',
          value: 'test',
        };

        const context: EvaluationContext = { value: null } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should return false for non-collection types', () => {
        const condition: Condition = {
          operator: ConditionOperator.CONTAINS,
          field: 'value',
          value: 'test',
        };

        const context: EvaluationContext = { value: 42 } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });
    });

    describe('NOT_CONTAINS operator', () => {
      it('should return true when substring not found', () => {
        const condition: Condition = {
          operator: ConditionOperator.NOT_CONTAINS,
          field: 'message',
          value: 'success',
        };

        const context: EvaluationContext = {
          message: 'This is an error message',
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should return false when substring found', () => {
        const condition: Condition = {
          operator: ConditionOperator.NOT_CONTAINS,
          field: 'message',
          value: 'error',
        };

        const context: EvaluationContext = {
          message: 'This is an error message',
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });
    });
  });

  describe('Pattern Matching', () => {
    describe('MATCHES operator', () => {
      it('should match valid regex pattern', () => {
        const condition: Condition = {
          operator: ConditionOperator.MATCHES,
          field: 'email',
          value: '^[a-z]+@[a-z]+\\.[a-z]+$',
        };

        const context: EvaluationContext = {
          email: 'test@example.com',
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should not match invalid pattern', () => {
        const condition: Condition = {
          operator: ConditionOperator.MATCHES,
          field: 'email',
          value: '^[0-9]+$',
        };

        const context: EvaluationContext = {
          email: 'test@example.com',
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });

      it('should handle complex regex patterns', () => {
        const condition: Condition = {
          operator: ConditionOperator.MATCHES,
          field: 'phone',
          value: '^\\+?1?\\d{9,15}$',
        };

        const context: EvaluationContext = {
          phone: '+14155552671',
        } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(true);
      });

      it('should return false for invalid regex', () => {
        const condition: Condition = {
          operator: ConditionOperator.MATCHES,
          field: 'value',
          value: '[invalid(regex',
        };

        const context: EvaluationContext = { value: 'test' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false); // Invalid regex returns false
      });

      it('should match case-sensitive by default', () => {
        const condition: Condition = {
          operator: ConditionOperator.MATCHES,
          field: 'value',
          value: '^test$',
        };

        const context: EvaluationContext = { value: 'TEST' } as any;

        const result = evaluator.evaluate(condition, context);
        expect(result.result).toBe(false);
      });
    });
  });

  describe('Dot Notation Field Access', () => {
    it('should access nested object properties', () => {
      const condition: Condition = {
        operator: ConditionOperator.EQUALS,
        field: 'user.profile.name',
        value: 'John Doe',
      };

      const context: EvaluationContext = {
        user: {
          profile: {
            name: 'John Doe',
          },
        },
      } as any;

      const result = evaluator.evaluate(condition, context);
      expect(result.result).toBe(true);
    });

    it('should handle deeply nested properties', () => {
      const condition: Condition = {
        operator: ConditionOperator.EQUALS,
        field: 'a.b.c.d.e',
        value: 'deep',
      };

      const context: EvaluationContext = {
        a: { b: { c: { d: { e: 'deep' } } } },
      } as any;

      const result = evaluator.evaluate(condition, context);
      expect(result.result).toBe(true);
    });

    it('should handle array indices', () => {
      const condition: Condition = {
        operator: ConditionOperator.EQUALS,
        field: 'items[0].name',
        value: 'first',
      };

      const context: EvaluationContext = {
        items: [{ name: 'first' }, { name: 'second' }],
      } as any;

      const result = evaluator.evaluate(condition, context);
      expect(result.result).toBe(true);
    });

    it('should return undefined for non-existent paths', () => {
      const condition: Condition = {
        operator: ConditionOperator.EQUALS,
        field: 'nonexistent.path',
        value: undefined,
      };

      const context: EvaluationContext = {} as any;

      const result = evaluator.evaluate(condition, context);
      expect(result.result).toBe(true); // undefined === undefined
    });
  });

  describe('Error Handling', () => {
    it('should throw PolicyEvaluationError for unknown operator', () => {
      const condition: Condition = {
        operator: 'UNKNOWN_OPERATOR' as any,
        field: 'value',
        value: 'test',
      };

      const context: EvaluationContext = { value: 'test' } as any;

      expect(() => evaluator.evaluate(condition, context)).toThrow(PolicyEvaluationError);
      expect(() => evaluator.evaluate(condition, context)).toThrow(
        /Unknown operator: UNKNOWN_OPERATOR/,
      );
    });

    it('should include condition details in error', () => {
      const condition: Condition = {
        operator: 'INVALID' as any,
        field: 'test',
        value: 'value',
      };

      const context: EvaluationContext = {} as any;

      try {
        evaluator.evaluate(condition, context);
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(PolicyEvaluationError);
        expect((error as any).details).toBeDefined();
      }
    });

    it('should measure evaluation time even on error', () => {
      const condition: Condition = {
        operator: 'INVALID' as any,
        field: 'test',
        value: 'value',
      };

      const context: EvaluationContext = {} as any;

      try {
        evaluator.evaluate(condition, context);
      } catch (error) {
        expect((error as any).details?.evaluationTimeMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Performance and Metadata', () => {
    it('should return evaluation time metadata', () => {
      const condition: Condition = {
        operator: ConditionOperator.EQUALS,
        field: 'value',
        value: 'test',
      };

      const context: EvaluationContext = { value: 'test' } as any;

      const result = evaluator.evaluate(condition, context);
      expect(result.evaluationTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.evaluationTimeMs).toBe('number');
    });

    it('should return details about the evaluation', () => {
      const condition: Condition = {
        operator: ConditionOperator.EQUALS,
        field: 'value',
        value: 'test',
      };

      const context: EvaluationContext = { value: 'test' } as any;

      const result = evaluator.evaluate(condition, context);
      expect(result.details).toBeDefined();
      expect(result.details).toContain('eq');
    });
  });

  describe('Complex Real-World Scenarios', () => {
    it('should handle complex policy with multiple nested conditions', () => {
      const condition: Condition = {
        operator: ConditionOperator.AND,
        conditions: [
          {
            operator: ConditionOperator.OR,
            conditions: [
              { operator: ConditionOperator.EQUALS, field: 'llm.provider', value: 'openai' },
              { operator: ConditionOperator.EQUALS, field: 'llm.provider', value: 'anthropic' },
            ],
          },
          {
            operator: ConditionOperator.GREATER_THAN,
            field: 'llm.estimatedTokens',
            value: 1000,
          },
          {
            operator: ConditionOperator.LESS_THAN,
            field: 'cost.daily',
            value: 1000,
          },
          {
            operator: ConditionOperator.NOT,
            conditions: [{ operator: ConditionOperator.EQUALS, field: 'llm.containsPII', value: true }],
          },
        ],
      };

      const context: EvaluationContext = {
        llm: {
          provider: 'openai',
          estimatedTokens: 2000,
          containsPII: false,
        },
        cost: {
          daily: 500,
        },
      } as any;

      const result = evaluator.evaluate(condition, context);
      expect(result.result).toBe(true);
    });

    it('should handle cost budget policy', () => {
      const condition: Condition = {
        operator: ConditionOperator.AND,
        conditions: [
          {
            operator: ConditionOperator.GREATER_THAN,
            field: 'cost.estimatedCost',
            value: 0.10,
          },
          {
            operator: ConditionOperator.IN,
            field: 'team.tier',
            value: ['free', 'basic'],
          },
        ],
      };

      const context: EvaluationContext = {
        cost: { estimatedCost: 0.25 },
        team: { tier: 'free' },
      } as any;

      const result = evaluator.evaluate(condition, context);
      expect(result.result).toBe(true);
    });

    it('should handle security policy with PII and prompt injection', () => {
      const condition: Condition = {
        operator: ConditionOperator.OR,
        conditions: [
          {
            operator: ConditionOperator.EQUALS,
            field: 'llm.containsPII',
            value: true,
          },
          {
            operator: ConditionOperator.CONTAINS,
            field: 'llm.prompt',
            value: 'ignore previous instructions',
          },
          {
            operator: ConditionOperator.MATCHES,
            field: 'llm.prompt',
            value: 'jailbreak|bypass|override',
          },
        ],
      };

      const context: EvaluationContext = {
        llm: {
          containsPII: false,
          prompt: 'Tell me how to bypass security',
        },
      } as any;

      const result = evaluator.evaluate(condition, context);
      expect(result.result).toBe(true); // Matches "bypass" in regex
    });

    it('should handle model selection policy', () => {
      const condition: Condition = {
        operator: ConditionOperator.AND,
        conditions: [
          {
            operator: ConditionOperator.IN,
            field: 'llm.model',
            value: ['gpt-4', 'gpt-4-turbo', 'claude-3-opus'],
          },
          {
            operator: ConditionOperator.GREATER_THAN_OR_EQUAL,
            field: 'user.tier',
            value: 3, // Premium tier
          },
        ],
      };

      const context: EvaluationContext = {
        llm: { model: 'gpt-4' },
        user: { tier: 5 },
      } as any;

      const result = evaluator.evaluate(condition, context);
      expect(result.result).toBe(true);
    });
  });
});
