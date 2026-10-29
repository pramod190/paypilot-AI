import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { TransactionService } from '../services/transaction.service.js';

const router = Router();

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const transactions = await TransactionService.getUserTransactions(req.user!.id);
    res.json(transactions);
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
