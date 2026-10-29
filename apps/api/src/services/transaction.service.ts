import { prisma } from '../prisma.js';
import { PaymentState, InvoiceStatus } from '@paypilot/shared';
import { AuditService } from './audit.service.js';

export class TransactionService {
  /**
   * Save authoritative verified transaction
   */
  static async recordVerifiedTransaction(params: {
    intentId: string;
    userId: string;
    paypalOrderId: string;
    captureId: string;
    amount: number;
    currency: string;
    status: string;
    rawResponse?: any;
  }) {
    // Transaction execution inside Prisma transaction for ACID consistency
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check idempotency: orderId or captureId must not already exist
      const existing = await tx.transaction.findFirst({
        where: {
          OR: [
            { paypalOrderId: params.paypalOrderId },
            { captureId: params.captureId },
            { intentId: params.intentId },
          ],
        },
      });

      if (existing) {
        return existing;
      }

      // 2. Create authoritative transaction
      const transaction = await tx.transaction.create({
        data: {
          intentId: params.intentId,
          paypalOrderId: params.paypalOrderId,
          captureId: params.captureId,
          amount: params.amount,
          currency: params.currency,
          status: params.status,
          rawResponse: params.rawResponse ? JSON.stringify(params.rawResponse) : null,
        },
      });

      // 3. Mark intent as COMPLETED
      const intent = await tx.paymentIntent.update({
        where: { id: params.intentId },
        data: { status: PaymentState.COMPLETED },
        include: { invoice: true },
      });

      // 4. If associated with an invoice, mark invoice as PAID
      if (intent.invoiceId) {
        await tx.invoice.update({
          where: { id: intent.invoiceId },
          data: { status: InvoiceStatus.PAID },
        });
      }

      return transaction;
    });

    await AuditService.logEvent({
      userId: params.userId,
      intentId: params.intentId,
      eventType: 'TRANSACTION_RECORDED_SUCCESS',
      safeDetails: {
        transactionId: result.id,
        paypalOrderId: params.paypalOrderId,
        captureId: params.captureId,
        amount: params.amount,
        currency: params.currency,
      },
    });

    return result;
  }

  /**
   * Get user transactions
   */
  static async getUserTransactions(userId: string) {
    return await prisma.transaction.findMany({
      where: {
        intent: { userId },
      },
      include: {
        intent: {
          include: {
            invoice: true,
            approvals: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get full verified receipt
   */
  static async getReceipt(transactionId: string, userId: string) {
    const tx = await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        intent: { userId },
      },
      include: {
        intent: {
          include: {
            invoice: true,
            approvals: true,
            auditEvents: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });

    if (!tx) {
      throw new Error('Transaction or receipt not found');
    }

    return {
      receiptId: tx.id,
      verifiedStatus: tx.status,
      paypalOrderId: tx.paypalOrderId,
      captureId: tx.captureId,
      amount: tx.amount,
      currency: tx.currency,
      timestamp: tx.createdAt.toISOString(),
      recipient: tx.intent.recipient,
      purpose: tx.intent.purpose,
      invoice: tx.intent.invoice ? {
        id: tx.intent.invoice.id,
        invoiceNumber: tx.intent.invoice.invoiceNumber,
        vendor: tx.intent.invoice.vendor,
        billingPeriod: tx.intent.invoice.billingPeriod,
      } : null,
      approvals: tx.intent.approvals.map(a => ({
        approvedBy: a.approvedBy,
        version: a.intentVersion,
        timestamp: a.approvedAt.toISOString(),
      })),
      auditTrail: tx.intent.auditEvents.map(e => ({
        event: e.eventType,
        time: e.createdAt.toISOString(),
      })),
    };
  }
}

