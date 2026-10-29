import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { TransactionService } from '../services/transaction.service.js';
import { prisma } from '../prisma.js';

const router = Router();

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const transactions = await TransactionService.getUserTransactions(req.user!.id);
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
