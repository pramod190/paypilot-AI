import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AIService } from '../services/ai.service.js';
import { AIChatRequestSchema } from '@paypilot/shared';

const router = Router();

router.post('/chat', async (req: AuthenticatedRequest, res, next) => {
  try {
    const validated = AIChatRequestSchema.parse(req.body);
    const userId = req.user!.id;

    const response = await AIService.processChat({
      userId,
      message: validated.message,
      conversationHistory: validated.conversationHistory,
      contextInvoiceId: validated.contextInvoiceId,
    });

    res.json(response);
  } catch (err) {
    next(err);
  }
});

export default router;
