/**
 * REAL PayPal Sandbox integration test. No mocks, no test doubles. Talks to api-m.sandbox.paypal.com.
 * Runs only when real Sandbox credentials are present in the environment / .env; otherwise it is SKIPPED
 * (and reported as skipped, never as passed).
 *
 * It verifies real OAuth + real Orders v2 creation + real order retrieval and idempotency.
 * Buyer approval requires a human logging into a Sandbox buyer account, so the final capture step is
 * covered by the manual demo checklist in docs/demo-script.md, not by this automated test.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

const id = process.env.PAYPAL_CLIENT_ID || '';
const secret = process.env.PAYPAL_CLIENT_SECRET || '';
const hasRealCreds = Boolean(id && secret) && !/^your_|_here$/i.test(id) && !/^your_|_here$/i.test(secret);

describe.skipIf(!hasRealCreds)('PayPal Sandbox (REAL network)', () => {
  let PayPalService: typeof import('../../apps/api/src/services/paypal.service.js').PayPalService;
  let PaymentIntentService: typeof import('../../apps/api/src/services/payment-intent.service.js').PaymentIntentService;
  let prisma: typeof import('../../apps/api/src/prisma.js').prisma;
  const userId = 'integration-test-user';

  beforeAll(async () => {
    process.env.NODE_ENV = 'integration'; // disable the automated-test doubles; use real PayPal
    ({ PayPalService } = await import('../../apps/api/src/services/paypal.service.js'));
    ({ PaymentIntentService } = await import('../../apps/api/src/services/payment-intent.service.js'));
    ({ prisma } = await import('../../apps/api/src/prisma.js'));
    await prisma.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: 'integration@example.com', name: 'Integration' } });
  });

  it('obtains a real OAuth access token', async () => {
    const token = await PayPalService.getAccessToken();
    expect(token.length).toBeGreaterThan(20);
  });

  it('creates a real Orders v2 order, returns an approve link, and is idempotent on retry', async () => {
    const intent = await PaymentIntentService.createIntent(userId, { amount: 1.0, currency: 'USD', recipient: 'Integration Vendor', purpose: 'Sandbox integration test' });
    const args = { intentId: intent.id, intentVersion: intent.version, amountMinor: intent.amountMinor, currency: 'USD', recipient: 'Integration Vendor', description: 'Sandbox integration test' };
    const first = await PayPalService.createOrder(args);
    expect(first.orderId).toMatch(/^[A-Z0-9]{10,}$/);
    expect(first.status).toBe('CREATED');
    expect(first.approveUrl).toContain('paypal.com');

    const second = await PayPalService.createOrder(args);
    expect(second.orderId).toBe(first.orderId); // stable PayPal-Request-Id => same order

    const fetched = await PayPalService.getOrderDetails(first.orderId);
    expect(fetched.purchase_units[0].custom_id).toBe(intent.id);
    expect(fetched.purchase_units[0].amount.value).toBe('1.00');
  });

  it('rejects capture of a CREATED (unapproved) order using real PayPal state', async () => {
    const intent = await PaymentIntentService.createIntent(userId, { amount: 2.0, currency: 'USD', recipient: 'Integration Vendor', purpose: 'Unapproved order check' });
    const order = await PayPalService.createOrder({ intentId: intent.id, intentVersion: 1, amountMinor: intent.amountMinor, currency: 'USD', recipient: 'Integration Vendor', description: 'Unapproved order check' });
    await expect(
      PayPalService.captureOrder({ paypalOrderId: order.orderId, intentId: intent.id, expectedAmountMinor: intent.amountMinor, expectedCurrency: 'USD' }),
    ).rejects.toThrow(/ORDER_NOT_APPROVED/);
  });
});
