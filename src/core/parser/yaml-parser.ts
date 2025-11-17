/**
 * YAML Policy Parser
 */
import YAML from 'yaml';
import { Policy } from '../../types/policy';
import { PolicyParseError } from '@utils/errors';
import logger from '@utils/logger';

export class YAMLParser {
  parse(content: string): Policy {
    try {
      const parsed = YAML.parse(content);

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

      logger.debug({ policyId: policy.metadata.id }, 'Parsed YAML policy');
      return policy;
    } catch (error) {
      if (error instanceof PolicyParseError) {
        throw error;
      }
      throw new PolicyParseError(`YAML parse error: ${error instanceof Error ? error.message : String(error)}`, {
        originalError: error,
      });
    }
  }

  stringify(policy: Policy): string {
    try {
      return YAML.stringify(policy);
    } catch (error) {
      throw new PolicyParseError(`YAML stringify error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
