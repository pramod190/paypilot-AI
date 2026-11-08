import { Router, Request, Response } from 'express';
import { PayPalService } from '../services/paypal.service.js';
import { AuditService } from '../services/audit.service.js';
import { TransactionService } from '../services/transaction.service.js';
import { prisma } from '../prisma.js';
import { toMinor } from '@paypilot/shared';

const router = Router();

/**
 * PayPal webhooks. Every event is signature-verified with PayPal's verify-webhook-signature API
 * BEFORE it can change any state. Unverified requests are rejected and logged.
 */
router.post('/paypal', async (req: Request, res: Response) => {
  try {
    const event = req.body ?? {};
    const eventType: string | undefined = event.event_type;
    const resource = event.resource ?? {};

    const verified = await PayPalService.verifyWebhookSignature(req.headers as Record<string, any>, event);
    if (!verified) {
      await AuditService.logEvent({
        eventType: 'WEBHOOK_REJECTED_INVALID_SIGNATURE',
        safeDetails: { claimedEventType: eventType ?? 'UNKNOWN', claimedId: event.id ?? null },
      });
      return res.status(401).json({ error: 'Webhook signature verification failed' });
    }

    await AuditService.logEvent({
      eventType: `WEBHOOK_${eventType?.replace(/\./g, '_') || 'UNKNOWN'}`,
      safeDetails: { webhookId: event.id, eventType, resourceType: event.resource_type, summary: event.summary },
    });

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        const captureId: string | undefined = resource.id;
        const orderId: string | undefined = resource.supplementary_data?.related_ids?.order_id;
        const customId: string | undefined = resource.custom_id;
        const currency: string | undefined = resource.amount?.currency_code;
        let amountMinor: number | null = null;
        try { amountMinor = toMinor(String(resource.amount?.value)); } catch { amountMinor = null; }
        if (!captureId || !orderId || !customId || amountMinor === null || !currency) break;

        const intent = await prisma.paymentIntent.findUnique({ where: { id: customId } });
        // Only record when the capture matches what the user approved and the order we bound to the intent.
        if (
          intent &&
          intent.status !== 'COMPLETED' &&
          intent.paypalOrderId === orderId &&
          intent.amountMinor === amountMinor &&
          intent.currency === currency
        ) {
          await TransactionService.recordVerifiedTransaction({
            intentId: intent.id,
            userId: intent.userId,
            paypalOrderId: orderId,
            captureId,
            amountMinor,
            currency,
            status: 'COMPLETED',
            rawResponse: resource,
          });
        }
        break;
      }

      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED': {
        const customId: string | undefined = resource.custom_id;
        if (customId) {
          await prisma.paymentIntent.updateMany({
            where: { id: customId, status: { notIn: ['COMPLETED'] } },
            data: { status: 'FAILED' },
          });
        }
        break;
      }

      default:
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[PayPal Webhook Error]:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

export default router;
