/**
 * Evaluation Routes
 * REST API endpoints for policy evaluation
 */
import { Router, Request, Response } from 'express';
import { PolicyRepository } from '@db/models/policy-repository';
import { EvaluationRepository } from '@db/models/evaluation-repository';
import { PolicyEngine } from '@core/engine/policy-engine';
import { cacheManager } from '@cache/cache-manager';
import { authenticate, requirePermission, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { rateLimiter, readOnlyRateLimiter } from '../middleware/rate-limit';
import logger from '@utils/logger';
import { PolicyEvaluationRequest, PolicyEvaluationResponse } from '../../types/policy';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const router = Router();
const policyRepository = new PolicyRepository();
const evaluationRepository = new EvaluationRepository();

/**
 * POST /api/evaluate
 * Evaluate policies against context
 */
router.post(
  '/',
  authenticate,
  requirePermission('policy:evaluate'),
  rateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { context, policies, trace = false, dryRun = false, useCache = true } = req.body;

    if (!context) {
      res.status(400).json({
        error: 'MISSING_CONTEXT',
        message: 'Evaluation context is required',
      });
      return;
    }

    const requestId = uuidv4();
    const request: PolicyEvaluationRequest = {
      requestId,
      context,
      policies,
      trace,
      dryRun,
    };

    let response: PolicyEvaluationResponse;

    if (useCache && !trace && !dryRun) {
      const cacheKey = generateCacheKey(context, policies);
      const cached = await cacheManager.get<PolicyEvaluationResponse>(cacheKey);

      if (cached) {
        logger.info({ requestId, cached: true }, 'Returning cached evaluation');
        res.json({ ...cached, requestId, cached: true });
        return;
      }

      const activePolicies = await policyRepository.findActive();
      const engine = new PolicyEngine(activePolicies);
      response = await engine.evaluate(request);

      await cacheManager.set(cacheKey, response, 60);
    } else {
      const activePolicies = await policyRepository.findActive();
      const engine = new PolicyEngine(activePolicies);
      response = await engine.evaluate(request);
    }

    if (!dryRun) {
      await evaluationRepository.log(request, response);
    }

    logger.info(
      {
        requestId,
        decision: response.decision.decision,
        allowed: response.decision.allowed,
        evaluationTimeMs: response.decision.evaluationTimeMs,
        userId: req.user?.id,
      },
      'Policy evaluation completed',
    );

    res.json(response);
  }),
);

/**
 * POST /api/evaluate/batch
 * Batch evaluate multiple contexts
 */
router.post(
  '/batch',
  authenticate,
  requirePermission('policy:evaluate'),
  rateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { contexts, policies, trace = false, dryRun = false } = req.body;

    if (!contexts || !Array.isArray(contexts)) {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'contexts must be an array',
      });
      return;
    }

    if (contexts.length > 100) {
      res.status(400).json({
        error: 'BATCH_SIZE_EXCEEDED',
        message: 'Maximum batch size is 100',
      });
      return;
    }

    const activePolicies = await policyRepository.findActive();
    const engine = new PolicyEngine(activePolicies);

    const results = await Promise.all(
      contexts.map(async (context) => {
        const requestId = uuidv4();
        const request: PolicyEvaluationRequest = {
          requestId,
          context,
          policies,
          trace,
          dryRun,
        };

        const response = await engine.evaluate(request);

        if (!dryRun) {
          await evaluationRepository.log(request, response);
        }

        return response;
      }),
    );

    logger.info(
      {
        batchSize: contexts.length,
        userId: req.user?.id,
      },
      'Batch evaluation completed',
    );

    res.json({ results, count: results.length });
  }),
);

/**
 * GET /api/evaluate/history
 * Get evaluation history
 */
router.get(
  '/history',
  authenticate,
  requirePermission('policy:read'),
  readOnlyRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      requestId,
      policyId,
      decision,
      allowed,
      startDate,
      endDate,
      limit = '100',
      offset = '0',
    } = req.query;

    const filters: any = {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    };

    if (requestId) filters.requestId = requestId as string;
    if (policyId) filters.policyIds = [policyId as string];
    if (decision) filters.decision = decision as string;
    if (allowed !== undefined) filters.allowed = allowed === 'true';
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);

    const evaluations = await evaluationRepository.find(filters);

    logger.info({ count: evaluations.length }, 'Evaluation history retrieved');

    res.json({
      evaluations,
      count: evaluations.length,
      limit: filters.limit,
      offset: filters.offset,
    });
  }),
);

/**
 * GET /api/evaluate/history/:requestId
 * Get specific evaluation by request ID
 */
router.get(
  '/history/:requestId',
  authenticate,
  requirePermission('policy:read'),
  readOnlyRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { requestId } = req.params;

    const evaluation = await evaluationRepository.findByRequestId(requestId);

    if (!evaluation) {
      res.status(404).json({
        error: 'EVALUATION_NOT_FOUND',
        message: `Evaluation not found: ${requestId}`,
      });
      return;
    }

    logger.info({ requestId }, 'Evaluation retrieved');

    res.json({ evaluation });
  }),
);

/**
 * GET /api/evaluate/stats
 * Get evaluation statistics
 */
router.get(
  '/stats',
  authenticate,
  requirePermission('policy:read'),
  readOnlyRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { days = '7' } = req.query;

    const daysNum = parseInt(days as string, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const stats = await evaluationRepository.getStats(startDate);

    logger.info({ days: daysNum }, 'Evaluation stats retrieved');

    res.json({ stats, period: { days: daysNum, startDate } });
  }),
);

/**
 * DELETE /api/evaluate/history
 * Delete old evaluation history
 */
router.delete(
  '/history',
  authenticate,
  requirePermission('policy:admin'),
  rateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { days = '90' } = req.query;

    const daysNum = parseInt(days as string, 10);
    const deletedCount = await evaluationRepository.deleteOlderThan(daysNum);

    logger.info(
      { deletedCount, days: daysNum, userId: req.user?.id },
      'Old evaluations deleted',
    );

    res.json({ deletedCount, days: daysNum });
  }),
);

/**
 * Generate cache key for evaluation
 */
function generateCacheKey(context: any, policies?: string[]): string {
  const data = JSON.stringify({ context, policies: policies?.sort() });
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return `evaluation:${hash}`;
}

export default router;
