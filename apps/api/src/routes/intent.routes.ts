import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { PaymentIntentService } from '../services/payment-intent.service.js';
import { TrustGuardService } from '../services/trustguard.service.js';
import {
  CreatePaymentIntentSchema,
  UpdatePaymentIntentSchema,
  ApprovePaymentIntentSchema,
} from '@paypilot/shared';

const router = Router();

router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = CreatePaymentIntentSchema.parse(req.body);
    const intent = await PaymentIntentService.createIntent(req.user!.id, data);
    res.status(201).json(intent);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const intent = await PaymentIntentService.getIntentById(id, req.user!.id);
    if (!intent) {
      return res.status(404).json({ error: 'Payment intent not found' });
    }
    res.json(intent);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const updates = UpdatePaymentIntentSchema.parse(req.body);
    const updated = await PaymentIntentService.updateIntent(id, req.user!.id, updates);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/validate', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const evaluation = await TrustGuardService.evaluateIntent(id, req.user!.id);
    res.json(evaluation);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approve', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { intentVersion } = ApprovePaymentIntentSchema.parse(req.body);
    const approved = await PaymentIntentService.approveIntent(
      id,
      req.user!.id,
      intentVersion,
      req.user!.name
    );
    res.json(approved);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { reason } = req.body;
    const rejected = await PaymentIntentService.rejectIntent(id, req.user!.id, reason);
    res.json(rejected);
  } catch (err) {
    next(err);
  }
});

export default router;
