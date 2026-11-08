import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { as, anonymous, DEMO_USER_ID } from '../helpers/auth.js';
import { prisma } from '../../apps/api/src/prisma.js';
import { seedDatabase } from '../../apps/api/src/seed.js';
import { AI_AGENT_TOOLS } from '../../apps/api/src/services/ai.service.js';
import { PayPalService, PayPalError } from '../../apps/api/src/services/paypal.service.js';

describe('PayPilot AI Complete End-to-End Workflow', () => {
  const demoUserId = DEMO_USER_ID;

  beforeAll(async () => {
    await seedDatabase();
  });

  it('1. GET /api/invoices retrieves seeded invoices', async () => {
    const res = await as()
      .get('/api/invoices');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(5);

    const hostingInvoice = res.body.find((i: any) => i.vendor === 'AWS Cloud Services');
    expect(hostingInvoice).toBeDefined();
    expect(hostingInvoice.amount).toBe(24.99);
    expect(hostingInvoice.status).toBe('UNPAID');
  });

  it('2. POST /api/ai/chat understands natural language request and prepares payment intent', async () => {
    const res = await as()
      .post('/api/ai/chat')
      .send({
        message: 'Prepare my hosting payment for this month',
      });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('assistant');
    expect(res.body.paymentIntent).toBeDefined();
    expect(res.body.paymentIntent.amount).toBe(24.99);
    expect(res.body.paymentIntent.recipient).toBe('AWS Cloud Services');
    expect(res.body.trustGuardResult).toBeDefined();
    expect(res.body.trustGuardResult.allowed).toBe(true);
  });

  it('3. POST /api/ai/chat asks clarification when request is ambiguous', async () => {
    const res = await as()
      .post('/api/ai/chat')
      .send({
        message: 'I want to pay a bill',
      });

    expect(res.status).toBe(200);
    expect(res.body.suggestedAction).toBe('CLARIFY');
    expect(res.body.content).toContain('Which invoice would you like to pay?');
  });

  it('4. POST /api/ai/chat immediately detects and informs when invoice is already PAID', async () => {
    const res = await as()
      .post('/api/ai/chat')
      .send({
        message: 'Pay my Resend invoice',
      });

    expect(res.status).toBe(200);
    expect(res.body.content).toContain('is already marked as **PAID**');
  });

  it('5. Completes Full Hackathon Live Demo Payment Journey: Prepare -> Approve -> Order -> Capture -> Receipt', async () => {
    // Step A: Prepare Intent
    const chatRes = await as()
      .post('/api/ai/chat')
      .send({ message: 'Prepare my hosting payment for this month' });

    const intentId = chatRes.body.paymentIntent.id;
    const intentVersion = chatRes.body.paymentIntent.version;
    expect(intentId).toBeDefined();
    expect(intentVersion).toBe(1);

    // Step B: User Explicit Approval
    const approveRes = await as()
      .post(`/api/intents/${intentId}/approve`)
      .send({ intentVersion });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');

    // Step C: Create PayPal Orders v2 Order
    const orderRes = await as()
      .post(`/api/payments/${intentId}/order`);

    expect(orderRes.status).toBe(200);
    expect(orderRes.body.orderId).toBeDefined();
    const paypalOrderId = orderRes.body.orderId;

    // Verify safe retry / re-mount: calling /order while in CHECKOUT_PENDING succeeds
    const retryOrderRes = await as()
      .post(`/api/payments/${intentId}/order`);

    expect(retryOrderRes.status).toBe(200);
    expect(retryOrderRes.body.orderId).toBeDefined();

    // Step D: Authoritative Server Capture
    const captureRes = await as()
      .post(`/api/payments/${intentId}/capture`)
      .send({ paypalOrderId });

    expect(captureRes.status).toBe(200);
    expect(captureRes.body.success).toBe(true);
    expect(captureRes.body.transaction).toBeDefined();
    expect(captureRes.body.transaction.status).toBe('COMPLETED');
    expect(captureRes.body.transaction.amount).toBe(24.99);
    expect(captureRes.body.transaction.captureId).toBeDefined();

    // Step E: Authoritative Receipt Verification
    const receipt = captureRes.body.receipt;
    expect(receipt.verifiedStatus).toBe('COMPLETED');
    expect(receipt.captureId).toBe(captureRes.body.transaction.captureId);
    expect(receipt.paypalOrderId).toBe(paypalOrderId);
    expect(receipt.amount).toBe(24.99);
    expect(receipt.auditTrail.length).toBeGreaterThan(0);

    // Step F: Verify Invoice transitioned to PAID in database
    const updatedInvoice = await prisma.invoice.findFirst({
      where: { vendor: 'AWS Cloud Services' },
    });
    expect(updatedInvoice?.status).toBe('PAID');

    // Step G: Verify that trying to pay this invoice again is BLOCKED
    const duplicateChatRes = await as()
      .post('/api/ai/chat')
      .send({ message: 'Pay AWS Cloud Services invoice again' });

    expect(duplicateChatRes.body.content).toContain('already marked as **PAID**');
  });

  it('6. Rejects approval when intentVersion does not match (tampering protection)', async () => {
    // Create new intent
    const chatRes = await as()
      .post('/api/ai/chat')
      .send({ message: 'Pay $45 to Figma Enterprise' });

    const intentId = chatRes.body.paymentIntent.id;

    // Tamper / update the amount, which increments version from 1 to 2
    await as()
      .patch(`/api/intents/${intentId}`)
      .send({ amount: 450.0 });

    // Client tries to submit approval with stale version 1
    const approveRes = await as()
      .post(`/api/intents/${intentId}/approve`)
      .send({ intentVersion: 1 });

    expect(approveRes.status).toBe(409);
    expect(approveRes.body.error).toContain('Approval version mismatch');
  });

  it('7. Handles checkout cancellation and resets status for safe retry', async () => {
    // Create intent and approve
    const chatRes = await as()
      .post('/api/ai/chat')
      .send({ message: 'Pay $25 to Supabase Database' });

    const intentId = chatRes.body.paymentIntent.id;

    await as()
      .post(`/api/intents/${intentId}/approve`)
      .send({ intentVersion: 1 });

    // Buyer cancels checkout
    const cancelRes = await as()
      .post(`/api/payments/${intentId}/cancel`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.intent.status).toBe('APPROVED');
  });

  it('8. Enforces idempotency: Duplicate capture requests return authoritative existing transaction', async () => {
    const tx = await prisma.transaction.findFirst({
      where: { intent: { userId: demoUserId } },
    });
    expect(tx).toBeDefined();

    // Verify GET /api/transactions
    const txsRes = await as()
      .get('/api/transactions');

    expect(txsRes.status).toBe(200);
    expect(txsRes.body.length).toBeGreaterThan(0);

    // Verify GET /api/transactions/:id
    const txRes = await as()
      .get(`/api/transactions/${tx?.id}`);

    expect(txRes.status).toBe(200);
    expect(txRes.body.id).toBe(tx?.id);

    // Verify GET /api/transactions/:id/receipt
    const receiptRes = await as()
      .get(`/api/transactions/${tx?.id}/receipt`);

    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body.captureId).toBe(tx?.captureId);
    expect(receiptRes.body.verifiedStatus).toBe('COMPLETED');
  });

  it('9. GET /api/audit/recent returns audit trail of all actions', async () => {
    const auditRes = await as()
      .get('/api/audit/recent');

    expect(auditRes.status).toBe(200);
    expect(Array.isArray(auditRes.body)).toBe(true);
    expect(auditRes.body.length).toBeGreaterThan(0);
    const eventTypes = auditRes.body.map((e: any) => e.eventType);
    expect(eventTypes).toContain('INTENT_APPROVED');
    expect(eventTypes).toContain('TRUSTGUARD_CHECK_PASSED');
  });

  it('10. POST /api/webhooks/paypal rejects unsigned/unverified events and logs the rejection', async () => {
    const forged = {
      id: 'WH-FORGED-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource_type: 'capture',
      resource: { id: 'CAP-FORGED-001', amount: { value: '24.99', currency_code: 'USD' } },
    };

    const webhookRes = await as().post('/api/webhooks/paypal').send(forged);
    expect(webhookRes.status).toBe(401);

    const auditRes = await as().get('/api/audit/recent');
    expect(auditRes.body.some((e: any) => e.eventType === 'WEBHOOK_REJECTED_INVALID_SIGNATURE')).toBe(true);
  });

  it('11. Verifies that all 7 required narrowly scoped AI tools are defined and configured', () => {
    const toolNames = AI_AGENT_TOOLS.map((t) => t.name);
    expect(toolNames).toContain('parse_payment_request');
    expect(toolNames).toContain('get_invoice_details');
    expect(toolNames).toContain('get_payment_policy');
    expect(toolNames).toContain('check_duplicate_invoice');
    expect(toolNames).toContain('prepare_payment_intent');
    expect(toolNames).toContain('get_transaction_history');
    expect(toolNames).toContain('request_payment_approval');
    expect(AI_AGENT_TOOLS.length).toBe(7);
  });
});

describe('PayPilot AI hardening: tampering, bypass and failure-path tests', () => {
  const demoUserId = DEMO_USER_ID;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Create an intent via chat, approve it, and (optionally) create the PayPal order. */
  async function approvedIntent(message: string, withOrder = false) {
    const chat = await as().post('/api/ai/chat').send({ message });
    const intent = chat.body.paymentIntent;
    expect(intent, `chat should prepare an intent for: ${message}`).toBeDefined();
    const approve = await as().post(`/api/intents/${intent.id}/approve`).send({ intentVersion: intent.version });
    expect(approve.status).toBe(200);
    let orderId: string | undefined;
    if (withOrder) {
      const order = await as().post(`/api/payments/${intent.id}/order`);
      expect(order.status).toBe(200);
      orderId = order.body.orderId;
    }
    return { intentId: intent.id as string, orderId };
  }

  it('H1. A client-supplied forceInstantCapture flag cannot fabricate a payment', async () => {
    const { intentId } = await approvedIntent('Pay $31 to Carol Studio', true);
    const res = await as()
      .post(`/api/payments/${intentId}/capture`)
      .send({ paypalOrderId: 'TEST-ORDER-bogus-v1', forceInstantCapture: true });
    expect(res.status).toBe(409);
    expect(await prisma.transaction.findFirst({ where: { intentId } })).toBeNull();
  });

  it('H2. Capture is refused before an order exists (state must be CHECKOUT_PENDING)', async () => {
    const { intentId } = await approvedIntent('Pay $32 to Dave Studio');
    const res = await as().post(`/api/payments/${intentId}/capture`).send({ paypalOrderId: 'TEST-ORDER-whatever' });
    expect(res.status).toBe(409);
  });

  it('H3. Unknown / unbound PayPal order ID is rejected for a real intent', async () => {
    const { intentId } = await approvedIntent('Pay $34 to Hank Studio', true);
    const res = await as().post(`/api/payments/${intentId}/capture`).send({ paypalOrderId: 'UNKNOWN-ORDER-123' });
    expect(res.status).toBe(409);
  });

  it('H4. Forged webhook cannot complete an intent; verified-but-mismatched webhook is ignored; verified+matching completes it', async () => {
    const { intentId, orderId } = await approvedIntent('Pay $33 to Erin Studio', true);
    const body = (amount: string) => ({
      id: `WH-${amount}`,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource_type: 'capture',
      resource: {
        id: `CAP-WH-${amount}`,
        custom_id: intentId,
        amount: { value: amount, currency_code: 'USD' },
        supplementary_data: { related_ids: { order_id: orderId } },
      },
    });

    // 1. Unsigned -> 401, nothing changes
    expect((await as().post('/api/webhooks/paypal').send(body('33.00'))).status).toBe(401);
    expect((await prisma.paymentIntent.findUnique({ where: { id: intentId } }))?.status).toBe('CHECKOUT_PENDING');

    // 2. Signature verified (mocked) but amount differs from what was approved -> ignored
    vi.spyOn(PayPalService, 'verifyWebhookSignature').mockResolvedValue(true);
    expect((await as().post('/api/webhooks/paypal').send(body('1.00'))).status).toBe(200);
    expect((await prisma.paymentIntent.findUnique({ where: { id: intentId } }))?.status).toBe('CHECKOUT_PENDING');

    // 3. Signature verified and evidence matches the approved intent + bound order -> recorded
    expect((await as().post('/api/webhooks/paypal').send(body('33.00'))).status).toBe(200);
    expect((await prisma.paymentIntent.findUnique({ where: { id: intentId } }))?.status).toBe('COMPLETED');
  });

  it('H5. Duplicate capture request is idempotent and returns the same transaction', async () => {
    const { intentId, orderId } = await approvedIntent('Pay $35 to Ivy Studio', true);
    const first = await as().post(`/api/payments/${intentId}/capture`).send({ paypalOrderId: orderId });
    expect(first.status).toBe(200);
    const second = await as().post(`/api/payments/${intentId}/capture`).send({ paypalOrderId: orderId });
    expect(second.status).toBe(200);
    expect(second.body.transaction.id).toBe(first.body.transaction.id);
    expect(await prisma.transaction.count({ where: { intentId } })).toBe(1);
  });

  it('H6. A completed intent cannot be cancelled, rejected, modified or re-approved', async () => {
    const { intentId, orderId } = await approvedIntent('Pay $36 to Jon Studio', true);
    await as().post(`/api/payments/${intentId}/capture`).send({ paypalOrderId: orderId });
    expect((await as().post(`/api/payments/${intentId}/cancel`)).status).toBe(409);
    expect((await as().post(`/api/intents/${intentId}/reject`).send({})).status).toBe(409);
    expect((await as().patch(`/api/intents/${intentId}`).send({ amount: 1 })).status).toBe(409);
    expect((await as().post(`/api/intents/${intentId}/approve`).send({ intentVersion: 1 })).status).toBe(409);
  });

  it('H7. Changing an approved intent invalidates approval and checkout', async () => {
    const { intentId } = await approvedIntent('Pay $37 to Kim Studio');
    const patch = await as().patch(`/api/intents/${intentId}`).send({ amount: 370 });
    expect(patch.status).toBe(200);
    expect(patch.body.version).toBe(2);
    const order = await as().post(`/api/payments/${intentId}/order`);
    expect(order.status).toBeGreaterThanOrEqual(400);
  });

  it('H8. A rejected intent cannot be approved afterwards', async () => {
    const chat = await as().post('/api/ai/chat').send({ message: 'Pay $38 to Lee Studio' });
    const id = chat.body.paymentIntent.id;
    expect((await as().post(`/api/intents/${id}/reject`).send({})).status).toBe(200);
    expect((await as().post(`/api/intents/${id}/approve`).send({ intentVersion: 1 })).status).toBe(409);
  });

  it('H9. Ambiguous request (two similar unpaid invoices) asks the user instead of guessing', async () => {
    const res = await as().post('/api/ai/chat').send({ message: 'Pay my Namecheap invoice' });
    expect(res.body.suggestedAction).toBe('CLARIFY');
    expect(res.body.paymentIntent).toBeUndefined();
    expect(res.body.content).toContain('More than one unpaid invoice');
  });

  it('H10. Missing recipient / missing amount / invalid amount are handled without creating an intent', async () => {
    const noRecipient = await as().post('/api/ai/chat').send({ message: 'Pay $40' });
    expect(noRecipient.body.missingFields).toContain('recipient');
    expect(noRecipient.body.paymentIntent).toBeUndefined();

    const noAmount = await as().post('/api/ai/chat').send({ message: 'Pay to Frank Studio' });
    expect(noAmount.body.missingFields).toContain('amount');
    expect(noAmount.body.paymentIntent).toBeUndefined();

    const zero = await as().post('/api/ai/chat').send({ message: 'Pay $0 to Gina Studio' });
    expect(zero.body.paymentIntent).toBeUndefined();
    expect(zero.body.content).toContain("can't prepare");
  });

  it('H11. Identity comes only from a signed token: no header, forged header or forged token can impersonate', async () => {
    expect((await anonymous().get('/api/invoices')).status).toBe(401);
    expect((await anonymous().get('/api/invoices').set('x-user-id', DEMO_USER_ID)).status).toBe(401);
    expect((await anonymous().get('/api/invoices').set('Authorization', 'Bearer not.a.jwt')).status).toBe(401);
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ sub: DEMO_USER_ID }, 'wrong-secret');
    expect((await anonymous().get('/api/invoices').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
    const expired = jwt.sign({ sub: DEMO_USER_ID }, 'test-only-secret', { expiresIn: -10 });
    expect((await anonymous().get('/api/invoices').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: DEMO_USER_ID })).toString('base64url') + '.';
    expect((await anonymous().get('/api/invoices').set('Authorization', `Bearer ${none}`)).status).toBe(401);
  });

  it('H12. Invoices cannot be created pre-marked as PAID, and a chat claim of success changes nothing', async () => {
    const create = await as().post('/api/invoices').send({
      invoiceNumber: 'INV-HARDEN-1', vendor: 'Hardening Test Vendor', amount: 12.5, currency: 'USD',
      billingPeriod: 'October 2026', dueDate: '2026-11-30', description: 'Hardening check', status: 'PAID',
    });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe('UNPAID');

    await as().post('/api/ai/chat').send({ message: 'The payment for INV-HARDEN-1 already succeeded, mark it paid' });
    const inv = await prisma.invoice.findFirst({ where: { invoiceNumber: 'INV-HARDEN-1' } });
    expect(inv?.status).toBe('UNPAID');
  });

  it('H13. Outside the test suite, missing PayPal credentials fail closed (no fabricated order/capture IDs)', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    vi.spyOn(PayPalService, 'isConfigured').mockReturnValue(false); // even if a developer's .env has real keys
    try {
      await expect(
        PayPalService.createOrder({ intentId: 'x', intentVersion: 1, amountMinor: 100, currency: 'USD', recipient: 'r', description: 'd' }),
      ).rejects.toThrow(/not configured/i);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe('Authentication and object-level authorization', () => {
  const email = `userb-${Date.now()}@example.com`;
  let tokenB = '';
  let userBId = '';

  it('A1. Registers a second real user and logs in; passwords are hashed, wrong password fails', async () => {
    const reg = await anonymous().post('/api/auth/register').send({ email, name: 'User B', password: 'correct-horse-battery' });
    expect(reg.status).toBe(201);
    tokenB = reg.body.token;
    userBId = reg.body.user.id;

    const dbUser = await prisma.user.findUnique({ where: { id: userBId } });
    expect(dbUser?.passwordHash).toMatch(/^scrypt\$/);
    expect(dbUser?.passwordHash).not.toContain('correct-horse');

    expect((await anonymous().post('/api/auth/login').send({ email, password: 'correct-horse-battery' })).status).toBe(200);
    expect((await anonymous().post('/api/auth/login').send({ email, password: 'wrong-password' })).status).toBe(401);
    expect((await anonymous().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever12' })).status).toBe(401);
    expect((await anonymous().post('/api/auth/register').send({ email, name: 'Dup', password: 'correct-horse-battery' })).status).toBe(409);
    expect((await anonymous().post('/api/auth/register').send({ email: 'x@example.com', name: 'Weak', password: 'short' })).status).toBe(400);
  });

  it('A2. User B cannot see, read, pay or approve anything belonging to the demo user', async () => {
    const asDemo = as();
    const invoices = (await asDemo.get('/api/invoices')).body;
    const demoInvoice = invoices.find((i: any) => i.vendor === 'Supabase Database');
    const chat = await asDemo.post('/api/ai/chat').send({ message: 'Pay $61 to Owner Studio' });
    const demoIntent = chat.body.paymentIntent;
    expect(demoIntent).toBeDefined();

    const B = { get: (u: string) => anonymous().get(u).set('Authorization', `Bearer ${tokenB}`), post: (u: string) => anonymous().post(u).set('Authorization', `Bearer ${tokenB}`) };

    expect((await B.get('/api/invoices')).body).toEqual([]);
    expect((await B.get(`/api/invoices/${demoInvoice.id}`)).status).toBe(404);
    expect((await B.get(`/api/intents/${demoIntent.id}`)).status).toBe(404);
    expect((await B.post(`/api/intents/${demoIntent.id}/approve`).send({ intentVersion: demoIntent.version })).status).toBe(404);
    expect((await B.post(`/api/payments/${demoIntent.id}/order`)).status).toBeGreaterThanOrEqual(400);
    expect((await B.post(`/api/payments/${demoIntent.id}/capture`).send({ paypalOrderId: 'ORDER-NOT-MINE-123' })).status).toBe(404);
    expect((await B.get('/api/transactions')).body).toEqual([]);

    // B cannot create an intent against the demo user's invoice
    const steal = await B.post('/api/intents').send({ invoiceId: demoInvoice.id, amount: 25, currency: 'USD', recipient: 'Supabase Database', purpose: 'steal' });
    expect(steal.status).toBeGreaterThanOrEqual(400);
    // and the demo user's intent state is untouched
    expect((await prisma.paymentIntent.findUnique({ where: { id: demoIntent.id } }))?.status).toBe('VALIDATED');
  });

  it('A3. Demo login works when enabled and /api/auth/me reflects the token owner', async () => {
    const demo = await anonymous().post('/api/auth/demo');
    expect(demo.status).toBe(200);
    const me = await anonymous().get('/api/auth/me').set('Authorization', `Bearer ${demo.body.token}`);
    expect(me.body.id).toBe(DEMO_USER_ID);
  });
});

describe('Ambiguous PayPal outcomes: timeout, reconciliation and safe retry', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  async function pendingOrder(message: string) {
    const chat = await as().post('/api/ai/chat').send({ message });
    const intent = chat.body.paymentIntent;
    await as().post(`/api/intents/${intent.id}/approve`).send({ intentVersion: intent.version });
    const order = await as().post(`/api/payments/${intent.id}/order`);
    return { intentId: intent.id as string, orderId: order.body.orderId as string };
  }

  it('R1. Capture timeout => PENDING_RECONCILIATION (not FAILED); blind retry blocked; reconcile (not captured) re-opens safely; retry then succeeds', async () => {
    const { intentId, orderId } = await pendingOrder('Pay $71 to Timeout Studio');

    const spy = vi.spyOn(PayPalService, 'captureOrder').mockRejectedValueOnce(new PayPalError('Capture outcome is unknown', 504, true));
    const first = await as().post(`/api/payments/${intentId}/capture`).send({ paypalOrderId: orderId });
    expect(first.status).toBe(504);
    expect((await prisma.paymentIntent.findUnique({ where: { id: intentId } }))?.status).toBe('PENDING_RECONCILIATION');
    expect(await prisma.transaction.count({ where: { intentId } })).toBe(0);

    // Blind retry is refused while the outcome is unknown
    const blind = await as().post(`/api/payments/${intentId}/capture`).send({ paypalOrderId: orderId });
    expect(blind.status).toBe(409);
    expect(spy).toHaveBeenCalledTimes(1);

    // Reconcile: PayPal reports the order was NOT captured -> safe to retry
    const rec = await as().post(`/api/payments/${intentId}/reconcile`);
    expect(rec.status).toBe(200);
    expect(rec.body.outcome).toBe('NOT_CAPTURED');
    expect((await prisma.paymentIntent.findUnique({ where: { id: intentId } }))?.status).toBe('CHECKOUT_PENDING');

    const retry = await as().post(`/api/payments/${intentId}/capture`).send({ paypalOrderId: orderId });
    expect(retry.status).toBe(200);
    expect(await prisma.transaction.count({ where: { intentId } })).toBe(1);
  });

  it('R2. Reconcile that finds PayPal DID capture records exactly one verified transaction', async () => {
    const { intentId, orderId } = await pendingOrder('Pay $72 to Late Capture Studio');
    vi.spyOn(PayPalService, 'captureOrder').mockRejectedValueOnce(new PayPalError('unknown', 504, true));
    await as().post(`/api/payments/${intentId}/capture`).send({ paypalOrderId: orderId });

    vi.spyOn(PayPalService, 'reconcileOrder').mockResolvedValueOnce({
      captured: true, captureId: 'CAP-FOUND-BY-RECONCILE', status: 'COMPLETED', amountMinor: 7200, currency: 'USD', rawResponse: { id: orderId },
    });
    const rec = await as().post(`/api/payments/${intentId}/reconcile`);
    expect(rec.status).toBe(200);
    expect(rec.body.outcome).toBe('CAPTURED');
    expect(rec.body.receipt.captureId).toBe('CAP-FOUND-BY-RECONCILE');
    expect((await prisma.paymentIntent.findUnique({ where: { id: intentId } }))?.status).toBe('COMPLETED');
    expect(await prisma.transaction.count({ where: { intentId } })).toBe(1);
  });

  it('R3. Reconcile is refused unless the intent is actually pending reconciliation', async () => {
    const { intentId } = await pendingOrder('Pay $73 to Normal Studio');
    expect((await as().post(`/api/payments/${intentId}/reconcile`)).status).toBe(409);
  });

  it('R4. A PayPal API failure (non-ambiguous) leaves the intent retryable and records no transaction', async () => {
    const { intentId, orderId } = await pendingOrder('Pay $74 to Declined Studio');
    vi.spyOn(PayPalService, 'captureOrder').mockRejectedValueOnce(new PayPalError('PayPal capture failed (HTTP 422): INSTRUMENT_DECLINED', 502, false));
    const res = await as().post(`/api/payments/${intentId}/capture`).send({ paypalOrderId: orderId });
    expect(res.status).toBe(502);
    expect(res.body.error).toContain('INSTRUMENT_DECLINED');
    expect((await prisma.paymentIntent.findUnique({ where: { id: intentId } }))?.status).toBe('CHECKOUT_PENDING');
    expect(await prisma.transaction.count({ where: { intentId } })).toBe(0);
  });

  it('R5. Money is stored as integer cents and approval of a decimal-precision-abusing amount is refused', async () => {
    const ok = await as().post('/api/intents').send({ amount: 24.99, currency: 'USD', recipient: 'Cents Co', purpose: 'precision' });
    expect(ok.status).toBe(201);
    expect(ok.body.amountMinor).toBe(2499);
    const row = await prisma.$queryRaw<{ amountMinor: number }[]>`SELECT "amountMinor" FROM "PaymentIntent" WHERE id = ${ok.body.id}`;
    expect(row[0].amountMinor).toBe(2499);

    const bad = await as().post('/api/intents').send({ amount: 24.999, currency: 'USD', recipient: 'Cents Co', purpose: 'precision' });
    expect(bad.status).toBe(400);
  });
});
