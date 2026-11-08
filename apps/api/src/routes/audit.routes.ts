import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AuditService } from '../services/audit.service.js';

const router = Router();

router.get('/recent', async (req: AuthenticatedRequest, res, next) => {
  try {
    const events = await AuditService.getRecentEvents(50);
    res.json(events);
  } catch (err) {
    next(err);
  }
});

router.get('/intent/:intentId', async (req: AuthenticatedRequest, res, next) => {
  try {
    const intentId = String(req.params.intentId);
    const events = await AuditService.getEventsForIntent(intentId);
    res.json(events);
  } catch (err) {
    next(err);
  }
});

export default router;
