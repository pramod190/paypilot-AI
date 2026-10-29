import { Invoice, PaymentIntent, TrustGuardEvaluation, Transaction, AIChatMessage } from '@paypilot/shared';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api';

export async function fetchConfig() {
  const res = await fetch(`${API_BASE}/config`);
  return res.json();
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const res = await fetch(`${API_BASE}/invoices`);
  if (!res.ok) throw new Error('Failed to fetch invoices');
  return res.json();
}

export async function createInvoice(data: any): Promise<Invoice> {
  const res = await fetch(`${API_BASE}/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create invoice');
  }
  return res.json();
}

export async function createPaymentIntent(data: {
  invoiceId?: string | null;
  amount: number;
  currency: string;
  recipient: string;
  purpose: string;
}): Promise<PaymentIntent> {
  const res = await fetch(`${API_BASE}/intents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create payment intent');
  }
  return res.json();
}

export async function updatePaymentIntent(id: string, updates: any): Promise<PaymentIntent> {
  const res = await fetch(`${API_BASE}/intents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update payment intent');
  }
  return res.json();
}

export async function evaluateTrustGuard(intentId: string): Promise<TrustGuardEvaluation> {
  const res = await fetch(`${API_BASE}/intents/${intentId}/validate`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'TrustGuard evaluation failed');
  }
  return res.json();
}

export async function approvePaymentIntent(intentId: string, intentVersion: number): Promise<PaymentIntent> {
  const res = await fetch(`${API_BASE}/intents/${intentId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intentVersion }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to approve intent');
  }
  return res.json();
}

export async function rejectPaymentIntent(intentId: string, reason?: string): Promise<PaymentIntent> {
  const res = await fetch(`${API_BASE}/intents/${intentId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to reject intent');
  }
  return res.json();
}

export async function createPayPalOrder(intentId: string): Promise<{ orderId: string; status: string; approveUrl?: string }> {
  const res = await fetch(`${API_BASE}/payments/${intentId}/order`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create PayPal order');
  }
  return res.json();
}

export async function capturePayPalPayment(
  intentId: string,
  paypalOrderId: string,
  forceInstantCapture?: boolean
): Promise<{ success: boolean; transaction: Transaction; receipt: any }> {
  const res = await fetch(`${API_BASE}/payments/${intentId}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paypalOrderId, forceInstantCapture }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Authoritative capture failed');
  }
  return res.json();
}

export async function sendChatMessage(message: string, contextInvoiceId?: string | null): Promise<AIChatMessage> {
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, contextInvoiceId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'AI Chat failed');
  }
  return res.json();
}

export async function fetchTransactions(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/transactions`);
  if (!res.ok) throw new Error('Failed to fetch transactions');
  return res.json();
}

export async function fetchReceipt(txId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/transactions/${txId}/receipt`);
  if (!res.ok) throw new Error('Failed to fetch receipt');
  return res.json();
}

export async function fetchAuditEvents(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/audit/recent`);
  if (!res.ok) throw new Error('Failed to fetch audit events');
  return res.json();
}

