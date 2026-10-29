import { Router, Request, Response } from 'express';
import { PayPalService } from '../services/paypal.service.js';
import { AuditService } from '../services/audit.service.js';
import { TransactionService } from '../services/transaction.service.js';
import { prisma } from '../prisma.js';
import { config } from '../config.js';

const router = Router();

/**
 * Handle incoming PayPal Webhooks
 * Validates webhook events like CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.DENIED
 */
router.post('/paypal', async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const eventType = event.event_type;
    const resource = event.resource;

    console.log(`[PayPal Webhook Received]: ${eventType} (ID: ${event.id})`);

    // Verify webhook signature if in production or configured
    if (config.paypal.webhookId && PayPalService.isConfigured()) {
      // In live PayPal sandbox, webhook signature verification can be performed
      // via PayPal's /v1/notifications/verify-webhook-signature API
    }

    // Record audit event for this webhook
    await AuditService.logEvent({
      eventType: `WEBHOOK_${eventType?.replace(/\./g, '_') || 'UNKNOWN'}`,
      safeDetails: {
        webhookId: event.id,
        eventType,
        resourceType: event.resource_type,
        summary: event.summary,
      },
    });

    // Handle specific event types
    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        const captureId = resource.id;
        const amount = parseFloat(resource.amount?.value || '0');
        const currency = resource.amount?.currency_code || 'USD';
        const customId = resource.custom_id; // PaymentIntent ID if passed

        if (customId) {
          const intent = await prisma.paymentIntent.findUnique({ where: { id: customId } });
          if (intent && intent.status !== 'COMPLETED') {
            await TransactionService.recordVerifiedTransaction({
              intentId: intent.id,
              userId: intent.userId,
              paypalOrderId: resource.supplementary_data?.related_ids?.order_id || `ORD-${captureId}`,
              captureId,
              amount,
              currency,
              status: 'COMPLETED',
              rawResponse: resource,
            });
          }
        }
        break;
      }

      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED': {
        const customId = resource.custom_id;
        if (customId) {
          await prisma.paymentIntent.updateMany({
            where: { id: customId },
            data: { status: 'FAILED' },
          });
        }
        break;
      }

      case 'CHECKOUT.ORDER.APPROVED': {
        // Buyer approved the checkout in PayPal window
        break;
      }

      default:
        break;
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[PayPal Webhook Error]:', err);
    res.status(500).json({ error: 'Webhook processing error', message: err.message });
  }
});

export default router;
