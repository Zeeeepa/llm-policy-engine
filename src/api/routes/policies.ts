/**
 * Policy Routes
 * REST API endpoints for policy management
 */
import { Router, Request, Response } from 'express';
import { PolicyRepository } from '@db/models/policy-repository';
import { YAMLParser } from '@core/parser/yaml-parser';
import { JSONParser } from '@core/parser/json-parser';
import { SchemaValidator } from '@core/validator/schema-validator';
import { cacheManager } from '@cache/cache-manager';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { writeRateLimiter, readOnlyRateLimiter } from '../middleware/rate-limit';
import logger from '@utils/logger';
import { Policy, PolicyStatus } from '../../types/policy';

const router = Router();
const policyRepository = new PolicyRepository();
const yamlParser = new YAMLParser();
const jsonParser = new JSONParser();
const validator = new SchemaValidator();

/**
 * GET /api/policies
 * List all policies
 */
router.get(
  '/',
  authenticate,
  requirePermission('policy:read'),
  readOnlyRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { namespace, status, limit = '100', offset = '0' } = req.query;

    let policies: Policy[];

    if (namespace) {
      policies = await policyRepository.findByNamespace(namespace as string);
    } else {
      policies = await policyRepository.findActive();
    }

    if (status) {
      policies = policies.filter((p) => p.status === status);
    }

    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    const paginatedPolicies = policies.slice(offsetNum, offsetNum + limitNum);

    logger.info(
      { count: paginatedPolicies.length, total: policies.length },
      'Policies listed',
    );

    res.json({
      policies: paginatedPolicies,
      total: policies.length,
      limit: limitNum,
      offset: offsetNum,
    });
  }),
);

/**
 * GET /api/policies/:id
 * Get policy by ID
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('policy:read'),
  readOnlyRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const cacheKey = `policy:${id}`;
    const cached = await cacheManager.get<Policy>(cacheKey);

    if (cached) {
      logger.debug({ policyId: id }, 'Policy retrieved from cache');
      res.json({ policy: cached, cached: true });
      return;
    }

    const policy = await policyRepository.findById(id);

    if (!policy) {
      res.status(404).json({
        error: 'POLICY_NOT_FOUND',
        message: `Policy not found: ${id}`,
      });
      return;
    }

    await cacheManager.set(cacheKey, policy);

    logger.info({ policyId: id }, 'Policy retrieved');
    res.json({ policy, cached: false });
  }),
);

/**
 * POST /api/policies
 * Create new policy
 */
router.post(
  '/',
  authenticate,
  requirePermission('policy:write'),
  writeRateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { policy: policyData, format = 'json' } = req.body;

    let policy: Policy;

    if (format === 'yaml') {
      policy = yamlParser.parse(policyData);
    } else {
      policy = typeof policyData === 'string' ? jsonParser.parse(policyData) : policyData;
    }

    const validation = validator.validate(policy);
    if (!validation.valid) {
      res.status(400).json({
        error: 'POLICY_VALIDATION_ERROR',
        message: 'Policy validation failed',
        errors: validation.errors,
      });
      return;
    }

    const created = await policyRepository.create(policy, req.user?.id);

    await cacheManager.set(`policy:${created.metadata.id}`, created);

    logger.info({ policyId: created.metadata.id, userId: req.user?.id }, 'Policy created');

    res.status(201).json({ policy: created });
  }),
);

/**
 * PUT /api/policies/:id
 * Update policy
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('policy:write'),
  writeRateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { policy: policyData, format = 'json' } = req.body;

    let updates: Partial<Policy>;

    if (format === 'yaml') {
      updates = yamlParser.parse(policyData);
    } else {
      updates = typeof policyData === 'string' ? jsonParser.parse(policyData) : policyData;
    }

    if (updates.metadata || updates.rules) {
      const fullPolicy = {
        metadata: updates.metadata || { id, name: '', version: '', namespace: '' },
        rules: updates.rules || [],
        status: updates.status || PolicyStatus.DRAFT,
      };

      const validation = validator.validate(fullPolicy);
      if (!validation.valid) {
        res.status(400).json({
          error: 'POLICY_VALIDATION_ERROR',
          message: 'Policy validation failed',
          errors: validation.errors,
        });
        return;
      }
    }

    const updated = await policyRepository.update(id, updates);

    await cacheManager.delete(`policy:${id}`);

    logger.info({ policyId: id, userId: req.user?.id }, 'Policy updated');

    res.json({ policy: updated });
  }),
);

/**
 * PATCH /api/policies/:id/status
 * Update policy status
 */
router.patch(
  '/:id/status',
  authenticate,
  requirePermission('policy:write'),
  writeRateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!Object.values(PolicyStatus).includes(status)) {
      res.status(400).json({
        error: 'INVALID_STATUS',
        message: `Invalid status: ${status}`,
        validStatuses: Object.values(PolicyStatus),
      });
      return;
    }

    const updated = await policyRepository.update(id, { status });

    await cacheManager.delete(`policy:${id}`);

    logger.info({ policyId: id, status, userId: req.user?.id }, 'Policy status updated');

    res.json({ policy: updated });
  }),
);

/**
 * DELETE /api/policies/:id
 * Delete policy
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('policy:delete'),
  writeRateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    await policyRepository.delete(id);

    await cacheManager.delete(`policy:${id}`);

    logger.info({ policyId: id, userId: req.user?.id }, 'Policy deleted');

    res.status(204).send();
  }),
);

/**
 * POST /api/policies/validate
 * Validate policy without creating
 */
router.post(
  '/validate',
  authenticate,
  requirePermission('policy:read'),
  readOnlyRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { policy: policyData, format = 'json' } = req.body;

    let policy: Policy;

    if (format === 'yaml') {
      policy = yamlParser.parse(policyData);
    } else {
      policy = typeof policyData === 'string' ? jsonParser.parse(policyData) : policyData;
    }

    const validation = validator.validate(policy);

    res.json({
      valid: validation.valid,
      errors: validation.errors,
      policy: validation.valid ? policy : undefined,
    });
  }),
);

export default router;
