import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { PaymentIntentService } from '../services/payment-intent.service.js';
import { TrustGuardService } from '../services/trustguard.service.js';
import { PayPalService } from '../services/paypal.service.js';
import { TransactionService } from '../services/transaction.service.js';
import { CapturePaymentSchema, PaymentState } from '@paypilot/shared';
import { prisma } from '../prisma.js';

const router = Router();

/**
 * Create a PayPal Order for an approved PaymentIntent
 */
router.post('/:intentId/order', async (req: AuthenticatedRequest, res, next) => {
  try {
    const intentId = String(req.params.intentId);
    const userId = req.user!.id;

    // 1. Enforce TrustGuard policies and approval verification
    await TrustGuardService.assertAllowedForCheckout(intentId, userId);

    const intent = await PaymentIntentService.getIntentById(intentId, userId);
    if (!intent) {
      return res.status(404).json({ error: 'Intent not found' });
    }

    // 2. Mark state as CHECKOUT_PENDING
    await prisma.paymentIntent.update({
      where: { id: intentId },
      data: { status: PaymentState.CHECKOUT_PENDING },
    });

    // 3. Create PayPal Order
    const order = await PayPalService.createOrder({
      intentId: intent.id,
      amount: intent.amount,
      currency: intent.currency,
      recipient: intent.recipient,
      description: intent.purpose,
      invoiceNumber: intent.invoice?.invoiceNumber,
    });

    res.json({
      orderId: order.orderId,
      status: order.status,
      approveUrl: order.approveUrl,
      intentId: intent.id,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Authoritatively capture and verify an approved PayPal Order
 */
router.post('/:intentId/capture', async (req: AuthenticatedRequest, res, next) => {
  try {
    const intentId = String(req.params.intentId);
    const userId = req.user!.id;
    const { paypalOrderId, forceInstantCapture } = CapturePaymentSchema.parse(req.body);

    const intent = await PaymentIntentService.getIntentById(intentId, userId);
    if (!intent) {
      return res.status(404).json({ error: 'Intent not found' });
    }

    // Ensure intent is in CHECKOUT_PENDING or APPROVED state
    if (intent.status !== PaymentState.CHECKOUT_PENDING && intent.status !== PaymentState.APPROVED) {
      return res.status(400).json({
        error: `Cannot capture payment for intent in state '${intent.status}'. Must be APPROVED or CHECKOUT_PENDING.`,
      });
    }

    // 1. Authoritative Capture with PayPal
    const captureResult = await PayPalService.captureOrder({
      paypalOrderId,
      intentId: intent.id,
      expectedAmount: intent.amount,
      expectedCurrency: intent.currency,
      forceInstantCapture,
    });

    // 2. Authoritative database transaction recording & invoice status update
    const transaction = await TransactionService.recordVerifiedTransaction({
      intentId: intent.id,
      userId,
      paypalOrderId,
      captureId: captureResult.captureId,
      amount: captureResult.amount,
      currency: captureResult.currency,
      status: captureResult.status,
      rawResponse: captureResult.rawResponse,
    });

    // 3. Produce receipt
    const receipt = await TransactionService.getReceipt(transaction.id, userId);

    res.json({
      success: true,
      transaction,
      receipt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Handle checkout cancellation
 */
router.post('/:intentId/cancel', async (req: AuthenticatedRequest, res, next) => {
  try {
    const intentId = String(req.params.intentId);
    const userId = req.user!.id;

    const intent = await PaymentIntentService.getIntentById(intentId, userId);
    if (!intent) return res.status(404).json({ error: 'Intent not found' });

    // Reset status back to APPROVED so user can re-try checkout
    const updated = await prisma.paymentIntent.update({
      where: { id: intentId },
      data: { status: PaymentState.APPROVED },
    });

    res.json({ message: 'Checkout cancelled by buyer. Intent preserved for retry.', intent: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
