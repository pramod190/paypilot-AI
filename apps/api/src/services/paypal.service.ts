import { config } from '../config.js';
import { AuditService } from './audit.service.js';
import { formatMinor, toMinor } from '@paypilot/shared';

interface PayPalAccessToken {
  token: string;
  expiresAt: number;
}

/** Error carrying an HTTP status and a flag for outcomes we cannot treat as proof of failure. */
export class PayPalError extends Error {
  constructor(message: string, public status = 502, public ambiguous = false) {
    super(message);
    this.name = 'PayPalError';
  }
}

const REQUEST_TIMEOUT_MS = 15000;

/** Simulation exists ONLY for the automated test suite. It can never be enabled by a client or by missing credentials. */
const isTestEnv = () => process.env.NODE_ENV === 'test';

export class PayPalService {
  private static cachedToken: PayPalAccessToken | null = null;

  static isConfigured(): boolean {
    const real = (v: string) => Boolean(v) && !/^your_|_here$|^changeme/i.test(v);
    return real(config.paypal.clientId) && real(config.paypal.clientSecret);
  }

  /** Fail closed: outside the test suite, real PayPal Sandbox credentials are mandatory. */
  private static assertUsable(): void {
    if (isTestEnv()) return;
    if (!this.isConfigured()) {
      throw new PayPalError(
        'PayPal Sandbox is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.',
        503,
      );
    }
    if (config.paypal.environment !== 'sandbox') {
      throw new PayPalError('Only the PayPal Sandbox environment is permitted for this application.', 503);
    }
  }

  private static async paypalFetch(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  }

  static async getAccessToken(): Promise<string> {
    if (isTestEnv()) return 'test-access-token';
    this.assertUsable();

    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60000) {
      return this.cachedToken.token;
    }

    const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
    const response = await this.paypalFetch(`${config.paypal.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new PayPalError(`PayPal OAuth failure (HTTP ${response.status})`, 502);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return this.cachedToken.token;
  }

  /**
   * Create an Orders v2 order. The idempotency key is stable per (intent, version), so a retry
   * returns the same PayPal order instead of creating a second one.
   */
  static async createOrder(params: {
    intentId: string;
    intentVersion: number;
    amountMinor: number;
    currency: string;
    recipient: string;
    description: string;
    invoiceNumber?: string;
  }): Promise<{ orderId: string; status: string; approveUrl?: string }> {
    const formattedAmount = formatMinor(params.amountMinor);

    if (isTestEnv()) {
      // Deterministic per (intent, version) so retries are idempotent, exactly like the real key below.
      const orderId = `TEST-ORDER-${params.intentId.slice(0, 8)}-v${params.intentVersion}`;
      await AuditService.logEvent({
        intentId: params.intentId,
        eventType: 'PAYPAL_ORDER_CREATED_TEST_DOUBLE',
        safeDetails: { orderId, amount: formattedAmount, currency: params.currency },
      });
      return { orderId, status: 'CREATED', approveUrl: `${config.paypal.checkoutUrl}?token=${orderId}` };
    }

    this.assertUsable();
    const token = await this.getAccessToken();

    const payload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: params.intentId,
          description: params.description.slice(0, 127),
          custom_id: params.intentId,
          invoice_id: params.invoiceNumber ? `${params.invoiceNumber}-${params.intentId.slice(0, 8)}`.slice(0, 127) : undefined,
          amount: {
            currency_code: params.currency,
            value: formattedAmount,
            breakdown: { item_total: { currency_code: params.currency, value: formattedAmount } },
          },
          items: [
            {
              name: (params.description || 'Invoice Payment').slice(0, 127),
              unit_amount: { currency_code: params.currency, value: formattedAmount },
              quantity: '1',
              category: 'DIGITAL_GOODS',
            },
          ],
        },
      ],
      application_context: {
        brand_name: 'PayPilot AI',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: config.paypal.returnUrl,
        cancel_url: config.paypal.cancelUrl,
      },
    };

    let response: Response;
    try {
      response = await this.paypalFetch(`${config.paypal.baseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': `paypilot-order-${params.intentId}-v${params.intentVersion}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      await AuditService.logEvent({
        intentId: params.intentId,
        eventType: 'PAYPAL_ORDER_CREATION_TIMEOUT_OR_NETWORK',
        safeDetails: { error: err?.name || 'network_error' },
      });
      throw new PayPalError('PayPal did not respond while creating the order. Please retry.', 504);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      await AuditService.logEvent({
        intentId: params.intentId,
        eventType: 'PAYPAL_ORDER_CREATION_FAILED',
        safeDetails: { httpStatus: response.status, name: (errorData as any)?.name, debugId: (errorData as any)?.debug_id },
      });
      throw new PayPalError(`PayPal order creation failed (HTTP ${response.status}).`, 502);
    }

    const orderData = (await response.json()) as any;
    const approveUrl = orderData.links?.find((l: any) => l.rel === 'approve' || l.rel === 'payer-action')?.href;

    await AuditService.logEvent({
      intentId: params.intentId,
      eventType: 'PAYPAL_ORDER_CREATED',
      safeDetails: { orderId: orderData.id, status: orderData.status },
    });

    return { orderId: orderData.id, status: orderData.status, approveUrl };
  }

  /** Pull the first capture out of an Orders v2 payload (capture response or order GET). */
  private static extractCapture(orderData: any) {
    const unit = orderData?.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    if (!capture) return null;
    return {
      captureId: capture.id as string,
      status: capture.status as string,
      amountMinor: toMinor(String(capture.amount?.value)),
      currency: capture.amount?.currency_code as string,
      customId: (capture.custom_id ?? unit.custom_id) as string | undefined,
    };
  }

  /**
   * Capture an approved order and verify it against the approved intent.
   * Throws PayPalError(ambiguous=true) when the outcome is unknown, so callers reconcile instead of retrying blindly.
   */
  static async captureOrder(params: {
    paypalOrderId: string;
    intentId: string;
    expectedAmountMinor: number;
    expectedCurrency: string;
  }) {
    if (isTestEnv()) {
      const captureId = `TEST-CAPTURE-${params.paypalOrderId.slice(-16)}`;
      await AuditService.logEvent({
        intentId: params.intentId,
        eventType: 'PAYPAL_ORDER_CAPTURED_TEST_DOUBLE',
        safeDetails: { orderId: params.paypalOrderId, captureId },
      });
      return {
        captureId,
        status: 'COMPLETED',
        amountMinor: params.expectedAmountMinor,
        currency: params.expectedCurrency,
        rawResponse: { id: captureId, status: 'COMPLETED', testDouble: true },
      };
    }

    this.assertUsable();
    const token = await this.getAccessToken();

    // 1. The order must exist, belong to THIS intent, and match the approved amount BEFORE we capture it.
    const order = await this.getOrderDetails(params.paypalOrderId);
    const unit = order?.purchase_units?.[0];
    if (!unit || unit.custom_id !== params.intentId) {
      throw new PayPalError('PayPal order does not belong to this payment intent.', 409);
    }
    if (toMinor(String(unit.amount?.value)) !== params.expectedAmountMinor || unit.amount?.currency_code !== params.expectedCurrency) {
      throw new PayPalError('PayPal order amount/currency differs from the approved intent.', 409);
    }

    // 2. Already captured (e.g. a previous request timed out after PayPal processed it): reconcile, never re-capture.
    let captureData: any = order.status === 'COMPLETED' ? order : null;

    if (!captureData) {
      if (order.status !== 'APPROVED') {
        throw new PayPalError(`ORDER_NOT_APPROVED: order is ${order.status}; the buyer has not approved it yet.`, 409);
      }
      try {
        const response = await this.paypalFetch(
          `${config.paypal.baseUrl}/v2/checkout/orders/${encodeURIComponent(params.paypalOrderId)}/capture`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'PayPal-Request-Id': `paypilot-capture-${params.paypalOrderId}`,
            },
          },
        );
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          await AuditService.logEvent({
            intentId: params.intentId,
            eventType: 'PAYPAL_CAPTURE_FAILED',
            safeDetails: { orderId: params.paypalOrderId, httpStatus: response.status, name: (errorData as any)?.name, debugId: (errorData as any)?.debug_id },
          });
          if (response.status >= 500) throw new PayPalError('PayPal capture outcome unknown.', 502, true);
          throw new PayPalError(`PayPal capture failed (HTTP ${response.status}): ${(errorData as any)?.name || 'error'}`, 502);
        }
        captureData = await response.json();
      } catch (err: any) {
        if (err instanceof PayPalError) throw err;
        // Timeout / network drop: PayPal may or may not have captured. Reconcile by asking PayPal.
        await AuditService.logEvent({
          intentId: params.intentId,
          eventType: 'PAYPAL_CAPTURE_AMBIGUOUS',
          safeDetails: { orderId: params.paypalOrderId, error: err?.name || 'network_error' },
        });
        const reconciled = await this.getOrderDetails(params.paypalOrderId).catch(() => null);
        if (reconciled?.status === 'COMPLETED') {
          captureData = reconciled;
        } else {
          throw new PayPalError('Capture outcome is unknown; reconciliation required before retrying.', 504, true);
        }
      }
    }

    // 3. Authoritative verification of the capture evidence.
    const capture = this.verifyCapture(captureData, params);
    await AuditService.logEvent({
      intentId: params.intentId,
      eventType: 'PAYPAL_ORDER_CAPTURED_SUCCESS',
      safeDetails: { orderId: params.paypalOrderId, captureId: capture.captureId, status: capture.status, amount: formatMinor(capture.amountMinor), currency: capture.currency },
    });

    return {
      captureId: capture.captureId,
      status: capture.status,
      amountMinor: capture.amountMinor,
      currency: capture.currency,
      rawResponse: captureData,
    };
  }


  /** Verify capture evidence from PayPal against the approved intent. Throws unless it is conclusive and matching. */
  private static verifyCapture(
    orderData: any,
    expected: { intentId: string; expectedAmountMinor: number; expectedCurrency: string },
  ) {
    const capture = this.extractCapture(orderData);
    if (!capture) throw new PayPalError('PayPal response is missing capture details.', 502, true);
    if (capture.status !== 'COMPLETED') {
      // PENDING etc. is NOT success; keep for reconciliation.
      throw new PayPalError(`Capture status is ${capture.status}, not COMPLETED.`, 202, true);
    }
    if (capture.amountMinor !== expected.expectedAmountMinor) {
      throw new PayPalError(`Authoritative amount mismatch: expected ${formatMinor(expected.expectedAmountMinor)}, got ${formatMinor(capture.amountMinor)}.`, 409);
    }
    if (capture.currency !== expected.expectedCurrency) {
      throw new PayPalError(`Authoritative currency mismatch: expected ${expected.expectedCurrency}, got ${capture.currency}.`, 409);
    }
    if (capture.customId && capture.customId !== expected.intentId) {
      throw new PayPalError('Capture does not belong to this payment intent.', 409);
    }
    return capture;
  }

  /**
   * Ask PayPal what actually happened to an order whose capture outcome was unknown.
   * Never captures; it only reads. Returns the verified capture if PayPal completed it.
   */
  static async reconcileOrder(params: {
    paypalOrderId: string;
    intentId: string;
    expectedAmountMinor: number;
    expectedCurrency: string;
  }): Promise<
    | { captured: true; captureId: string; status: string; amountMinor: number; currency: string; rawResponse: any }
    | { captured: false; orderStatus: string }
  > {
    const order = await this.getOrderDetails(params.paypalOrderId);
    const unit = order?.purchase_units?.[0];
    if (!isTestEnv() && unit?.custom_id !== params.intentId) {
      throw new PayPalError('PayPal order does not belong to this payment intent.', 409);
    }
    if (order.status !== 'COMPLETED') return { captured: false, orderStatus: String(order.status) };
    const capture = this.verifyCapture(order, params);
    await AuditService.logEvent({
      intentId: params.intentId,
      eventType: 'PAYPAL_RECONCILED_CAPTURE_FOUND',
      safeDetails: { orderId: params.paypalOrderId, captureId: capture.captureId },
    });
    return { captured: true, captureId: capture.captureId, status: capture.status, amountMinor: capture.amountMinor, currency: capture.currency, rawResponse: order };
  }

  static async getOrderDetails(orderId: string): Promise<any> {
    if (isTestEnv()) return { id: orderId, status: 'APPROVED', testDouble: true };
    this.assertUsable();

    const token = await this.getAccessToken();
    const response = await this.paypalFetch(
      `${config.paypal.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );
    if (!response.ok) throw new PayPalError(`Failed to fetch PayPal order (HTTP ${response.status}).`, response.status === 404 ? 404 : 502);
    return await response.json();
  }

  /** Verify a webhook with PayPal's verify-webhook-signature API. Fails closed. */
  static async verifyWebhookSignature(headers: Record<string, any>, event: unknown): Promise<boolean> {
    if (!this.isConfigured() || !config.paypal.webhookId) return false;
    try {
      const token = await this.getAccessToken();
      const response = await this.paypalFetch(`${config.paypal.baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: config.paypal.webhookId,
          webhook_event: event,
        }),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { verification_status?: string };
      return data.verification_status === 'SUCCESS';
    } catch {
      return false;
    }
  }
}
