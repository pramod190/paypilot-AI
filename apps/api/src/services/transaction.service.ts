import { prisma } from '../prisma.js';
import { PaymentState, InvoiceStatus, toMinor } from '@paypilot/shared';
import { AuditService } from './audit.service.js';

export interface TransactionFilters {
  q?: string;
  status?: string;
  from?: Date;
  to?: Date;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  offset?: number;
}

export class TransactionService {
  private static buildWhere(userId: string, f: TransactionFilters) {
    const and: any[] = [];
    if (f.q) {
      const contains = { contains: f.q, mode: 'insensitive' as const };
      and.push({ OR: [{ captureId: contains }, { paypalOrderId: contains }, { intent: { recipient: contains } }, { intent: { purpose: contains } }, { intent: { invoice: { invoiceNumber: contains } } }] });
    }
    if (f.status) and.push({ status: f.status });
    if (f.from || f.to) and.push({ createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } });
    if (f.minAmount !== undefined || f.maxAmount !== undefined) {
      and.push({ amountMinor: { ...(f.minAmount !== undefined ? { gte: toMinor(f.minAmount) } : {}), ...(f.maxAmount !== undefined ? { lte: toMinor(f.maxAmount) } : {}) } });
    }
    return { intent: { userId }, ...(and.length ? { AND: and } : {}) };
  }

  static async countUserTransactions(userId: string, filters: TransactionFilters = {}) {
    return prisma.transaction.count({ where: this.buildWhere(userId, filters) });
  }

  /**
   * Save authoritative verified transaction
   */
  static async recordVerifiedTransaction(params: {
    intentId: string;
    userId: string;
    paypalOrderId: string;
    captureId: string;
    amountMinor: number;
    currency: string;
    status: string;
    rawResponse?: any;
  }) {
    // Transaction execution inside Prisma transaction for ACID consistency
    const run = () => prisma.$transaction(async (tx) => {
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
          amountMinor: params.amountMinor,
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

    let result;
    try {
      result = await run();
    } catch (err: any) {
      // Two concurrent captures raced past the idempotency read: the DB unique constraints made one lose.
      // The loser must return the winner's authoritative record, never an error and never a second transaction.
      if (err?.code === 'P2002' || /unique constraint/i.test(String(err?.message))) {
        const winner = await prisma.transaction.findFirst({
          where: { OR: [{ paypalOrderId: params.paypalOrderId }, { captureId: params.captureId }, { intentId: params.intentId }] },
        });
        if (winner) return winner;
      }
      throw err;
    }

    await AuditService.logEvent({
      userId: params.userId,
      intentId: params.intentId,
      eventType: 'TRANSACTION_RECORDED_SUCCESS',
      safeDetails: {
        transactionId: result.id,
        paypalOrderId: params.paypalOrderId,
        captureId: params.captureId,
        amountMinor: params.amountMinor,
        currency: params.currency,
      },
    });

    return result;
  }

  /**
   * Get user transactions
   */
  static async getUserTransactions(userId: string, filters: TransactionFilters = {}) {
    const where = this.buildWhere(userId, filters);
    return await prisma.transaction.findMany({
      where,
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
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
      amount: tx.amount, // display value derived from amountMinor
      amountMinor: tx.amountMinor,
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

