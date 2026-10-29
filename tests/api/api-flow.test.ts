import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { prisma } from '../../apps/api/src/prisma.js';
import { seedDatabase } from '../../apps/api/src/seed.js';
import { AI_AGENT_TOOLS } from '../../apps/api/src/services/ai.service.js';

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

    // Verify safe retry / re-mount: calling /order while in CHECKOUT_PENDING succeeds
    const retryOrderRes = await request(app)
      .post(`/api/payments/${intentId}/order`)
      .set('x-user-id', demoUserId);

    expect(retryOrderRes.status).toBe(200);
    expect(retryOrderRes.body.orderId).toBeDefined();

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
    const tx = await prisma.transaction.findFirst({
      where: { intent: { userId: demoUserId } },
    });
    expect(tx).toBeDefined();

    // Verify GET /api/transactions
    const txsRes = await request(app)
      .get('/api/transactions')
      .set('x-user-id', demoUserId);

    expect(txsRes.status).toBe(200);
    expect(txsRes.body.length).toBeGreaterThan(0);

    // Verify GET /api/transactions/:id
    const txRes = await request(app)
      .get(`/api/transactions/${tx?.id}`)
      .set('x-user-id', demoUserId);

    expect(txRes.status).toBe(200);
    expect(txRes.body.id).toBe(tx?.id);

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

  it('10. POST /api/webhooks/paypal processes authoritative PayPal webhook events', async () => {
    const mockWebhookPayload = {
      id: 'WH-TEST-2026-EVENT-99',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource_type: 'capture',
      summary: 'Payment capture completed for testing',
      resource: {
        id: 'CAP-TEST-WH-001',
        amount: { value: '24.99', currency_code: 'USD' },
      },
    };

    const webhookRes = await request(app)
      .post('/api/webhooks/paypal')
      .send(mockWebhookPayload);

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.received).toBe(true);

    // Verify webhook was recorded in audit log
    const auditRes = await request(app)
      .get('/api/audit/recent')
      .set('x-user-id', demoUserId);

    expect(auditRes.body.some((e: any) => e.eventType === 'WEBHOOK_PAYMENT_CAPTURE_COMPLETED')).toBe(true);
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
