/**
 * Policy Parser - Main Interface
 */
import { Policy } from '../../types/policy';
import { YAMLParser } from './yaml-parser';
import { JSONParser } from './json-parser';
import { PolicyParseError } from '@utils/errors';

export class PolicyParser {
  private yamlParser: YAMLParser;
  private jsonParser: JSONParser;

  constructor() {
    this.yamlParser = new YAMLParser();
    this.jsonParser = new JSONParser();
  }

  parse(content: string, format?: 'yaml' | 'json'): Policy {
    if (!format) {
      // Auto-detect format
      const trimmed = content.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        format = 'json';
      } else {
        format = 'yaml';
      }
    }

    if (format === 'yaml') {
      return this.yamlParser.parse(content);
    } else if (format === 'json') {
      return this.jsonParser.parse(content);
    } else {
      throw new PolicyParseError(`Unsupported format: ${format}`);
    }
  }

  parseYaml(content: string): Policy {
    return this.yamlParser.parse(content);
  }

  parseJson(content: string): Policy {
    return this.jsonParser.parse(content);
  }

  stringifyYaml(policy: Policy): string {
    return this.yamlParser.stringify(policy);
  }

  stringifyJson(policy: Policy, pretty: boolean = false): string {
    return this.jsonParser.stringify(policy, pretty);
  }
}

export * from './yaml-parser';
export * from './json-parser';
