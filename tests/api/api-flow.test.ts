import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { prisma } from '../../apps/api/src/prisma.js';
import { seedDatabase } from '../../apps/api/src/seed.js';

describe('PayPilot AI Complete End-to-End Workflow', () => {
  const demoUserId = 'demo-user-001';

  beforeAll(async () => {
    await seedDatabase();
  });

  it('1. GET /api/invoices retrieves seeded invoices', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('x-user-id', demoUserId);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(5);

    const hostingInvoice = res.body.find((i: any) => i.vendor === 'AWS Cloud Services');
    expect(hostingInvoice).toBeDefined();
    expect(hostingInvoice.amount).toBe(24.99);
    expect(hostingInvoice.status).toBe('UNPAID');
  });

  it('2. POST /api/ai/chat understands natural language request and prepares payment intent', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('x-user-id', demoUserId)
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
    const res = await request(app)
      .post('/api/ai/chat')
      .set('x-user-id', demoUserId)
      .send({
        message: 'I want to pay a bill',
      });

    expect(res.status).toBe(200);
    expect(res.body.suggestedAction).toBe('CLARIFY');
    expect(res.body.content).toContain('Which invoice would you like to pay?');
  });

  it('4. POST /api/ai/chat immediately detects and informs when invoice is already PAID', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('x-user-id', demoUserId)
      .send({
        message: 'Pay my Resend invoice',
      });

    expect(res.status).toBe(200);
    expect(res.body.content).toContain('is already marked as **PAID**');
  });

  it('5. Completes Full Hackathon Live Demo Payment Journey: Prepare -> Approve -> Order -> Capture -> Receipt', async () => {
    // Step A: Prepare Intent
    const chatRes = await request(app)
      .post('/api/ai/chat')
      .set('x-user-id', demoUserId)
      .send({ message: 'Prepare my hosting payment for this month' });

    const intentId = chatRes.body.paymentIntent.id;
    const intentVersion = chatRes.body.paymentIntent.version;
    expect(intentId).toBeDefined();
    expect(intentVersion).toBe(1);

    // Step B: User Explicit Approval
    const approveRes = await request(app)
      .post(`/api/intents/${intentId}/approve`)
      .set('x-user-id', demoUserId)
      .send({ intentVersion });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');

    // Step C: Create PayPal Orders v2 Order
    const orderRes = await request(app)
      .post(`/api/payments/${intentId}/order`)
      .set('x-user-id', demoUserId);

    expect(orderRes.status).toBe(200);
    expect(orderRes.body.orderId).toBeDefined();
    const paypalOrderId = orderRes.body.orderId;

    // Step D: Authoritative Server Capture
    const captureRes = await request(app)
      .post(`/api/payments/${intentId}/capture`)
      .set('x-user-id', demoUserId)
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
    const duplicateChatRes = await request(app)
      .post('/api/ai/chat')
      .set('x-user-id', demoUserId)
      .send({ message: 'Pay AWS Cloud Services invoice again' });

    expect(duplicateChatRes.body.content).toContain('already marked as **PAID**');
  });

  it('6. Rejects approval when intentVersion does not match (tampering protection)', async () => {
    // Create new intent
    const chatRes = await request(app)
      .post('/api/ai/chat')
      .set('x-user-id', demoUserId)
      .send({ message: 'Pay $45 to Figma Enterprise' });

    const intentId = chatRes.body.paymentIntent.id;

    // Tamper / update the amount, which increments version from 1 to 2
    await request(app)
      .patch(`/api/intents/${intentId}`)
      .set('x-user-id', demoUserId)
      .send({ amount: 450.0 });

    // Client tries to submit approval with stale version 1
    const approveRes = await request(app)
      .post(`/api/intents/${intentId}/approve`)
      .set('x-user-id', demoUserId)
      .send({ intentVersion: 1 });

    expect(approveRes.status).toBe(500);
    expect(approveRes.body.error).toContain('Approval version mismatch');
  });

  it('7. Handles checkout cancellation and resets status for safe retry', async () => {
    // Create intent and approve
    const chatRes = await request(app)
      .post('/api/ai/chat')
      .set('x-user-id', demoUserId)
      .send({ message: 'Pay $25 to Supabase Database' });

    const intentId = chatRes.body.paymentIntent.id;

    await request(app)
      .post(`/api/intents/${intentId}/approve`)
      .set('x-user-id', demoUserId)
      .send({ intentVersion: 1 });

    // Buyer cancels checkout
    const cancelRes = await request(app)
      .post(`/api/payments/${intentId}/cancel`)
      .set('x-user-id', demoUserId);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.intent.status).toBe('APPROVED');
  });

  it('8. Enforces idempotency: Duplicate capture requests return authoritative existing transaction', async () => {
    // Get existing transaction
    const tx = await prisma.transaction.findFirst({
      where: { intent: { userId: demoUserId } },
    });
    expect(tx).toBeDefined();

    // Verify GET /api/transactions returns this transaction
    const txsRes = await request(app)
      .get('/api/transactions')
      .set('x-user-id', demoUserId);

    expect(txsRes.status).toBe(200);
    expect(txsRes.body.length).toBeGreaterThan(0);
    expect(txsRes.body.some((t: any) => t.id === tx?.id)).toBe(true);

    // Verify GET /api/transactions/:id/receipt
    const receiptRes = await request(app)
      .get(`/api/transactions/${tx?.id}/receipt`)
      .set('x-user-id', demoUserId);

    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body.captureId).toBe(tx?.captureId);
    expect(receiptRes.body.verifiedStatus).toBe('COMPLETED');
  });

  it('9. GET /api/audit/recent returns audit trail of all actions', async () => {
    const auditRes = await request(app)
      .get('/api/audit/recent')
      .set('x-user-id', demoUserId);

    expect(auditRes.status).toBe(200);
    expect(Array.isArray(auditRes.body)).toBe(true);
    expect(auditRes.body.length).toBeGreaterThan(0);
    const eventTypes = auditRes.body.map((e: any) => e.eventType);
    expect(eventTypes).toContain('INTENT_APPROVED');
    expect(eventTypes).toContain('TRUSTGUARD_CHECK_PASSED');
  });
});
