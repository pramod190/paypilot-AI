import { Router } from 'express';
import { z } from 'zod';
import { toMinor } from '@paypilot/shared';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { TransactionService } from '../services/transaction.service.js';
import { prisma } from '../prisma.js';

const router = Router();

const isMoney = (v: number) => { try { toMinor(v); return true; } catch { return false; } };

const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['COMPLETED', 'PENDING', 'FAILED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  minAmount: z.coerce.number().nonnegative().refine(isMoney, 'At most 2 decimal places').optional(),
  maxAmount: z.coerce.number().nonnegative().refine(isMoney, 'At most 2 decimal places').optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const filters = ListQuery.parse(req.query);
    const [transactions, total] = await Promise.all([
      TransactionService.getUserTransactions(req.user!.id, filters),
      TransactionService.countUserTransactions(req.user!.id, filters),
    ]);
    res.setHeader('X-Total-Count', String(total));
    res.json(transactions);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const transaction = await prisma.transaction.findFirst({
      where: {
        id,
        intent: { userId: req.user!.id },
      },
      include: {
        intent: {
          include: {
            invoice: true,
            approvals: true,
          },
        },
      },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(transaction);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/receipt', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const receipt = await TransactionService.getReceipt(id, req.user!.id);
    res.json(receipt);
  } catch (err) {
    next(err);
  }
});

export default router;
