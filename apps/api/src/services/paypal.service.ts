import { config } from '../config.js';
import { AuditService } from './audit.service.js';

interface PayPalAccessToken {
  token: string;
  expiresAt: number;
}

export class PayPalService {
  private static cachedToken: PayPalAccessToken | null = null;

  /**
   * Check if real PayPal credentials are provided
   */
  static isConfigured(): boolean {
    return Boolean(config.paypal.clientId && config.paypal.clientSecret);
  }

  /**
   * Obtain an OAuth 2.0 Access Token from PayPal Sandbox REST API
   */
  static async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60000) {
      return this.cachedToken.token;
    }

    if (!this.isConfigured()) {
      // In offline / test mode without credentials
      return 'mock-sandbox-access-token';
    }

    const auth = Buffer.from(
      `${config.paypal.clientId}:${config.paypal.clientSecret}`
    ).toString('base64');

    const url = `${config.paypal.baseUrl}/v1/oauth2/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`PayPal OAuth failure: ${response.status} ${errText}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };

    return this.cachedToken.token;
  }

  /**
   * Create an Order with PayPal Orders v2 REST API
   */
  static async createOrder(params: {
    intentId: string;
    amount: number;
    currency: string;
    recipient: string;
    description: string;
    invoiceNumber?: string;
  }): Promise<{ orderId: string; status: string; approveUrl?: string }> {
    const formattedAmount = params.amount.toFixed(2);

    if (!this.isConfigured()) {
      // Real sandbox fallback simulation if credentials not yet set by user
      const mockOrderId = `SANDBOX-ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
      await AuditService.logEvent({
        intentId: params.intentId,
        eventType: 'PAYPAL_ORDER_CREATED_SIMULATED',
        safeDetails: { orderId: mockOrderId, amount: formattedAmount, currency: params.currency },
      });
      return {
        orderId: mockOrderId,
        status: 'CREATED',
        approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${mockOrderId}`,
      };
    }

    const token = await this.getAccessToken();
    const url = `${config.paypal.baseUrl}/v2/checkout/orders`;

    const payload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: params.intentId,
          description: params.description.slice(0, 127),
          custom_id: params.intentId,
          invoice_id: params.invoiceNumber || undefined,
          amount: {
            currency_code: params.currency,
            value: formattedAmount,
            breakdown: {
              item_total: {
                currency_code: params.currency,
                value: formattedAmount,
              },
            },
          },
          items: [
            {
              name: (params.description || 'Invoice Payment').slice(0, 127),
              unit_amount: {
                currency_code: params.currency,
                value: formattedAmount,
              },
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
        return_url: `${config.clientUrl}/payment/success`,
        cancel_url: `${config.clientUrl}/payment/cancel`,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `paypilot-${params.intentId}-${Date.now()}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      await AuditService.logEvent({
        intentId: params.intentId,
        eventType: 'PAYPAL_ORDER_CREATION_FAILED',
        safeDetails: { error: errorData },
      });
      throw new Error(`PayPal Order creation failed: ${JSON.stringify(errorData)}`);
    }

    const orderData = (await response.json()) as any;
    const approveUrl = orderData.links?.find((l: any) => l.rel === 'approve')?.href;

    await AuditService.logEvent({
      intentId: params.intentId,
      eventType: 'PAYPAL_ORDER_CREATED',
      safeDetails: { orderId: orderData.id, status: orderData.status },
    });

    return {
      orderId: orderData.id,
      status: orderData.status,
      approveUrl,
    };
  }

  /**
   * Authoritative Capture of an approved PayPal Order
   */
  static async captureOrder(params: {
    paypalOrderId: string;
    intentId: string;
    expectedAmount: number;
    expectedCurrency: string;
  }): Promise<{
    captureId: string;
    status: string;
    amount: number;
    currency: string;
    rawResponse: any;
  }> {
    if (!this.isConfigured()) {
      // Mock Sandbox authorization verification
      const mockCaptureId = `SANDBOX-CAP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
      await AuditService.logEvent({
        intentId: params.intentId,
        eventType: 'PAYPAL_ORDER_CAPTURED_SIMULATED',
        safeDetails: {
          orderId: params.paypalOrderId,
          captureId: mockCaptureId,
          amount: params.expectedAmount,
          currency: params.expectedCurrency,
        },
      });
      return {
        captureId: mockCaptureId,
        status: 'COMPLETED',
        amount: params.expectedAmount,
        currency: params.expectedCurrency,
        rawResponse: { id: mockCaptureId, status: 'COMPLETED', simulated: true },
      };
    }

    const token = await this.getAccessToken();
    const url = `${config.paypal.baseUrl}/v2/checkout/orders/${params.paypalOrderId}/capture`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `capture-${params.intentId}-${Date.now()}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      await AuditService.logEvent({
        intentId: params.intentId,
        eventType: 'PAYPAL_CAPTURE_FAILED',
        safeDetails: { orderId: params.paypalOrderId, error: errorData },
      });
      throw new Error(`PayPal Capture failed: ${JSON.stringify(errorData)}`);
    }

    const captureData = (await response.json()) as any;
    const captureUnit = captureData.purchase_units?.[0]?.payments?.captures?.[0];

    if (!captureUnit) {
      throw new Error('PayPal capture response missing payment details');
    }

    const captureId = captureUnit.id;
    const status = captureUnit.status;
    const capturedAmount = parseFloat(captureUnit.amount.value);
    const capturedCurrency = captureUnit.amount.currency_code;

    // Authoritative verification: amount and currency must match approved intent
    if (Math.abs(capturedAmount - params.expectedAmount) > 0.001) {
      throw new Error(`Authoritative amount mismatch: expected ${params.expectedAmount} but got ${capturedAmount}`);
    }
    if (capturedCurrency !== params.expectedCurrency) {
      throw new Error(`Authoritative currency mismatch: expected ${params.expectedCurrency} but got ${capturedCurrency}`);
    }
    if (status !== 'COMPLETED') {
      throw new Error(`Capture status not completed: ${status}`);
    }

    await AuditService.logEvent({
      intentId: params.intentId,
      eventType: 'PAYPAL_ORDER_CAPTURED_SUCCESS',
      safeDetails: {
        orderId: params.paypalOrderId,
        captureId,
        status,
        amount: capturedAmount,
        currency: capturedCurrency,
      },
    });

    return {
      captureId,
      status,
      amount: capturedAmount,
      currency: capturedCurrency,
      rawResponse: captureData,
    };
  }

  /**
   * Fetch authoritatively from PayPal
   */
  static async getOrderDetails(orderId: string): Promise<any> {
    if (!this.isConfigured()) {
      return { id: orderId, status: 'APPROVED', simulated: true };
    }

    const token = await this.getAccessToken();
    const url = `${config.paypal.baseUrl}/v2/checkout/orders/${orderId}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch PayPal order: ${response.status}`);
    }

    return await response.json();
  }
}

