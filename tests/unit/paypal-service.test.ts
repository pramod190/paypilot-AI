/**
 * MOCKED-NETWORK tests. These run the REAL PayPalService code paths (OAuth, order creation, capture
 * verification, reconciliation, webhook verification) with `fetch` replaced by a scripted fake.
 * They prove our logic handles PayPal's failure modes. They do NOT prove PayPal itself works:
 * see tests/integration/paypal-sandbox.test.ts for the real Sandbox test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PayPalService, PayPalError } from '../../apps/api/src/services/paypal.service.js';
import { AuditService } from '../../apps/api/src/services/audit.service.js';
import { config } from '../../apps/api/src/config.js';

const INTENT = 'intent-1234-abcd';
const ORDER = 'ORDER-ABC123';
const base = { paypalOrderId: ORDER, intentId: INTENT, expectedAmountMinor: 2499, expectedCurrency: 'USD' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const orderBody = (over: any = {}) => ({
  id: ORDER,
  status: 'APPROVED',
  purchase_units: [{ custom_id: INTENT, amount: { value: '24.99', currency_code: 'USD' }, ...(over.unit || {}) }],
  ...over.root,
});
const completedBody = (capture: any = {}) => ({
  id: ORDER,
  status: 'COMPLETED',
  purchase_units: [{
    custom_id: INTENT,
    amount: { value: '24.99', currency_code: 'USD' },
    payments: { captures: [{ id: 'CAP-REAL-1', status: 'COMPLETED', amount: { value: '24.99', currency_code: 'USD' }, custom_id: INTENT, ...capture }] },
  }],
});

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
function mockNetwork(handler: Handler) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/v1/oauth2/token')) return json({ access_token: 'tok', expires_in: 3600 });
    return handler(url, init);
  }));
  return calls;
}

describe('PayPalService against a scripted PayPal (mocked network)', () => {
  const saved = { env: process.env.NODE_ENV, id: config.paypal.clientId, secret: config.paypal.clientSecret, wh: config.paypal.webhookId, pe: config.paypal.environment };

  beforeEach(() => {
    process.env.NODE_ENV = 'development'; // leave test-double mode so real code paths run
    config.paypal.clientId = 'real-looking-client-id';
    config.paypal.clientSecret = 'real-looking-secret';
    config.paypal.environment = 'sandbox';
    config.paypal.webhookId = 'WH-TEST';
    (PayPalService as any).cachedToken = null;
    vi.spyOn(AuditService, 'logEvent').mockResolvedValue(undefined as any);
  });
  afterEach(() => {
    process.env.NODE_ENV = saved.env;
    Object.assign(config.paypal, { clientId: saved.id, clientSecret: saved.secret, webhookId: saved.wh, environment: saved.pe });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates an order with exact decimal value and a STABLE idempotency key', async () => {
    const calls = mockNetwork(() => json({ id: ORDER, status: 'CREATED', links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/x' }] }, 201));
    const args = { intentId: INTENT, intentVersion: 3, amountMinor: 2499, currency: 'USD', recipient: 'AWS', description: 'Hosting' };
    const a = await PayPalService.createOrder(args);
    await PayPalService.createOrder(args);
    expect(a.orderId).toBe(ORDER);
    const orderCalls = calls.filter(c => c.url.endsWith('/v2/checkout/orders'));
    const body = JSON.parse(orderCalls[0].init.body as string);
    expect(body.purchase_units[0].amount.value).toBe('24.99');
    expect(body.purchase_units[0].custom_id).toBe(INTENT);
    const keys = orderCalls.map(c => (c.init.headers as any)['PayPal-Request-Id']);
    expect(keys[0]).toBe(keys[1]); // retry => same key => PayPal returns the same order
    expect(keys[0]).toContain('v3');
  });

  it('order creation: PayPal 4xx/5xx and network timeout surface as clean errors', async () => {
    mockNetwork(() => json({ name: 'UNPROCESSABLE_ENTITY', debug_id: 'dbg' }, 422));
    await expect(PayPalService.createOrder({ intentId: INTENT, intentVersion: 1, amountMinor: 100, currency: 'USD', recipient: 'r', description: 'd' }))
      .rejects.toMatchObject({ name: 'PayPalError', status: 502 });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/v1/oauth2/token')) return json({ access_token: 't', expires_in: 3600 });
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    }));
    await expect(PayPalService.createOrder({ intentId: INTENT, intentVersion: 1, amountMinor: 100, currency: 'USD', recipient: 'r', description: 'd' }))
      .rejects.toMatchObject({ status: 504 });
  });

  it('capture: verified COMPLETED capture is returned with the real capture id', async () => {
    mockNetwork((url, init) => init.method === 'POST' ? json(completedBody()) : json(orderBody()));
    const res = await PayPalService.captureOrder(base);
    expect(res.captureId).toBe('CAP-REAL-1');
    expect(res.amountMinor).toBe(2499);
  });

  it('capture: refuses an order that belongs to a different intent (no money moves)', async () => {
    const calls = mockNetwork(() => json(orderBody({ unit: { custom_id: 'someone-elses-intent' } })));
    await expect(PayPalService.captureOrder(base)).rejects.toMatchObject({ status: 409 });
    expect(calls.some(c => c.url.endsWith('/capture'))).toBe(false);
  });

  it('capture: refuses when PayPal order amount differs from the approved amount', async () => {
    const calls = mockNetwork(() => json(orderBody({ unit: { amount: { value: '249.99', currency_code: 'USD' } } })));
    await expect(PayPalService.captureOrder(base)).rejects.toMatchObject({ status: 409 });
    expect(calls.some(c => c.url.endsWith('/capture'))).toBe(false);
  });

  it('capture: refuses a buyer-has-not-approved order (status CREATED)', async () => {
    mockNetwork(() => json(orderBody({ root: { status: 'CREATED' } })));
    await expect(PayPalService.captureOrder(base)).rejects.toThrow(/ORDER_NOT_APPROVED/);
  });

  it('capture: detects authoritative amount mismatch in the capture response', async () => {
    mockNetwork((url, init) => init.method === 'POST' ? json(completedBody({ amount: { value: '1.00', currency_code: 'USD' } })) : json(orderBody()));
    await expect(PayPalService.captureOrder(base)).rejects.toThrow(/amount mismatch/i);
  });

  it('capture: PENDING capture is NOT success and is flagged ambiguous', async () => {
    mockNetwork((url, init) => init.method === 'POST' ? json(completedBody({ status: 'PENDING' })) : json(orderBody()));
    await expect(PayPalService.captureOrder(base)).rejects.toMatchObject({ ambiguous: true });
  });

  it('capture: PayPal 5xx on capture is ambiguous (do not assume failure)', async () => {
    mockNetwork((url, init) => init.method === 'POST' ? json({ name: 'INTERNAL_SERVER_ERROR' }, 500) : json(orderBody()));
    await expect(PayPalService.captureOrder(base)).rejects.toMatchObject({ ambiguous: true });
  });

  it('capture: timeout then RECONCILE finds PayPal already captured -> success without double-capturing', async () => {
    let orderGets = 0;
    const calls = mockNetwork((url, init) => {
      if (init.method === 'POST') throw Object.assign(new Error('socket hang up'), { name: 'TimeoutError' });
      orderGets += 1;
      return orderGets === 1 ? json(orderBody()) : json(completedBody()); // 1st read: APPROVED; after timeout: COMPLETED
    });
    const res = await PayPalService.captureOrder(base);
    expect(res.captureId).toBe('CAP-REAL-1');
    expect(calls.filter(c => c.url.endsWith('/capture')).length).toBe(1);
  });

  it('capture: timeout and PayPal still shows APPROVED -> ambiguous (caller must reconcile, not blindly retry)', async () => {
    mockNetwork((url, init) => {
      if (init.method === 'POST') throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      return json(orderBody());
    });
    await expect(PayPalService.captureOrder(base)).rejects.toMatchObject({ ambiguous: true, status: 504 });
  });

  it('capture: order already COMPLETED at PayPal is reconciled, never re-captured', async () => {
    const calls = mockNetwork(() => json(completedBody()));
    const res = await PayPalService.captureOrder(base);
    expect(res.captureId).toBe('CAP-REAL-1');
    expect(calls.some(c => c.url.endsWith('/capture'))).toBe(false);
  });

  it('reconcile: reports captured vs not-captured from PayPal state (read only)', async () => {
    mockNetwork(() => json(completedBody()));
    expect(await PayPalService.reconcileOrder(base)).toMatchObject({ captured: true, captureId: 'CAP-REAL-1' });
    mockNetwork(() => json(orderBody()));
    expect(await PayPalService.reconcileOrder(base)).toEqual({ captured: false, orderStatus: 'APPROVED' });
  });

  it('fails closed with no credentials, placeholder credentials, or a non-sandbox environment', async () => {
    config.paypal.clientId = ''; config.paypal.clientSecret = '';
    await expect(PayPalService.getAccessToken()).rejects.toMatchObject({ status: 503 });
    config.paypal.clientId = 'your_paypal_sandbox_client_id_here'; config.paypal.clientSecret = 'your_paypal_sandbox_client_secret_here';
    expect(PayPalService.isConfigured()).toBe(false);
    config.paypal.clientId = 'real'; config.paypal.clientSecret = 'real'; (config.paypal as any).environment = 'production';
    await expect(PayPalService.getAccessToken()).rejects.toMatchObject({ status: 503 });
  });

  it('webhook verification: SUCCESS accepted; FAILURE, HTTP error, network error and missing webhook id all rejected', async () => {
    const hdrs = { 'paypal-auth-algo': 'a', 'paypal-cert-url': 'c', 'paypal-transmission-id': 'i', 'paypal-transmission-sig': 's', 'paypal-transmission-time': 't' };
    mockNetwork(() => json({ verification_status: 'SUCCESS' }));
    expect(await PayPalService.verifyWebhookSignature(hdrs, { id: 'e' })).toBe(true);
    mockNetwork(() => json({ verification_status: 'FAILURE' }));
    expect(await PayPalService.verifyWebhookSignature(hdrs, { id: 'e' })).toBe(false);
    mockNetwork(() => json({}, 500));
    expect(await PayPalService.verifyWebhookSignature(hdrs, { id: 'e' })).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url.endsWith('/token')) return json({ access_token: 't', expires_in: 9 }); throw new Error('down'); }));
    expect(await PayPalService.verifyWebhookSignature(hdrs, { id: 'e' })).toBe(false);
    config.paypal.webhookId = '';
    expect(await PayPalService.verifyWebhookSignature(hdrs, { id: 'e' })).toBe(false);
  });
});
