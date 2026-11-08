import { prisma } from '../prisma.js';
import { SupportedCurrencies, formatMinor, MAX_SINGLE_PAYMENT_MINOR } from '@paypilot/shared';
import { PolicyCheckResult, TrustGuardEvaluation } from '@paypilot/shared';
import { AuditService } from './audit.service.js';

export class TrustGuardService {
  /**
   * Run full TrustGuard policy evaluation on a PaymentIntent
   */
  static async evaluateIntent(intentId: string, currentUserId: string): Promise<TrustGuardEvaluation> {
    const checks: PolicyCheckResult[] = [];
    let allowed = true;
    const explanations: string[] = [];

    const intent = await prisma.paymentIntent.findUnique({
      where: { id: intentId },
      include: {
        invoice: true,
        approvals: {
          orderBy: { approvedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!intent) {
      return {
        allowed: false,
        intentId,
        intentVersion: 0,
        checks: [{
          ruleName: 'INTENT_EXISTS',
          passed: false,
          message: 'Payment intent not found',
        }],
        explanation: 'Payment blocked: The requested payment intent does not exist.',
        evaluatedAt: new Date().toISOString(),
      };
    }

    // Rule 1: Authorization & Ownership
    if (intent.userId !== currentUserId) {
      checks.push({
        ruleName: 'USER_AUTHORIZATION',
        passed: false,
        message: 'Unauthorized: Intent belongs to another account',
      });
      allowed = false;
      explanations.push('Payment blocked: Unauthorized access attempt.');
    } else {
      checks.push({
        ruleName: 'USER_AUTHORIZATION',
        passed: true,
        message: 'Caller is verified owner of this intent',
      });
    }

    // Rule 2: Amount Validity
    if (!Number.isInteger(intent.amountMinor) || intent.amountMinor <= 0) {
      checks.push({
        ruleName: 'VALID_AMOUNT',
        passed: false,
        message: `Invalid amount: ${formatMinor(intent.amountMinor)}. Must be strictly positive.`,
      });
      allowed = false;
      explanations.push('Payment blocked: The amount must be greater than zero.');
    } else if (intent.amountMinor > MAX_SINGLE_PAYMENT_MINOR) {
      checks.push({
        ruleName: 'VALID_AMOUNT',
        passed: false,
        message: `Amount exceeds maximum single transaction limit of $10,000.`,
      });
      allowed = false;
      explanations.push('Payment blocked: Single transaction limit of $10,000 exceeded.');
    } else {
      checks.push({
        ruleName: 'VALID_AMOUNT',
        passed: true,
        message: `Amount of ${intent.currency} ${formatMinor(intent.amountMinor)} is within authorized boundaries.`,
      });
    }

    // Rule 3: Supported Currency
    if (!SupportedCurrencies.includes(intent.currency as any)) {
      checks.push({
        ruleName: 'SUPPORTED_CURRENCY',
        passed: false,
        message: `Currency '${intent.currency}' is not supported. Supported: ${SupportedCurrencies.join(', ')}`,
      });
      allowed = false;
      explanations.push(`Payment blocked: Currency ${intent.currency} is not supported.`);
    } else {
      checks.push({
        ruleName: 'SUPPORTED_CURRENCY',
        passed: true,
        message: `Currency ${intent.currency} is supported.`,
      });
    }

    // Rule 4: Expiration Check
    const now = new Date();
    if (intent.expiresAt < now) {
      checks.push({
        ruleName: 'INTENT_EXPIRATION',
        passed: false,
        message: `Intent expired at ${intent.expiresAt.toISOString()}.`,
      });
      allowed = false;
      explanations.push('Payment blocked: Payment intent has expired. Please create a new intent.');
      
      // Update intent status to EXPIRED if not already
      if (intent.status !== 'EXPIRED' && intent.status !== 'COMPLETED') {
        await prisma.paymentIntent.update({
          where: { id: intent.id },
          data: { status: 'EXPIRED' },
        });
      }
    } else {
      checks.push({
        ruleName: 'INTENT_EXPIRATION',
        passed: true,
        message: `Intent valid until ${intent.expiresAt.toISOString()}.`,
      });
    }

    // Rule 5: Invoice Status & Duplicates
    if (intent.invoiceId && intent.invoice) {
      if (intent.invoice.status === 'PAID') {
        checks.push({
          ruleName: 'INVOICE_NOT_PAID',
          passed: false,
          message: `Invoice #${intent.invoice.invoiceNumber} has already been marked as PAID.`,
        });
        allowed = false;
        explanations.push(`Payment blocked: Invoice #${intent.invoice.invoiceNumber} is already paid.`);
      } else if (intent.invoice.status === 'CANCELLED') {
        checks.push({
          ruleName: 'INVOICE_NOT_CANCELLED',
          passed: false,
          message: `Invoice #${intent.invoice.invoiceNumber} has been CANCELLED.`,
        });
        allowed = false;
        explanations.push(`Payment blocked: Invoice #${intent.invoice.invoiceNumber} was cancelled.`);
      } else {
        checks.push({
          ruleName: 'INVOICE_STATUS',
          passed: true,
          message: `Invoice #${intent.invoice.invoiceNumber} status is ${intent.invoice.status} (payable).`,
        });
      }

      // Currency must match the invoice currency
      if (intent.currency !== intent.invoice.currency) {
        checks.push({
          ruleName: 'INVOICE_CURRENCY_MATCH',
          passed: false,
          message: `Payment currency (${intent.currency}) differs from invoice currency (${intent.invoice.currency}).`,
        });
        allowed = false;
        explanations.push(`Payment blocked: Intent currency (${intent.currency}) does not match invoice currency (${intent.invoice.currency}).`);
      }

      // Check if amount matches invoice amount
      if (intent.amountMinor !== intent.invoice.amountMinor) {
        checks.push({
          ruleName: 'INVOICE_AMOUNT_MATCH',
          passed: false,
          message: `Payment amount (${formatMinor(intent.amountMinor)}) differs from invoice amount (${formatMinor(intent.invoice.amountMinor)}).`,
        });
        allowed = false;
        explanations.push(`Payment blocked: Intent amount ($${formatMinor(intent.amountMinor)}) does not match invoice ($${formatMinor(intent.invoice.amountMinor)}).`);
      } else {
        checks.push({
          ruleName: 'INVOICE_AMOUNT_MATCH',
          passed: true,
          message: 'Payment amount exactly matches invoice total.',
        });
      }
    }

    // Rule 6: Duplicate Intent / Payment Velocity Check
    // Check if another completed transaction exists for this invoice or vendor+amount recently
    const recentDuplicateTransaction = await prisma.transaction.findFirst({
      where: {
        intent: {
          userId: currentUserId,
          invoiceId: intent.invoiceId || undefined,
          recipient: intent.recipient,
          amountMinor: intent.amountMinor,
          id: { not: intent.id },
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // last 24h
          },
        },
      },
      include: { intent: true },
    });

    if (recentDuplicateTransaction) {
      checks.push({
        ruleName: 'DUPLICATE_PAYMENT_DETECTION',
        passed: false,
        message: `A completed payment of ${intent.currency} ${formatMinor(intent.amountMinor)} to ${intent.recipient} occurred recently (Tx ID: ${recentDuplicateTransaction.id}).`,
      });
      allowed = false;
      explanations.push(`Payment blocked: Potential duplicate detected. A completed payment to ${intent.recipient} was processed within the last 24 hours.`);
    } else {
      checks.push({
        ruleName: 'DUPLICATE_PAYMENT_DETECTION',
        passed: true,
        message: 'No duplicate completed transactions found for this invoice or recipient.',
      });
    }

    // Rule 6b: New payee warning (informational: never blocks, but surfaces on the approval card).
    if (!intent.invoiceId) {
      const [knownVendor, paidBefore] = await Promise.all([
        prisma.invoice.findFirst({ where: { userId: currentUserId, vendor: { equals: intent.recipient, mode: 'insensitive' } }, select: { id: true } }),
        prisma.transaction.findFirst({ where: { intent: { userId: currentUserId, recipient: { equals: intent.recipient, mode: 'insensitive' }, id: { not: intent.id } } }, select: { id: true } }),
      ]);
      checks.push(
        knownVendor || paidBefore
          ? { ruleName: 'KNOWN_PAYEE', passed: true, message: `"${intent.recipient}" is a known payee (invoiced or paid before).` }
          : { ruleName: 'KNOWN_PAYEE', passed: true, severity: 'warning', message: `New payee: you have never been invoiced by or paid "${intent.recipient}". This payment is not tied to an invoice, so verify the recipient before approving.` },
      );
    }

    // Rule 7: Approval and Version Integrity
    const latestApproval = intent.approvals[0];
    if (intent.status === 'APPROVED' || intent.status === 'CHECKOUT_PENDING') {
      if (!latestApproval) {
        checks.push({
          ruleName: 'EXPLICIT_APPROVAL_EXISTS',
          passed: false,
          message: 'Intent is marked approved, but no explicit approval record was found.',
        });
        allowed = false;
        explanations.push('Payment blocked: No explicit user approval record found on the server.');
      } else if (latestApproval.intentVersion !== intent.version) {
        checks.push({
          ruleName: 'APPROVAL_VERSION_INTEGRITY',
          passed: false,
          message: `Approval version mismatch: Approved version ${latestApproval.intentVersion} vs Current version ${intent.version}. Protected details were modified after approval!`,
        });
        allowed = false;
        explanations.push(`Approval expired because payment details changed. Review and approve the updated intent (version ${intent.version}).`);
      } else {
        checks.push({
          ruleName: 'APPROVAL_VERSION_INTEGRITY',
          passed: true,
          message: `Approval verified for version ${intent.version} by ${latestApproval.approvedBy} at ${latestApproval.approvedAt.toISOString()}.`,
        });
      }
    }

    const explanation = explanations.length > 0
      ? explanations.join(' ')
      : 'All TrustGuard policy checks passed successfully. Intent is safe for checkout.';

    await AuditService.logEvent({
      userId: currentUserId,
      intentId: intent.id,
      eventType: allowed ? 'TRUSTGUARD_CHECK_PASSED' : 'TRUSTGUARD_CHECK_BLOCKED',
      safeDetails: { allowed, checkCount: checks.length, explanation },
    });

    return {
      allowed,
      intentId: intent.id,
      intentVersion: intent.version,
      checks,
      explanation,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Enforce verification before PayPal Order creation
   */
  static async assertAllowedForCheckout(intentId: string, currentUserId: string): Promise<void> {
    const evaluation = await this.evaluateIntent(intentId, currentUserId);
    if (!evaluation.allowed) {
      throw Object.assign(new Error(`TrustGuard Policy Violation: ${evaluation.explanation}`), { status: 422 });
    }

    // Must be in APPROVED or CHECKOUT_PENDING state with explicit approval
    const intent = await prisma.paymentIntent.findUnique({
      where: { id: intentId },
      include: { approvals: true },
    });
    if (!intent || (intent.status !== 'APPROVED' && intent.status !== 'CHECKOUT_PENDING')) {
      throw Object.assign(new Error(`Cannot checkout intent in state '${intent?.status}'. Intent must be explicitly APPROVED by user.`), { status: 409 });
    }

    if (!intent.approvals || intent.approvals.length === 0) {
      throw Object.assign(new Error('Cannot checkout intent: No explicit approval record found.'), { status: 409 });
    }
  }
}

