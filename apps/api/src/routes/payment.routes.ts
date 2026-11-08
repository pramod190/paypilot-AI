import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { PaymentIntentService } from '../services/payment-intent.service.js';
import { TrustGuardService } from '../services/trustguard.service.js';
import { PayPalService, PayPalError } from '../services/paypal.service.js';
import { TransactionService } from '../services/transaction.service.js';
import { AuditService } from '../services/audit.service.js';
import { CapturePaymentSchema, PaymentState } from '@paypilot/shared';
import { prisma } from '../prisma.js';

const router = Router();

/** Create a PayPal order for an APPROVED intent and bind that order to the intent server-side. */
router.post('/:intentId/order', async (req: AuthenticatedRequest, res, next) => {
  try {
    const intentId = String(req.params.intentId);
    const userId = req.user!.id;

    await TrustGuardService.assertAllowedForCheckout(intentId, userId);

    const intent = await PaymentIntentService.getIntentById(intentId, userId);
    if (!intent) return res.status(404).json({ error: 'Intent not found' });

    const order = await PayPalService.createOrder({
      intentId: intent.id,
      intentVersion: intent.version,
      amountMinor: intent.amountMinor,
      currency: intent.currency,
      recipient: intent.recipient,
      description: intent.purpose,
      invoiceNumber: intent.invoice?.invoiceNumber,
    });

    // Only move to CHECKOUT_PENDING after PayPal accepted the order; remember which order belongs to this intent.
    await prisma.paymentIntent.update({
      where: { id: intentId },
      data: { status: PaymentState.CHECKOUT_PENDING, paypalOrderId: order.orderId },
    });

    res.json({ orderId: order.orderId, status: order.status, approveUrl: order.approveUrl, intentId: intent.id });
  } catch (err) {
    next(err);
  }
});

/** Capture on the server and verify against authoritative PayPal evidence. */
router.post('/:intentId/capture', async (req: AuthenticatedRequest, res, next) => {
  try {
    const intentId = String(req.params.intentId);
    const userId = req.user!.id;
    const { paypalOrderId } = CapturePaymentSchema.parse(req.body);

    const intent = await PaymentIntentService.getIntentById(intentId, userId);
    if (!intent) return res.status(404).json({ error: 'Intent not found' });

    // Idempotent replay: already captured for this order -> return the stored authoritative record.
    if (intent.status === PaymentState.COMPLETED && intent.transaction && intent.transaction.paypalOrderId === paypalOrderId) {
      const receipt = await TransactionService.getReceipt(intent.transaction.id, userId);
      return res.json({ success: true, transaction: intent.transaction, receipt, replayed: true });
    }

    if (intent.status !== PaymentState.CHECKOUT_PENDING) {
      return res.status(409).json({ error: `Cannot capture payment for intent in state '${intent.status}'. It must be CHECKOUT_PENDING.` });
    }

    // The client may only capture the order the server created for THIS intent.
    if (!intent.paypalOrderId || intent.paypalOrderId !== paypalOrderId) {
      await AuditService.logEvent({ userId, intentId, eventType: 'CAPTURE_REJECTED_ORDER_MISMATCH', safeDetails: { submittedOrderId: paypalOrderId } });
      return res.status(409).json({ error: 'This PayPal order is not bound to the payment intent.' });
    }

    // Re-run policy (approval version, expiry, invoice state) immediately before money moves.
    await TrustGuardService.assertAllowedForCheckout(intentId, userId);

    let captureResult;
    try {
      captureResult = await PayPalService.captureOrder({
        paypalOrderId,
        intentId: intent.id,
        expectedAmountMinor: intent.amountMinor,
        expectedCurrency: intent.currency,
      });
    } catch (err) {
      if (err instanceof PayPalError && err.ambiguous) {
        await prisma.paymentIntent.update({ where: { id: intentId }, data: { status: PaymentState.PENDING_RECONCILIATION } });
        await AuditService.logEvent({ userId, intentId, eventType: 'INTENT_PENDING_RECONCILIATION', safeDetails: { orderId: paypalOrderId, reason: err.message } });
      }
      throw err;
    }

    const transaction = await TransactionService.recordVerifiedTransaction({
      intentId: intent.id,
      userId,
      paypalOrderId,
      captureId: captureResult.captureId,
      amountMinor: captureResult.amountMinor,
      currency: captureResult.currency,
      status: captureResult.status,
      rawResponse: captureResult.rawResponse,
    });

    const receipt = await TransactionService.getReceipt(transaction.id, userId);
    res.json({ success: true, transaction, receipt });
  } catch (err) {
    next(err);
  }
});

/**
 * Resolve an ambiguous outcome (timeout / PENDING capture). Reads PayPal's authoritative state:
 *  - captured  -> verify and record the transaction
 *  - not captured -> return the intent to CHECKOUT_PENDING so capture can be retried safely
 */
router.post('/:intentId/reconcile', async (req: AuthenticatedRequest, res, next) => {
  try {
    const intentId = String(req.params.intentId);
    const userId = req.user!.id;

    const intent = await PaymentIntentService.getIntentById(intentId, userId);
    if (!intent) return res.status(404).json({ error: 'Intent not found' });
    if (intent.status !== PaymentState.PENDING_RECONCILIATION) {
      return res.status(409).json({ error: `Nothing to reconcile: intent is in state '${intent.status}'.` });
    }
    if (!intent.paypalOrderId) {
      return res.status(409).json({ error: 'No PayPal order is bound to this intent.' });
    }

    const result = await PayPalService.reconcileOrder({
      paypalOrderId: intent.paypalOrderId,
      intentId: intent.id,
      expectedAmountMinor: intent.amountMinor,
      expectedCurrency: intent.currency,
    });

    if (result.captured) {
      const transaction = await TransactionService.recordVerifiedTransaction({
        intentId: intent.id,
        userId,
        paypalOrderId: intent.paypalOrderId,
        captureId: result.captureId,
        amountMinor: result.amountMinor,
        currency: result.currency,
        status: result.status,
        rawResponse: result.rawResponse,
      });
      const receipt = await TransactionService.getReceipt(transaction.id, userId);
      return res.json({ reconciled: true, outcome: 'CAPTURED', transaction, receipt });
    }

    await prisma.paymentIntent.update({ where: { id: intentId }, data: { status: PaymentState.CHECKOUT_PENDING } });
    await AuditService.logEvent({ userId, intentId, eventType: 'RECONCILED_NOT_CAPTURED', safeDetails: { orderStatus: result.orderStatus } });
    res.json({ reconciled: true, outcome: 'NOT_CAPTURED', orderStatus: result.orderStatus, message: 'No capture happened at PayPal. Safe to retry.' });
  } catch (err) {
    next(err);
  }
});

/** Buyer closed or cancelled checkout: allowed only while checkout is actually pending. */
router.post('/:intentId/cancel', async (req: AuthenticatedRequest, res, next) => {
  try {
    const intentId = String(req.params.intentId);
    const userId = req.user!.id;

    const intent = await PaymentIntentService.getIntentById(intentId, userId);
    if (!intent) return res.status(404).json({ error: 'Intent not found' });

    if (intent.status !== PaymentState.CHECKOUT_PENDING && intent.status !== PaymentState.APPROVED) {
      return res.status(409).json({ error: `Cannot cancel checkout for intent in state '${intent.status}'.` });
    }

    const updated = await prisma.paymentIntent.update({
      where: { id: intentId },
      data: { status: PaymentState.APPROVED },
    });
    await AuditService.logEvent({ userId, intentId, eventType: 'CHECKOUT_CANCELLED_BY_BUYER', safeDetails: { orderId: intent.paypalOrderId } });

    res.json({ message: 'Checkout cancelled by buyer. Intent preserved for retry.', intent: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
