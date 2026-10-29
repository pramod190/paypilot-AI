import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../apps/api/src/prisma.js';
import { TrustGuardService } from '../../apps/api/src/services/trustguard.service.js';
import { PaymentIntentService } from '../../apps/api/src/services/payment-intent.service.js';
import { InvoiceService } from '../../apps/api/src/services/invoice.service.js';
import { PaymentState, InvoiceStatus } from '@paypilot/shared';

describe('TrustGuard Policy Engine', () => {
  const testUserId = 'test-user-trustguard';

  beforeEach(async () => {
    // Setup clean test user and cleanup test records
    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: { id: testUserId, email: 'tg-test@example.com', name: 'TrustGuard Tester' },
    });

    await prisma.auditEvent.deleteMany({ where: { userId: testUserId } });
    await prisma.transaction.deleteMany({ where: { intent: { userId: testUserId } } });
    await prisma.approval.deleteMany({ where: { intent: { userId: testUserId } } });
    await prisma.paymentIntent.deleteMany({ where: { userId: testUserId } });
    await prisma.invoice.deleteMany({ where: { userId: testUserId } });
  });

  it('1. Passes valid payment intent with supported currency and positive amount', async () => {
    const intent = await PaymentIntentService.createIntent(testUserId, {
      amount: 24.99,
      currency: 'USD',
      recipient: 'AWS Cloud Services',
      purpose: 'Monthly hosting',
    });

    const evalResult = await TrustGuardService.evaluateIntent(intent.id, testUserId);
    expect(evalResult.allowed).toBe(true);
    expect(evalResult.intentVersion).toBe(1);
    expect(evalResult.checks.every(c => c.passed)).toBe(true);
  });

  it('2. Blocks payment intent with negative or zero amount', async () => {
    // Force create with 0 amount to test TrustGuard defense-in-depth
    const intent = await prisma.paymentIntent.create({
      data: {
        userId: testUserId,
        amount: -10.0,
        currency: 'USD',
        recipient: 'Attacker',
        purpose: 'Negative drain exploit',
        status: PaymentState.DRAFT,
        version: 1,
        expiresAt: new Date(Date.now() + 60000),
      },
    });

    const evalResult = await TrustGuardService.evaluateIntent(intent.id, testUserId);
    expect(evalResult.allowed).toBe(false);
    const amountCheck = evalResult.checks.find(c => c.ruleName === 'VALID_AMOUNT');
    expect(amountCheck?.passed).toBe(false);
  });

  it('3. Blocks payment intent exceeding maximum transaction limit ($10,000)', async () => {
    const intent = await prisma.paymentIntent.create({
      data: {
        userId: testUserId,
        amount: 25000.0,
        currency: 'USD',
        recipient: 'Whale Vendor',
        purpose: 'Above limit',
        status: PaymentState.DRAFT,
        version: 1,
        expiresAt: new Date(Date.now() + 60000),
      },
    });

    const evalResult = await TrustGuardService.evaluateIntent(intent.id, testUserId);
    expect(evalResult.allowed).toBe(false);
    expect(evalResult.explanation).toContain('Single transaction limit');
  });

  it('4. Blocks payment intent with unsupported currency', async () => {
    const intent = await prisma.paymentIntent.create({
      data: {
        userId: testUserId,
        amount: 100.0,
        currency: 'XYZ',
        recipient: 'Global Vendor',
        purpose: 'Unknown currency',
        status: PaymentState.DRAFT,
        version: 1,
        expiresAt: new Date(Date.now() + 60000),
      },
    });

    const evalResult = await TrustGuardService.evaluateIntent(intent.id, testUserId);
    expect(evalResult.allowed).toBe(false);
    const currencyCheck = evalResult.checks.find(c => c.ruleName === 'SUPPORTED_CURRENCY');
    expect(currencyCheck?.passed).toBe(false);
  });

  it('5. Blocks payment for an invoice that is already marked as PAID', async () => {
    const invoice = await InvoiceService.createInvoice(testUserId, {
      invoiceNumber: 'INV-PAID-001',
      vendor: 'Resend',
      amount: 20.0,
      currency: 'USD',
      billingPeriod: 'October 2026',
      dueDate: '2026-10-31',
      description: 'Email tier',
      status: InvoiceStatus.PAID,
    });

    const intent = await PaymentIntentService.createIntent(testUserId, {
      invoiceId: invoice.id,
      amount: 20.0,
      currency: 'USD',
      recipient: 'Resend',
      purpose: 'Duplicate pay attempt',
    });

    const evalResult = await TrustGuardService.evaluateIntent(intent.id, testUserId);
    expect(evalResult.allowed).toBe(false);
    expect(evalResult.explanation).toContain('is already paid');
  });

  it('6. Blocks payment intent if user is unauthorized (object-level access control)', async () => {
    const otherUserId = 'other-unauthorized-user';
    const intent = await PaymentIntentService.createIntent(testUserId, {
      amount: 50.0,
      currency: 'USD',
      recipient: 'Designer',
      purpose: 'Design asset',
    });

    const evalResult = await TrustGuardService.evaluateIntent(intent.id, otherUserId);
    expect(evalResult.allowed).toBe(false);
    const authCheck = evalResult.checks.find(c => c.ruleName === 'USER_AUTHORIZATION');
    expect(authCheck?.passed).toBe(false);
  });

  it('7. Enforces intent version integrity: modifying amount invalidates previous approval', async () => {
    // 1. Create intent
    const intent = await PaymentIntentService.createIntent(testUserId, {
      amount: 24.99,
      currency: 'USD',
      recipient: 'Hosting Provider',
      purpose: 'Cloud server',
    });
    expect(intent.version).toBe(1);

    // 2. User explicitly approves v1
    const approved = await PaymentIntentService.approveIntent(intent.id, testUserId, 1, 'TrustGuard Tester');
    expect(approved.status).toBe(PaymentState.APPROVED);

    // Verify TrustGuard allows checkout now
    let evalResult = await TrustGuardService.evaluateIntent(intent.id, testUserId);
    expect(evalResult.allowed).toBe(true);

    // 3. Amount is tampered or edited from $24.99 to $249.99
    const updated = await PaymentIntentService.updateIntent(intent.id, testUserId, {
      amount: 249.99,
    });
    expect(updated.version).toBe(2);
    expect(updated.status).toBe(PaymentState.VALIDATED); // Reset to VALIDATED

    // 4. TrustGuard must now BLOCK checkout because approval was for v1, but intent is now v2!
    evalResult = await TrustGuardService.evaluateIntent(intent.id, testUserId);
    // If someone tries to checkout with old approval, assertAllowedForCheckout fails
    await expect(TrustGuardService.assertAllowedForCheckout(intent.id, testUserId)).rejects.toThrow();
  });

  it('8. Blocks expired payment intents', async () => {
    const expiredDate = new Date(Date.now() - 1000); // 1 second ago
    const intent = await prisma.paymentIntent.create({
      data: {
        userId: testUserId,
        amount: 30.0,
        currency: 'USD',
        recipient: 'Stale Vendor',
        purpose: 'Expired intent',
        status: PaymentState.DRAFT,
        version: 1,
        expiresAt: expiredDate,
      },
    });

    const evalResult = await TrustGuardService.evaluateIntent(intent.id, testUserId);
    expect(evalResult.allowed).toBe(false);
    const expCheck = evalResult.checks.find(c => c.ruleName === 'INTENT_EXPIRATION');
    expect(expCheck?.passed).toBe(false);
  });
});

