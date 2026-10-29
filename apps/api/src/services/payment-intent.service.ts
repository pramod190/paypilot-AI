import { prisma } from '../prisma.js';
import { PaymentState, InvoiceStatus } from '@paypilot/shared';
import { TrustGuardService } from './trustguard.service.js';
import { AuditService } from './audit.service.js';

export class PaymentIntentService {
  /**
   * Create a new PaymentIntent from user request or invoice
   */
  static async createIntent(userId: string, data: {
    invoiceId?: string | null;
    amount: number;
    currency: string;
    recipient: string;
    purpose: string;
  }) {
    // 15-minute expiration window for safety
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const intent = await prisma.paymentIntent.create({
      data: {
        userId,
        invoiceId: data.invoiceId || null,
        amount: data.amount,
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
        amount: intent.amount,
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
  static async getIntentById(id: string, userId: string) {
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
      throw new Error('Payment intent not found');
    }

    if (existing.status === PaymentState.COMPLETED) {
      throw new Error('Cannot modify a completed payment intent');
    }

    // Critical Security Mechanism: Incrementing version resets approval state
    const newVersion = existing.version + 1;
    const newExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const updated = await prisma.paymentIntent.update({
      where: { id },
      data: {
        ...updates,
        version: newVersion,
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
      throw new Error('Payment intent not found');
    }

    if (intent.status === PaymentState.COMPLETED) {
      throw new Error('Payment intent has already been completed');
    }

    // Check version integrity
    if (intent.version !== intentVersion) {
      throw new Error(
        `Approval version mismatch! The intent has been modified (Current: v${intent.version}, Submitted: v${intentVersion}). Please review and approve the latest version.`
      );
    }

    // Check expiration
    if (intent.expiresAt < new Date()) {
      await prisma.paymentIntent.update({
        where: { id },
        data: { status: PaymentState.EXPIRED },
      });
      throw new Error('Payment intent has expired. Please create or refresh the payment intent.');
    }

    // Pre-evaluate TrustGuard before approving
    const evaluation = await TrustGuardService.evaluateIntent(id, userId);
    if (!evaluation.allowed) {
      throw new Error(`Cannot approve intent: ${evaluation.explanation}`);
    }

    // Record the explicit Approval
    const approval = await prisma.approval.create({
      data: {
        intentId: id,
        approvedBy,
        intentVersion,
      },
    });

    // Update status to APPROVED
    const updated = await prisma.paymentIntent.update({
      where: { id },
      data: { status: PaymentState.APPROVED },
      include: {
        invoice: true,
        approvals: { orderBy: { approvedAt: 'desc' } },
      },
    });

    await AuditService.logEvent({
      userId,
      intentId: id,
      eventType: 'INTENT_APPROVED',
      safeDetails: {
        approvalId: approval.id,
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
    if (!intent) throw new Error('Payment intent not found');

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

