#!/usr/bin/env node
/**
 * LLM-Policy-Engine CLI
 * Command-line interface for policy management and evaluation
 */
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { YAMLParser } from '../core/parser/yaml-parser';
import { JSONParser } from '../core/parser/json-parser';
import { SchemaValidator } from '../core/validator/schema-validator';
import { PolicyRepository } from '../db/models/policy-repository';
import { EvaluationRepository } from '../db/models/evaluation-repository';
import { PolicyEngine } from '../core/engine/policy-engine';
import { db } from '../db/client';
import { MigrationRunner } from '../db/migrate';
import { Policy, PolicyEvaluationRequest, EvaluationContext } from '../types/policy';
import { v4 as uuidv4 } from 'uuid';

const program = new Command();
const policyRepository = new PolicyRepository();
const evaluationRepository = new EvaluationRepository();
const yamlParser = new YAMLParser();
const jsonParser = new JSONParser();
const validator = new SchemaValidator();

program
  .name('llm-policy')
  .description('LLM Policy Engine CLI - Manage and evaluate policies')
  .version('1.0.0');

// Policy management commands
const policyCommand = program.command('policy').description('Manage policies');

policyCommand
  .command('create')
  .description('Create a new policy from file')
  .argument('<file>', 'Policy file (YAML or JSON)')
  .option('-c, --created-by <user>', 'User creating the policy')
  .action(async (file: string, options) => {
    try {
      const content = readFileSync(file, 'utf-8');
      const policy = file.endsWith('.yaml') || file.endsWith('.yml')
        ? yamlParser.parse(content)
        : jsonParser.parse(content);

      const validation = validator.validate(policy);
      if (!validation.valid) {
        console.error('Policy validation failed:');
        validation.errors.forEach((err) => console.error(`  - ${err}`));
        process.exit(1);
      }

      const created = await policyRepository.create(policy, options.createdBy);
      console.log(`Policy created successfully: ${created.metadata.id}`);
      console.log(JSON.stringify(created, null, 2));

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to create policy:', error);
      await db.close();
      process.exit(1);
    }
  });

policyCommand
  .command('update')
  .description('Update an existing policy')
  .argument('<id>', 'Policy ID')
  .argument('<file>', 'Policy file (YAML or JSON)')
  .action(async (id: string, file: string) => {
    try {
      const content = readFileSync(file, 'utf-8');
      const policy = file.endsWith('.yaml') || file.endsWith('.yml')
        ? yamlParser.parse(content)
        : jsonParser.parse(content);

      const validation = validator.validate(policy);
      if (!validation.valid) {
        console.error('Policy validation failed:');
        validation.errors.forEach((err) => console.error(`  - ${err}`));
        process.exit(1);
      }

      const updated = await policyRepository.update(id, policy);
      console.log(`Policy updated successfully: ${updated.metadata.id}`);
      console.log(JSON.stringify(updated, null, 2));

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to update policy:', error);
      await db.close();
      process.exit(1);
    }
  });

policyCommand
  .command('delete')
  .description('Delete a policy')
  .argument('<id>', 'Policy ID')
  .action(async (id: string) => {
    try {
      await policyRepository.delete(id);
      console.log(`Policy deleted successfully: ${id}`);

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to delete policy:', error);
      await db.close();
      process.exit(1);
    }
  });

policyCommand
  .command('list')
  .description('List all policies')
  .option('-n, --namespace <namespace>', 'Filter by namespace')
  .option('-s, --status <status>', 'Filter by status (active, draft, deprecated)')
  .action(async (options) => {
    try {
      let policies: Policy[];

      if (options.namespace) {
        policies = await policyRepository.findByNamespace(options.namespace);
      } else {
        policies = await policyRepository.findActive();
      }

      if (options.status) {
        policies = policies.filter((p) => p.status === options.status);
      }

      console.log(`Found ${policies.length} policies:\n`);
      policies.forEach((policy) => {
        console.log(`${policy.metadata.id}`);
        console.log(`  Name: ${policy.metadata.name}`);
        console.log(`  Namespace: ${policy.metadata.namespace}`);
        console.log(`  Version: ${policy.metadata.version}`);
        console.log(`  Status: ${policy.status}`);
        console.log(`  Priority: ${policy.metadata.priority || 0}`);
        console.log(`  Rules: ${policy.rules.length}`);
        console.log();
      });

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to list policies:', error);
      await db.close();
      process.exit(1);
    }
  });

policyCommand
  .command('get')
  .description('Get policy details')
  .argument('<id>', 'Policy ID')
  .option('-o, --output <format>', 'Output format (json, yaml)', 'json')
  .action(async (id: string, options) => {
    try {
      const policy = await policyRepository.findById(id);
      if (!policy) {
        console.error(`Policy not found: ${id}`);
        process.exit(1);
      }

      if (options.output === 'yaml') {
        const yaml = require('yaml');
        console.log(yaml.stringify(policy));
      } else {
        console.log(JSON.stringify(policy, null, 2));
      }

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to get policy:', error);
      await db.close();
      process.exit(1);
    }
  });

policyCommand
  .command('validate')
  .description('Validate a policy file without creating it')
  .argument('<file>', 'Policy file (YAML or JSON)')
  .action(async (file: string) => {
    try {
      const content = readFileSync(file, 'utf-8');
      const policy = file.endsWith('.yaml') || file.endsWith('.yml')
        ? yamlParser.parse(content)
        : jsonParser.parse(content);

      const validation = validator.validate(policy);

      if (validation.valid) {
        console.log('Policy is valid');
        console.log(`  ID: ${policy.metadata.id}`);
        console.log(`  Name: ${policy.metadata.name}`);
        console.log(`  Rules: ${policy.rules.length}`);
      } else {
        console.error('Policy validation failed:');
        validation.errors.forEach((err) => console.error(`  - ${err}`));
        process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error('Failed to validate policy:', error);
      process.exit(1);
    }
  });

// Evaluation commands
const evalCommand = program.command('evaluate').description('Evaluate policies');

evalCommand
  .command('run')
  .description('Evaluate a request against policies')
  .option('-c, --context <file>', 'Context JSON file')
  .option('-p, --policies <ids>', 'Comma-separated policy IDs')
  .option('-t, --trace', 'Enable trace mode')
  .option('-d, --dry-run', 'Dry run mode')
  .action(async (options) => {
    try {
      let context: EvaluationContext;

      if (options.context) {
        const contextContent = readFileSync(options.context, 'utf-8');
        context = JSON.parse(contextContent);
      } else {
        console.error('Context file required (-c, --context)');
        process.exit(1);
      }

      const policies = await policyRepository.findActive();
      const engine = new PolicyEngine(policies);

      const request: PolicyEvaluationRequest = {
        requestId: uuidv4(),
        context,
        policies: options.policies ? options.policies.split(',') : undefined,
        trace: options.trace || false,
        dryRun: options.dryRun || false,
      };

      const response = await engine.evaluate(request);

      console.log('Evaluation Result:');
      console.log(JSON.stringify(response, null, 2));

      if (!options.dryRun) {
        await evaluationRepository.log(request, response);
        console.log('\nEvaluation logged to database');
      }

      await db.close();
      process.exit(response.decision.allowed ? 0 : 1);
    } catch (error) {
      console.error('Evaluation failed:', error);
      await db.close();
      process.exit(1);
    }
  });

evalCommand
  .command('history')
  .description('View evaluation history')
  .option('-r, --request-id <id>', 'Filter by request ID')
  .option('-p, --policy-id <id>', 'Filter by policy ID')
  .option('-l, --limit <number>', 'Limit results', '20')
  .action(async (options) => {
    try {
      const filters: any = {
        limit: parseInt(options.limit, 10),
      };

      if (options.requestId) {
        const evaluation = await evaluationRepository.findByRequestId(options.requestId);
        if (evaluation) {
          console.log(JSON.stringify(evaluation, null, 2));
        } else {
          console.log('Evaluation not found');
        }
      } else if (options.policyId) {
        const evaluations = await evaluationRepository.findByPolicyId(
          options.policyId,
          filters.limit,
        );
        console.log(`Found ${evaluations.length} evaluations:\n`);
        console.log(JSON.stringify(evaluations, null, 2));
      } else {
        const evaluations = await evaluationRepository.find(filters);
        console.log(`Found ${evaluations.length} evaluations:\n`);
        console.log(JSON.stringify(evaluations, null, 2));
      }

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to get evaluation history:', error);
      await db.close();
      process.exit(1);
    }
  });

evalCommand
  .command('stats')
  .description('View evaluation statistics')
  .option('-d, --days <number>', 'Days to look back', '7')
  .action(async (options) => {
    try {
      const days = parseInt(options.days, 10);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await evaluationRepository.getStats(startDate);

      console.log('Evaluation Statistics:');
      console.log(`  Total Evaluations: ${stats.total}`);
      console.log(`  Allowed: ${stats.allowed} (${((stats.allowed / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Denied: ${stats.denied} (${((stats.denied / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Warned: ${stats.warned} (${((stats.warned / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Modified: ${stats.modified} (${((stats.modified / stats.total) * 100).toFixed(1)}%)`);
      console.log(`  Avg Evaluation Time: ${stats.avgEvaluationTimeMs.toFixed(2)}ms`);
      console.log(`  Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to get evaluation stats:', error);
      await db.close();
      process.exit(1);
    }
  });

// Database commands
const dbCommand = program.command('db').description('Database management');

dbCommand
  .command('migrate')
  .description('Run database migrations')
  .action(async () => {
    try {
      const migrationRunner = new MigrationRunner();
      await migrationRunner.up();
      console.log('Database migrations completed successfully');

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Migration failed:', error);
      await db.close();
      process.exit(1);
    }
  });

dbCommand
  .command('migrate:status')
  .description('Check migration status')
  .action(async () => {
    try {
      const migrationRunner = new MigrationRunner();
      const status = await migrationRunner.status();

      console.log('\nApplied migrations:');
      status.applied.forEach((m) => console.log(`  ✓ ${m.version} - ${m.name}`));

      console.log('\nPending migrations:');
      status.pending.forEach((m) => console.log(`  ○ ${m.version} - ${m.name}`));

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Failed to get migration status:', error);
      await db.close();
      process.exit(1);
    }
  });

dbCommand
  .command('migrate:rollback')
  .description('Rollback last migration')
  .action(async () => {
    try {
      const migrationRunner = new MigrationRunner();
      await migrationRunner.down();
      console.log('Migration rolled back successfully');

      await db.close();
      process.exit(0);
    } catch (error) {
      console.error('Rollback failed:', error);
      await db.close();
      process.exit(1);
    }
  });

// Server commands
program
  .command('server:start')
  .description('Start the API server')
  .option('-p, --port <port>', 'Server port')
  .action(async (options) => {
    try {
      const { startAPIServer } = await import('../api/server');
      await startAPIServer(options.port ? parseInt(options.port, 10) : undefined);
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

program
  .command('grpc:start')
  .description('Start the gRPC server')
  .option('-p, --port <port>', 'gRPC server port')
  .action(async (options) => {
    try {
      const { startGRPCServer } = await import('../grpc/server');
      await startGRPCServer(options.port ? parseInt(options.port, 10) : undefined);
    } catch (error) {
      console.error('Failed to start gRPC server:', error);
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);
