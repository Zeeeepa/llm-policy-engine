/**
 * gRPC Policy Service Implementation
 */
import { ServerUnaryCall, ServerWritableStream, sendUnaryData } from '@grpc/grpc-js';
import { PolicyRepository } from '@db/models/policy-repository';
import { EvaluationRepository } from '@db/models/evaluation-repository';
import { PolicyEngine } from '@core/engine/policy-engine';
import { SchemaValidator } from '@core/validator/schema-validator';
import { cacheManager } from '@cache/cache-manager';
import logger from '@utils/logger';
import { Policy, PolicyEvaluationRequest, EvaluationContext, PolicyStatus } from '../../types/policy';
import { v4 as uuidv4 } from 'uuid';

const policyRepository = new PolicyRepository();
const evaluationRepository = new EvaluationRepository();
const validator = new SchemaValidator();

export class PolicyServiceImpl {
  /**
   * Create a new policy
   */
  async createPolicy(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>,
  ): Promise<void> {
    try {
      const { policy: policyData, created_by } = call.request;
      const policy = this.grpcToPolicy(policyData);

      const validation = validator.validate(policy);
      if (!validation.valid) {
        callback({
          code: 3,
          message: `Policy validation failed: ${validation.errors.join(', ')}`,
        });
        return;
      }

      const created = await policyRepository.create(policy, created_by);
      await cacheManager.set(`policy:${created.metadata.id}`, created);

      logger.info({ policyId: created.metadata.id }, 'Policy created via gRPC');

      callback(null, { policy: this.policyToGrpc(created) });
    } catch (error) {
      logger.error({ error }, 'gRPC createPolicy error');
      callback({
        code: 13,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get policy by ID
   */
  async getPolicy(call: ServerUnaryCall<any, any>, callback: sendUnaryData<any>): Promise<void> {
    try {
      const { id } = call.request;

      const cacheKey = `policy:${id}`;
      const cached = await cacheManager.get<Policy>(cacheKey);

      if (cached) {
        logger.debug({ policyId: id }, 'Policy retrieved from cache (gRPC)');
        callback(null, { policy: this.policyToGrpc(cached), cached: true });
        return;
      }

      const policy = await policyRepository.findById(id);

      if (!policy) {
        callback({
          code: 5,
          message: `Policy not found: ${id}`,
        });
        return;
      }

      await cacheManager.set(cacheKey, policy);

      logger.info({ policyId: id }, 'Policy retrieved via gRPC');

      callback(null, { policy: this.policyToGrpc(policy), cached: false });
    } catch (error) {
      logger.error({ error }, 'gRPC getPolicy error');
      callback({
        code: 13,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Update policy
   */
  async updatePolicy(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>,
  ): Promise<void> {
    try {
      const { id, policy: policyData } = call.request;
      const updates = this.grpcToPolicy(policyData);

      const validation = validator.validate(updates);
      if (!validation.valid) {
        callback({
          code: 3,
          message: `Policy validation failed: ${validation.errors.join(', ')}`,
        });
        return;
      }

      const updated = await policyRepository.update(id, updates);
      await cacheManager.delete(`policy:${id}`);

      logger.info({ policyId: id }, 'Policy updated via gRPC');

      callback(null, { policy: this.policyToGrpc(updated) });
    } catch (error) {
      logger.error({ error }, 'gRPC updatePolicy error');
      callback({
        code: 13,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Delete policy
   */
  async deletePolicy(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>,
  ): Promise<void> {
    try {
      const { id } = call.request;

      await policyRepository.delete(id);
      await cacheManager.delete(`policy:${id}`);

      logger.info({ policyId: id }, 'Policy deleted via gRPC');

      callback(null, { success: true });
    } catch (error) {
      logger.error({ error }, 'gRPC deletePolicy error');
      callback({
        code: 13,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * List policies
   */
  async listPolicies(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>,
  ): Promise<void> {
    try {
      const { namespace, status, limit = 100, offset = 0 } = call.request;

      let policies: Policy[];

      if (namespace) {
        policies = await policyRepository.findByNamespace(namespace);
      } else {
        policies = await policyRepository.findActive();
      }

      if (status) {
        policies = policies.filter((p) => p.status === status);
      }

      const paginatedPolicies = policies.slice(offset, offset + limit);

      logger.info({ count: paginatedPolicies.length }, 'Policies listed via gRPC');

      callback(null, {
        policies: paginatedPolicies.map((p) => this.policyToGrpc(p)),
        total: policies.length,
      });
    } catch (error) {
      logger.error({ error }, 'gRPC listPolicies error');
      callback({
        code: 13,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Evaluate policy
   */
  async evaluatePolicy(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>,
  ): Promise<void> {
    try {
      const { request_id, context, policy_ids, trace = false, dry_run = false } = call.request;

      const requestId = request_id || uuidv4();
      const evaluationContext = this.grpcToContext(context);

      const request: PolicyEvaluationRequest = {
        requestId,
        context: evaluationContext,
        policies: policy_ids,
        trace,
        dryRun: dry_run,
      };

      const activePolicies = await policyRepository.findActive();
      const engine = new PolicyEngine(activePolicies);

      const response = await engine.evaluate(request);

      if (!dry_run) {
        await evaluationRepository.log(request, response);
      }

      logger.info(
        {
          requestId,
          decision: response.decision.decision,
          allowed: response.decision.allowed,
        },
        'Policy evaluated via gRPC',
      );

      callback(null, {
        request_id: requestId,
        decision: {
          decision: response.decision.decision,
          allowed: response.decision.allowed,
          reason: response.decision.reason || '',
          matched_policies: response.decision.matchedPolicies,
          matched_rules: response.decision.matchedRules,
          evaluation_time_ms: response.decision.evaluationTimeMs,
          modifications: response.decision.modifications || {},
          metadata: response.decision.metadata || {},
        },
        timestamp: response.timestamp,
        cached: response.cached || false,
      });
    } catch (error) {
      logger.error({ error }, 'gRPC evaluatePolicy error');
      callback({
        code: 13,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Evaluate policy stream
   */
  async evaluatePolicyStream(call: ServerWritableStream<any, any>): Promise<void> {
    call.on('data', async (request: any) => {
      try {
        const { request_id, context, policy_ids, trace = false, dry_run = false } = request;

        const requestId = request_id || uuidv4();
        const evaluationContext = this.grpcToContext(context);

        const evalRequest: PolicyEvaluationRequest = {
          requestId,
          context: evaluationContext,
          policies: policy_ids,
          trace,
          dryRun: dry_run,
        };

        const activePolicies = await policyRepository.findActive();
        const engine = new PolicyEngine(activePolicies);

        const response = await engine.evaluate(evalRequest);

        if (!dry_run) {
          await evaluationRepository.log(evalRequest, response);
        }

        call.write({
          request_id: requestId,
          decision: {
            decision: response.decision.decision,
            allowed: response.decision.allowed,
            reason: response.decision.reason || '',
            matched_policies: response.decision.matchedPolicies,
            matched_rules: response.decision.matchedRules,
            evaluation_time_ms: response.decision.evaluationTimeMs,
            modifications: response.decision.modifications || {},
            metadata: response.decision.metadata || {},
          },
          timestamp: response.timestamp,
          cached: response.cached || false,
        });
      } catch (error) {
        logger.error({ error }, 'gRPC stream evaluation error');
        call.emit('error', {
          code: 13,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    call.on('end', () => {
      call.end();
    });
  }

  /**
   * Convert gRPC message to Policy
   */
  private grpcToPolicy(grpcPolicy: any): Policy {
    return {
      metadata: {
        id: grpcPolicy.metadata.id,
        name: grpcPolicy.metadata.name,
        description: grpcPolicy.metadata.description,
        version: grpcPolicy.metadata.version,
        namespace: grpcPolicy.metadata.namespace,
        tags: grpcPolicy.metadata.tags || [],
        priority: grpcPolicy.metadata.priority || 0,
        createdBy: grpcPolicy.metadata.created_by,
      },
      rules: grpcPolicy.rules.map((rule: any) => ({
        id: rule.id,
        name: rule.name,
        description: rule.description,
        condition: rule.condition,
        action: rule.action,
        enabled: rule.enabled !== false,
      })),
      status: grpcPolicy.status as PolicyStatus,
    };
  }

  /**
   * Convert Policy to gRPC message
   */
  private policyToGrpc(policy: Policy): any {
    return {
      metadata: {
        id: policy.metadata.id,
        name: policy.metadata.name,
        description: policy.metadata.description || '',
        version: policy.metadata.version,
        namespace: policy.metadata.namespace,
        tags: policy.metadata.tags || [],
        priority: policy.metadata.priority || 0,
        created_at: policy.metadata.createdAt?.toISOString() || '',
        updated_at: policy.metadata.updatedAt?.toISOString() || '',
        created_by: policy.metadata.createdBy || '',
      },
      rules: policy.rules,
      status: policy.status,
    };
  }

  /**
   * Convert gRPC context to EvaluationContext
   */
  private grpcToContext(grpcContext: any): EvaluationContext {
    return {
      llm: grpcContext.llm
        ? {
            provider: grpcContext.llm.provider,
            model: grpcContext.llm.model,
            prompt: grpcContext.llm.prompt,
            maxTokens: grpcContext.llm.max_tokens,
            temperature: grpcContext.llm.temperature,
          }
        : undefined,
      user: grpcContext.user
        ? {
            id: grpcContext.user.id,
            email: grpcContext.user.email,
            roles: grpcContext.user.roles,
            permissions: grpcContext.user.permissions,
          }
        : undefined,
      team: grpcContext.team
        ? {
            id: grpcContext.team.id,
            name: grpcContext.team.name,
            tier: grpcContext.team.tier,
          }
        : undefined,
      project: grpcContext.project
        ? {
            id: grpcContext.project.id,
            name: grpcContext.project.name,
            environment: grpcContext.project.environment,
          }
        : undefined,
      request: grpcContext.request
        ? {
            id: grpcContext.request.id,
            timestamp: grpcContext.request.timestamp,
            ipAddress: grpcContext.request.ip_address,
            userAgent: grpcContext.request.user_agent,
          }
        : undefined,
      metadata: grpcContext.metadata || {},
    };
  }
}
