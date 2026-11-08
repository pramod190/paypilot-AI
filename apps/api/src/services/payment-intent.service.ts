import { prisma } from '../prisma.js';
import { PaymentState, InvoiceStatus, toMinor } from '@paypilot/shared';
import { TrustGuardService } from './trustguard.service.js';
import { AuditService } from './audit.service.js';

export class PaymentIntentService {
  /**
   * Create a new PaymentIntent from user request or invoice
   */
  static async createIntent(userId: string, data: {
    invoiceId?: string | null;
    amount?: number; // decimal input, converted exactly to minor units
    amountMinor?: number; // preferred when the caller already holds minor units
    currency: string;
    recipient: string;
    purpose: string;
  }) {
    // Object-level authorization: an intent may only reference an invoice the caller owns.
    if (data.invoiceId) {
      const owned = await prisma.invoice.findFirst({ where: { id: data.invoiceId, userId }, select: { id: true } });
      if (!owned) {
        throw Object.assign(new Error('Invoice not found'), { status: 404 });
      }
    }

    // 15-minute expiration window for safety
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const intent = await prisma.paymentIntent.create({
      data: {
        userId,
        invoiceId: data.invoiceId || null,
        amountMinor: data.amountMinor ?? toMinor(data.amount as number),
        currency: data.currency,
        recipient: data.recipient,
        purpose: data.purpose,
        status: PaymentState.VALIDATED,
        version: 1,
        expiresAt,
      },
      include: {
        invoice: true,
        approvals: true,
      },
    });

    await AuditService.logEvent({
      userId,
      intentId: intent.id,
      eventType: 'INTENT_CREATED',
      safeDetails: {
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        recipient: intent.recipient,
        version: intent.version,
        expiresAt: intent.expiresAt.toISOString(),
      },
    });

    return intent;
  }

  /**
   * Get Intent by ID with related invoice, approvals, and transaction
   */
  /** Intents that never reached checkout and are past their window become EXPIRED (CHECKOUT_PENDING is never auto-expired: money may be moving). */
  static async expireStaleIntents(userId?: string): Promise<number> {
    const stale = await prisma.paymentIntent.findMany({
      where: {
        ...(userId ? { userId } : {}),
        expiresAt: { lt: new Date() },
        status: { in: [PaymentState.DRAFT, PaymentState.VALIDATED, PaymentState.AWAITING_APPROVAL, PaymentState.APPROVED] },
      },
      select: { id: true, userId: true, status: true },
    });
    let expired = 0;
    for (const intent of stale) {
      const res = await prisma.paymentIntent.updateMany({
        where: { id: intent.id, status: intent.status },
        data: { status: PaymentState.EXPIRED },
      });
      if (res.count === 1) {
        expired += 1;
        await AuditService.logEvent({ userId: intent.userId, intentId: intent.id, eventType: 'INTENT_EXPIRED', safeDetails: { previousStatus: intent.status } });
      }
    }
    return expired;
  }

  /** The user's payment intents, newest first. Expired ones are settled first so statuses are truthful. */
  static async listIntents(userId: string, opts: { status?: string; limit?: number; offset?: number } = {}) {
    await this.expireStaleIntents(userId);
    return prisma.paymentIntent.findMany({
      where: { userId, ...(opts.status ? { status: opts.status } : {}) },
      include: { invoice: true, approvals: { orderBy: { approvedAt: 'desc' } }, transaction: true },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
    });
  }

  static async getIntentById(id: string, userId: string) {
    await this.expireStaleIntents(userId);
    return await prisma.paymentIntent.findFirst({
      where: { id, userId },
      include: {
        invoice: true,
        approvals: {
          orderBy: { approvedAt: 'desc' },
        },
        transaction: true,
      },
    });
  }

  /**
   * Update Payment Intent details (modifies version and resets approval)
   */
  static async updateIntent(id: string, userId: string, updates: {
    amount?: number;
    currency?: string;
    recipient?: string;
    purpose?: string;
  }) {
    const existing = await prisma.paymentIntent.findFirst({ where: { id, userId } });
    if (!existing) {
      throw Object.assign(new Error('Payment intent not found'), { status: 404 });
    }

    const MUTABLE = [PaymentState.VALIDATED, PaymentState.AWAITING_APPROVAL, PaymentState.APPROVED];
    if (!MUTABLE.includes(existing.status as PaymentState)) {
      throw Object.assign(new Error(`Cannot modify a payment intent in state '${existing.status}'.`), { status: 409 });
    }

    // Critical Security Mechanism: Incrementing version resets approval state
    const newVersion = existing.version + 1;
    const newExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const updated = await prisma.paymentIntent.update({
      where: { id },
      data: {
        ...(updates.amount !== undefined ? { amountMinor: toMinor(updates.amount) } : {}),
        ...(updates.currency !== undefined ? { currency: updates.currency } : {}),
        ...(updates.recipient !== undefined ? { recipient: updates.recipient } : {}),
        ...(updates.purpose !== undefined ? { purpose: updates.purpose } : {}),
        version: newVersion,
        paypalOrderId: null, // any previously created order is no longer valid for the new details
        status: PaymentState.VALIDATED, // Requires re-approval!
        expiresAt: newExpiresAt,
      },
      include: {
        invoice: true,
        approvals: true,
      },
    });

    await AuditService.logEvent({
      userId,
      intentId: id,
      eventType: 'INTENT_MODIFIED_VERSION_INCREMENTED',
      safeDetails: {
        previousVersion: existing.version,
        newVersion,
        updates,
      },
    });

    return updated;
  }

  /**
   * Explicit User Approval (bound to specific intentVersion)
   */
  static async approveIntent(id: string, userId: string, intentVersion: number, approvedBy: string) {
    const intent = await prisma.paymentIntent.findFirst({
      where: { id, userId },
      include: { invoice: true },
    });

    if (!intent) {
      throw Object.assign(new Error('Payment intent not found'), { status: 404 });
    }

    const APPROVABLE = [PaymentState.VALIDATED, PaymentState.AWAITING_APPROVAL];
    if (!APPROVABLE.includes(intent.status as PaymentState)) {
      throw Object.assign(new Error(`Cannot approve a payment intent in state '${intent.status}'.`), { status: 409 });
    }

    // Check version integrity
    if (intent.version !== intentVersion) {
      throw Object.assign(new Error(
        `Approval version mismatch! The intent has been modified (Current: v${intent.version}, Submitted: v${intentVersion}). Please review and approve the latest version.`
      ), { status: 409 });
    }

    // Check expiration
    if (intent.expiresAt < new Date()) {
      await prisma.paymentIntent.update({
        where: { id },
        data: { status: PaymentState.EXPIRED },
      });
      throw Object.assign(new Error('Payment intent has expired. Please create or refresh the payment intent.'), { status: 410 });
    }

    // Pre-evaluate TrustGuard before approving
    const evaluation = await TrustGuardService.evaluateIntent(id, userId);
    if (!evaluation.allowed) {
      throw Object.assign(new Error(`Cannot approve intent: ${evaluation.explanation}`), { status: 422 });
    }

    // Atomically claim the approval: only succeeds if the intent is STILL in an approvable state at THIS version.
    // Concurrent approvals / concurrent edits cannot both win, and the approval row is written in the same transaction.
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentIntent.updateMany({
        where: { id, userId, version: intentVersion, status: { in: APPROVABLE } },
        data: { status: PaymentState.APPROVED },
      });
      if (claimed.count !== 1) {
        throw Object.assign(new Error('The intent changed while approving. Review the latest version and approve again.'), { status: 409 });
      }
      await tx.approval.create({ data: { intentId: id, approvedBy, intentVersion } });
      return tx.paymentIntent.findFirstOrThrow({
        where: { id },
        include: { invoice: true, approvals: { orderBy: { approvedAt: 'desc' } } },
      });
    });

    await AuditService.logEvent({
      userId,
      intentId: id,
      eventType: 'INTENT_APPROVED',
      safeDetails: {
        approvalId: updated.approvals[0]?.id,
        intentVersion,
        approvedBy,
      },
    });

    return updated;
  }

  /**
   * Reject / Cancel Payment Intent
   */
  static async rejectIntent(id: string, userId: string, reason?: string) {
    const intent = await prisma.paymentIntent.findFirst({ where: { id, userId } });
    if (!intent) throw Object.assign(new Error('Payment intent not found'), { status: 404 });
    const REJECTABLE = [PaymentState.DRAFT, PaymentState.VALIDATED, PaymentState.AWAITING_APPROVAL, PaymentState.APPROVED];
    if (!REJECTABLE.includes(intent.status as PaymentState)) {
      throw Object.assign(new Error(`Cannot reject a payment intent in state '${intent.status}'.`), { status: 409 });
    }

    const updated = await prisma.paymentIntent.update({
      where: { id },
      data: { status: PaymentState.REJECTED },
    });

    await AuditService.logEvent({
      userId,
      intentId: id,
      eventType: 'INTENT_REJECTED',
      safeDetails: { reason: reason || 'User rejected' },
    });

    return updated;
  }
}

