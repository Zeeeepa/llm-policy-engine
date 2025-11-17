/**
 * Comprehensive Unit Tests for TokenCounter
 * Enterprise-grade test coverage for token estimation
 * Target: 80%+ coverage
 */
import { TokenCounter } from '../token-counter';

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = new TokenCounter();
  });

  describe('estimateTokens', () => {
    describe('Basic Estimation', () => {
      it('should estimate tokens for simple text', () => {
        const text = 'Hello, world!'; // ~13 chars = ~3 tokens
        const result = counter.estimateTokens(text);

        expect(result.tokens).toBeGreaterThan(0);
        expect(result.tokens).toBeLessThanOrEqual(Math.ceil(text.length / 4));
        expect(result.method).toBe('estimate');
      });

      it('should return 0 tokens for empty string', () => {
        const result = counter.estimateTokens('');

        expect(result.tokens).toBe(0);
        expect(result.method).toBe('exact');
      });

      it('should return 0 tokens for null/undefined text', () => {
        const result1 = counter.estimateTokens(null as any);
        const result2 = counter.estimateTokens(undefined as any);

        expect(result1.tokens).toBe(0);
        expect(result2.tokens).toBe(0);
      });

      it('should estimate based on ~4 chars per token heuristic', () => {
        const text = 'A'.repeat(100); // 100 chars = ~25 tokens
        const result = counter.estimateTokens(text);

        expect(result.tokens).toBe(25);
        expect(result.method).toBe('estimate');
      });

      it('should round up fractional tokens', () => {
        const text = 'ABC'; // 3 chars = 0.75 tokens, should round to 1
        const result = counter.estimateTokens(text);

        expect(result.tokens).toBe(1);
      });
    });

    describe('Model-Specific Estimation', () => {
      describe('GPT-4 Models', () => {
        it('should estimate for gpt-4', () => {
          const text = 'This is a test prompt for GPT-4 model';
          const result = counter.estimateTokens(text, 'gpt-4');

          expect(result.tokens).toBeGreaterThan(0);
          expect(result.tokens).toBe(Math.ceil(text.length / 4));
        });

        it('should estimate for gpt-4-turbo', () => {
          const text = 'A'.repeat(40); // 40 chars = 10 tokens
          const result = counter.estimateTokens(text, 'gpt-4-turbo');

          expect(result.tokens).toBe(10);
        });

        it('should estimate for gpt-4-32k', () => {
          const text = 'Test prompt';
          const result = counter.estimateTokens(text, 'gpt-4-32k');

          expect(result.tokens).toBe(Math.ceil(text.length / 4));
        });
      });

      describe('GPT-3.5 Models', () => {
        it('should estimate for gpt-3.5-turbo', () => {
          const text = 'This is a test';
          const result = counter.estimateTokens(text, 'gpt-3.5-turbo');

          expect(result.tokens).toBe(Math.ceil(text.length / 4));
        });

        it('should estimate for gpt-3.5-turbo-16k', () => {
          const text = 'A'.repeat(100);
          const result = counter.estimateTokens(text, 'gpt-3.5-turbo-16k');

          expect(result.tokens).toBe(25);
        });
      });

      describe('Claude Models', () => {
        it('should estimate for claude models', () => {
          const text = 'This is a test for Claude';
          const result1 = counter.estimateTokens(text, 'claude-3-opus');
          const result2 = counter.estimateTokens(text, 'claude-3-sonnet');
          const result3 = counter.estimateTokens(text, 'claude-2');

          expect(result1.tokens).toBe(Math.ceil(text.length / 4));
          expect(result2.tokens).toBe(Math.ceil(text.length / 4));
          expect(result3.tokens).toBe(Math.ceil(text.length / 4));
        });

        it('should handle claude-instant', () => {
          const text = 'Quick test';
          const result = counter.estimateTokens(text, 'claude-instant');

          expect(result.tokens).toBe(Math.ceil(text.length / 4));
        });
      });

      describe('Google Models', () => {
        it('should estimate for gemini-pro with adjusted ratio', () => {
          const text = 'A'.repeat(45); // 45 chars = 10 tokens (4.5 chars/token)
          const result = counter.estimateTokens(text, 'gemini-pro');

          expect(result.tokens).toBe(10);
        });

        it('should estimate for gemini-ultra', () => {
          const text = 'A'.repeat(90); // 90 chars = 20 tokens
          const result = counter.estimateTokens(text, 'gemini-ultra');

          expect(result.tokens).toBe(20);
        });

        it('should estimate for palm-2', () => {
          const text = 'A'.repeat(45);
          const result = counter.estimateTokens(text, 'palm-2');

          expect(result.tokens).toBe(10);
        });
      });

      describe('Model Name Variations', () => {
        it('should handle model names with version suffixes', () => {
          const text = 'Test';
          const result1 = counter.estimateTokens(text, 'gpt-4-turbo-preview');
          const result2 = counter.estimateTokens(text, 'gpt-4-0125-preview');
          const result3 = counter.estimateTokens(text, 'claude-3-opus-20240229');

          expect(result1.tokens).toBeGreaterThan(0);
          expect(result2.tokens).toBeGreaterThan(0);
          expect(result3.tokens).toBeGreaterThan(0);
        });

        it('should handle case-insensitive model names', () => {
          const text = 'Hello';
          const result1 = counter.estimateTokens(text, 'GPT-4');
          const result2 = counter.estimateTokens(text, 'gpt-4');
          const result3 = counter.estimateTokens(text, 'Gpt-4');

          expect(result1.tokens).toBe(result2.tokens);
          expect(result2.tokens).toBe(result3.tokens);
        });
      });

      describe('Unknown Models', () => {
        it('should use default 4 chars/token for unknown models', () => {
          const text = 'A'.repeat(40);
          const result = counter.estimateTokens(text, 'unknown-model-xyz');

          expect(result.tokens).toBe(10); // Default 4 chars/token
        });
      });
    });

    describe('Text Content Types', () => {
      it('should estimate for code snippets', () => {
        const code = `
          function hello(name) {
            return \`Hello, \${name}!\`;
          }
        `;
        const result = counter.estimateTokens(code);

        expect(result.tokens).toBeGreaterThan(0);
      });

      it('should estimate for JSON', () => {
        const json = JSON.stringify({ key: 'value', nested: { data: [1, 2, 3] } });
        const result = counter.estimateTokens(json);

        expect(result.tokens).toBeGreaterThan(0);
        expect(result.tokens).toBe(Math.ceil(json.length / 4));
      });

      it('should estimate for markdown', () => {
        const markdown = `
# Title

## Subtitle

- Item 1
- Item 2
- Item 3

**Bold text** and *italic text*
        `;
        const result = counter.estimateTokens(markdown);

        expect(result.tokens).toBeGreaterThan(0);
      });

      it('should estimate for very long text', () => {
        const longText = 'word '.repeat(10000); // ~50k chars
        const result = counter.estimateTokens(longText);

        expect(result.tokens).toBeGreaterThan(10000);
        expect(result.tokens).toBeLessThan(15000);
      });

      it('should estimate for text with special characters', () => {
        const text = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
        const result = counter.estimateTokens(text);

        expect(result.tokens).toBeGreaterThan(0);
      });

      it('should estimate for text with unicode', () => {
        const text = 'Hello 世界 🌍 مرحبا';
        const result = counter.estimateTokens(text);

        expect(result.tokens).toBeGreaterThan(0);
      });

      it('should estimate for whitespace-heavy text', () => {
        const text = '    spaces    everywhere    ';
        const result = counter.estimateTokens(text);

        expect(result.tokens).toBeGreaterThan(0);
      });
    });
  });

  describe('estimateConversationTokens', () => {
    it('should estimate tokens for simple conversation', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const result = counter.estimateConversationTokens(messages);

      expect(result.tokens).toBeGreaterThan(0);
      expect(result.method).toBe('estimate');
    });

    it('should add overhead for message formatting', () => {
      const messages = [
        { role: 'user', content: 'Test' },
      ];

      const singleMessageResult = counter.estimateConversationTokens(messages);
      const directResult = counter.estimateTokens('Test');

      // Conversation should have more tokens due to overhead (4 per message + 3 base)
      expect(singleMessageResult.tokens).toBeGreaterThan(directResult.tokens);
      expect(singleMessageResult.tokens).toBe(directResult.tokens + 4 + 3);
    });

    it('should estimate multi-turn conversation', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the weather?' },
        { role: 'assistant', content: 'I don\'t have real-time weather data.' },
        { role: 'user', content: 'Okay, thanks anyway.' },
      ];

      const result = counter.estimateConversationTokens(messages);

      expect(result.tokens).toBeGreaterThan(0);
      // Should include base overhead (3) + per-message overhead (4 * 4 = 16)
      expect(result.tokens).toBeGreaterThan(19);
    });

    it('should handle empty conversation', () => {
      const result = counter.estimateConversationTokens([]);

      expect(result.tokens).toBe(3); // Just base overhead
    });

    it('should handle conversation with empty messages', () => {
      const messages = [
        { role: 'user', content: '' },
        { role: 'assistant', content: '' },
      ];

      const result = counter.estimateConversationTokens(messages);

      // Should have overhead even for empty messages
      expect(result.tokens).toBe(3 + 4 + 4); // Base + 2 message overheads
    });

    it('should use model-specific estimation for conversations', () => {
      const messages = [
        { role: 'user', content: 'A'.repeat(45) }, // 45 chars
      ];

      const gptResult = counter.estimateConversationTokens(messages, 'gpt-4');
      const geminiResult = counter.estimateConversationTokens(messages, 'gemini-pro');

      // Gemini uses 4.5 chars/token vs GPT's 4
      expect(geminiResult.tokens).toBeLessThan(gptResult.tokens);
    });

    it('should estimate long conversation', () => {
      const messages = Array.from({ length: 50 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'This is message number ' + i,
      }));

      const result = counter.estimateConversationTokens(messages);

      expect(result.tokens).toBeGreaterThan(200); // 50 messages with overhead
    });
  });

  describe('calculateMaxTokens', () => {
    it('should calculate max completion tokens', () => {
      const promptTokens = 1000;
      const modelMaxTokens = 4096;
      const requestedCompletion = 1000;

      const maxTokens = counter.calculateMaxTokens(
        promptTokens,
        modelMaxTokens,
        requestedCompletion,
      );

      expect(maxTokens).toBe(1000); // Requested completion fits
    });

    it('should limit to available tokens', () => {
      const promptTokens = 3000;
      const modelMaxTokens = 4096;
      const requestedCompletion = 2000;

      const maxTokens = counter.calculateMaxTokens(
        promptTokens,
        modelMaxTokens,
        requestedCompletion,
      );

      expect(maxTokens).toBe(1096); // Only 1096 tokens available
    });

    it('should use model max when no completion specified', () => {
      const promptTokens = 1000;
      const modelMaxTokens = 4096;

      const maxTokens = counter.calculateMaxTokens(promptTokens, modelMaxTokens);

      expect(maxTokens).toBe(3096); // All available tokens
    });

    it('should return 0 when prompt exceeds model capacity', () => {
      const promptTokens = 5000;
      const modelMaxTokens = 4096;

      const maxTokens = counter.calculateMaxTokens(promptTokens, modelMaxTokens);

      expect(maxTokens).toBe(0);
    });

    it('should handle exact fit', () => {
      const promptTokens = 2048;
      const modelMaxTokens = 4096;
      const requestedCompletion = 2048;

      const maxTokens = counter.calculateMaxTokens(
        promptTokens,
        modelMaxTokens,
        requestedCompletion,
      );

      expect(maxTokens).toBe(2048);
    });

    it('should handle zero prompt tokens', () => {
      const maxTokens = counter.calculateMaxTokens(0, 4096, 1000);
      expect(maxTokens).toBe(1000);
    });
  });

  describe('getModelMaxTokens', () => {
    describe('OpenAI Models', () => {
      it('should return correct limits for GPT-4 variants', () => {
        expect(counter.getModelMaxTokens('gpt-4-turbo')).toBe(128000);
        expect(counter.getModelMaxTokens('gpt-4')).toBe(8192);
        expect(counter.getModelMaxTokens('gpt-4-32k')).toBe(32768);
      });

      it('should return correct limits for GPT-3.5 variants', () => {
        expect(counter.getModelMaxTokens('gpt-3.5-turbo')).toBe(4096);
        expect(counter.getModelMaxTokens('gpt-3.5-turbo-16k')).toBe(16384);
      });

      it('should match GPT-4 Turbo variants', () => {
        expect(counter.getModelMaxTokens('gpt-4-turbo-preview')).toBe(128000);
        expect(counter.getModelMaxTokens('gpt-4-turbo-2024-04-09')).toBe(128000);
        expect(counter.getModelMaxTokens('gpt-4-0125-preview')).toBe(8192); // Matches gpt-4
      });
    });

    describe('Anthropic Models', () => {
      it('should return correct limits for Claude 3 variants', () => {
        expect(counter.getModelMaxTokens('claude-3-opus')).toBe(200000);
        expect(counter.getModelMaxTokens('claude-3-sonnet')).toBe(200000);
        expect(counter.getModelMaxTokens('claude-3-haiku')).toBe(200000);
      });

      it('should return correct limits for Claude 2 variants', () => {
        expect(counter.getModelMaxTokens('claude-2.1')).toBe(200000);
        expect(counter.getModelMaxTokens('claude-2')).toBe(100000);
        expect(counter.getModelMaxTokens('claude-instant')).toBe(100000);
      });

      it('should match Claude variants with version suffixes', () => {
        expect(counter.getModelMaxTokens('claude-3-opus-20240229')).toBe(200000);
        expect(counter.getModelMaxTokens('claude-3-sonnet-20240229')).toBe(200000);
      });
    });

    describe('Google Models', () => {
      it('should return correct limits for Gemini variants', () => {
        expect(counter.getModelMaxTokens('gemini-pro')).toBe(32768);
        expect(counter.getModelMaxTokens('gemini-ultra')).toBe(32768);
      });

      it('should return correct limit for PaLM-2', () => {
        expect(counter.getModelMaxTokens('palm-2')).toBe(8192);
      });
    });

    describe('Case Insensitivity', () => {
      it('should handle uppercase model names', () => {
        expect(counter.getModelMaxTokens('GPT-4')).toBe(8192);
        expect(counter.getModelMaxTokens('CLAUDE-3-OPUS')).toBe(200000);
      });

      it('should handle mixed case', () => {
        expect(counter.getModelMaxTokens('Gpt-4-Turbo')).toBe(128000);
        expect(counter.getModelMaxTokens('Claude-3-Sonnet')).toBe(200000);
      });
    });

    describe('Unknown Models', () => {
      it('should return default 4096 for unknown models', () => {
        expect(counter.getModelMaxTokens('unknown-model')).toBe(4096);
        expect(counter.getModelMaxTokens('future-gpt-5')).toBe(4096);
        expect(counter.getModelMaxTokens('custom-model-123')).toBe(4096);
      });

      it('should return default for empty string', () => {
        expect(counter.getModelMaxTokens('')).toBe(4096);
      });
    });

    describe('Partial Matching', () => {
      it('should match partial model names', () => {
        // "gpt-4" is in "gpt-4-turbo-2024-04-09"
        expect(counter.getModelMaxTokens('gpt-4-custom-variant')).toBe(8192);
        expect(counter.getModelMaxTokens('claude-2-custom')).toBe(100000);
      });
    });
  });

  describe('Real-World Scenarios', () => {
    it('should estimate chatbot conversation', () => {
      const conversation = [
        { role: 'system', content: 'You are a helpful customer service agent.' },
        { role: 'user', content: 'I need help with my order #12345' },
        { role: 'assistant', content: 'I\'d be happy to help! Let me look up order #12345...' },
        { role: 'user', content: 'Thanks! It was supposed to arrive yesterday.' },
      ];

      const result = counter.estimateConversationTokens(conversation, 'gpt-3.5-turbo');
      expect(result.tokens).toBeGreaterThan(20);
      expect(result.tokens).toBeLessThan(100);
    });

    it('should validate if prompt fits in model', () => {
      const longPrompt = 'word '.repeat(5000); // ~25k chars = ~6.25k tokens
      const tokens = counter.estimateTokens(longPrompt).tokens;
      const maxTokens = counter.getModelMaxTokens('gpt-3.5-turbo'); // 4096

      expect(tokens).toBeGreaterThan(maxTokens); // Prompt too long
      expect(counter.calculateMaxTokens(tokens, maxTokens)).toBe(0); // No room for completion
    });

    it('should calculate budget for GPT-4 with long context', () => {
      const document = 'A'.repeat(50000); // ~50k chars = ~12.5k tokens
      const tokens = counter.estimateTokens(document, 'gpt-4-turbo').tokens;
      const modelMax = counter.getModelMaxTokens('gpt-4-turbo');

      expect(tokens).toBeLessThan(modelMax); // Fits in GPT-4 Turbo (128k)
      expect(counter.calculateMaxTokens(tokens, modelMax, 4000)).toBe(4000); // Room for 4k completion
    });

    it('should help choose model based on context length', () => {
      const shortPrompt = 'Summarize this: short text';
      const longPrompt = 'A'.repeat(100000); // ~25k tokens

      const shortTokens = counter.estimateTokens(shortPrompt).tokens;
      const longTokens = counter.estimateTokens(longPrompt).tokens;

      // Short prompt fits in any model
      expect(shortTokens).toBeLessThan(counter.getModelMaxTokens('gpt-3.5-turbo'));

      // Long prompt needs GPT-4 Turbo or Claude 3
      expect(longTokens).toBeGreaterThan(counter.getModelMaxTokens('gpt-3.5-turbo'));
      expect(longTokens).toBeGreaterThan(counter.getModelMaxTokens('gpt-4'));
      expect(longTokens).toBeLessThan(counter.getModelMaxTokens('gpt-4-turbo'));
      expect(longTokens).toBeLessThan(counter.getModelMaxTokens('claude-3-opus'));
    });

    it('should estimate API request limits', () => {
      // Simulate checking if 100 requests fit in rate limit
      const avgPrompt = 'This is an average prompt for testing';
      const avgCompletion = 500; // tokens

      const promptTokens = counter.estimateTokens(avgPrompt).tokens;
      const totalPerRequest = promptTokens + avgCompletion;
      const totalFor100Requests = totalPerRequest * 100;

      expect(totalFor100Requests).toBeGreaterThan(0);
      // Can calculate if this fits in token budget (e.g., 1M tokens/month)
    });
  });

  describe('Edge Cases', () => {
    it('should handle whitespace-only text', () => {
      const text = '     ';
      const result = counter.estimateTokens(text);

      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should handle newlines and tabs', () => {
      const text = '\n\n\t\t\n';
      const result = counter.estimateTokens(text);

      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should handle very short text', () => {
      const result = counter.estimateTokens('a');
      expect(result.tokens).toBe(1);
    });

    it('should handle numbers', () => {
      const text = '1234567890';
      const result = counter.estimateTokens(text);

      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should handle mixed content', () => {
      const text = 'Text 123 !@# \n\t 世界';
      const result = counter.estimateTokens(text);

      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should handle very large text efficiently', () => {
      const hugeText = 'A'.repeat(1000000); // 1M characters

      const start = Date.now();
      const result = counter.estimateTokens(hugeText);
      const duration = Date.now() - start;

      expect(result.tokens).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should be fast (<100ms)
    });

    it('should handle many short estimations efficiently', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        counter.estimateTokens('Short text ' + i);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500); // 1000 estimations in <500ms
    });
  });
});
