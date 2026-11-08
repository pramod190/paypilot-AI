import { Router } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { InsightsService } from '../services/insights.service.js';

const router = Router();

const SpendingQuery = z.object({
  period: z.enum(['all', 'last_30_days', 'this_month']).optional(),
  groupBy: z.enum(['vendor', 'month']).optional(),
});

router.get('/overview', async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json(await InsightsService.overview(req.user!.id));
  } catch (err) {
    next(err);
  }
});

router.get('/spending', async (req: AuthenticatedRequest, res, next) => {
  try {
    const q = SpendingQuery.parse(req.query);
    res.json(await InsightsService.spending(req.user!.id, q));
  } catch (err) {
    next(err);
  }
});

export default router;
