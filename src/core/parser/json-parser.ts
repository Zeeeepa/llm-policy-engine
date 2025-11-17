/**
 * JSON Policy Parser
 */
import { Policy } from '../../types/policy';
import { PolicyParseError } from '@utils/errors';
import logger from '@utils/logger';

export class JSONParser {
  parse(content: string): Policy {
    try {
      const parsed = JSON.parse(content);

      if (!parsed) {
        throw new PolicyParseError('Empty policy document');
      }

      // Validate basic structure
      if (!parsed.metadata) {
        throw new PolicyParseError('Missing policy metadata');
      }

      if (!parsed.rules || !Array.isArray(parsed.rules)) {
        throw new PolicyParseError('Missing or invalid rules array');
      }

      const policy: Policy = {
        metadata: {
          id: parsed.metadata.id,
          name: parsed.metadata.name,
          description: parsed.metadata.description,
          version: parsed.metadata.version || '1.0.0',
          namespace: parsed.metadata.namespace || 'default',
          tags: parsed.metadata.tags || [],
          priority: parsed.metadata.priority || 0,
        },
        rules: parsed.rules.map((rule: any, index: number) => ({
          id: rule.id || `rule-${index}`,
          name: rule.name || `Rule ${index}`,
          description: rule.description,
          condition: rule.condition,
          action: rule.action,
          enabled: rule.enabled !== false,
        })),
        status: parsed.status || 'active',
      };

      logger.debug({ policyId: policy.metadata.id }, 'Parsed JSON policy');
      return policy;
    } catch (error) {
      if (error instanceof PolicyParseError) {
        throw error;
      }
      throw new PolicyParseError(`JSON parse error: ${error instanceof Error ? error.message : String(error)}`, {
        originalError: error,
      });
    }
  }

  stringify(policy: Policy, pretty: boolean = false): string {
    try {
      return JSON.stringify(policy, null, pretty ? 2 : 0);
    } catch (error) {
      throw new PolicyParseError(`JSON stringify error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
