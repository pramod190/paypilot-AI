import { Invoice, PaymentIntent, TrustGuardEvaluation, Transaction, AIChatMessage } from '@paypilot/shared';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api';

const TOKEN_KEY = 'paypilot.token';
export const AUTH_EVENT = 'paypilot:unauthorized';

export interface SessionUser { id: string; email: string; name: string }

export function hasSession(): boolean {
  return Boolean(sessionStorage.getItem(TOKEN_KEY));
}

export function logout(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

async function authRequest(path: string, body?: unknown): Promise<SessionUser> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429) throw new Error('Too many attempts. Please wait a minute and try again.');
    throw new Error(data.details?.[0]?.message || data.error || 'Sign-in failed');
  }
  sessionStorage.setItem(TOKEN_KEY, data.token);
  return data.user;
}

export const login = (email: string, password: string) => authRequest('/auth/login', { email, password });
export const register = (email: string, name: string, password: string) => authRequest('/auth/register', { email, name, password });
/** One-click shared demo identity (for judges). The server can disable it. */
export const demoLogin = () => authRequest('/auth/demo');

/** fetch() with the Bearer token. A 401 ends the session and sends the user back to the sign-in screen. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    window.dispatchEvent(new Event(AUTH_EVENT));
    throw new Error('Please sign in to continue.');
  }
  const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
  return res;
}

export async function fetchMe(): Promise<SessionUser> {
  const res = await apiFetch(`${API_BASE}/auth/me`);
  if (!res.ok) throw new Error('Not signed in');
  return res.json();
}

export interface TransactionFilters { q?: string; status?: string; minAmount?: string; maxAmount?: string; from?: string; to?: string; limit?: number }

export async function searchTransactions(filters: TransactionFilters): Promise<{ items: any[]; total: number }> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') params.set(k, String(v)); });
  const res = await apiFetch(`${API_BASE}/transactions?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.details?.[0]?.message || err.error || 'Search failed');
  }
  return { items: await res.json(), total: Number(res.headers.get('X-Total-Count') ?? 0) };
}

export async function fetchInsightsOverview(): Promise<any> {
  const res = await apiFetch(`${API_BASE}/insights/overview`);
  if (!res.ok) throw new Error('Failed to load insights');
  return res.json();
}

export async function extractInvoice(text: string): Promise<any> {
  const res = await apiFetch(`${API_BASE}/invoices/extract`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.details?.[0]?.message || data.error || 'Could not read that invoice text');
  return data;
}

export async function reconcilePayment(intentId: string): Promise<any> {
  const res = await apiFetch(`${API_BASE}/payments/${intentId}/reconcile`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Reconciliation failed');
  return data;
}

export async function fetchConfig() {
  const res = await fetch(`${API_BASE}/config`);
  return res.json();
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const res = await apiFetch(`${API_BASE}/invoices`);
  if (!res.ok) throw new Error('Failed to fetch invoices');
  return res.json();
}

export async function createInvoice(data: any): Promise<Invoice> {
  const res = await apiFetch(`${API_BASE}/invoices`, {
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
  const res = await apiFetch(`${API_BASE}/intents`, {
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
  const res = await apiFetch(`${API_BASE}/intents/${id}`, {
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
  const res = await apiFetch(`${API_BASE}/intents/${intentId}/validate`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'TrustGuard evaluation failed');
  }
  return res.json();
}

export async function approvePaymentIntent(intentId: string, intentVersion: number): Promise<PaymentIntent> {
  const res = await apiFetch(`${API_BASE}/intents/${intentId}/approve`, {
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
  const res = await apiFetch(`${API_BASE}/intents/${intentId}/reject`, {
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
  const res = await apiFetch(`${API_BASE}/payments/${intentId}/order`, {
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
  paypalOrderId: string
): Promise<{ success: boolean; transaction: Transaction; receipt: any }> {
  const res = await apiFetch(`${API_BASE}/payments/${intentId}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paypalOrderId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Authoritative capture failed');
  }
  return res.json();
}

export async function cancelPayPalCheckout(intentId: string): Promise<void> {
  await apiFetch(`${API_BASE}/payments/${intentId}/cancel`, { method: 'POST' }).catch(() => undefined);
}

export async function sendChatMessage(message: string, contextInvoiceId?: string | null): Promise<AIChatMessage> {
  const res = await apiFetch(`${API_BASE}/ai/chat`, {
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
  const res = await apiFetch(`${API_BASE}/transactions`);
  if (!res.ok) throw new Error('Failed to fetch transactions');
  return res.json();
}

export async function fetchReceipt(txId: string): Promise<any> {
  const res = await apiFetch(`${API_BASE}/transactions/${txId}/receipt`);
  if (!res.ok) throw new Error('Failed to fetch receipt');
  return res.json();
}

export async function fetchAuditEvents(): Promise<any[]> {
  const res = await apiFetch(`${API_BASE}/audit/recent`);
  if (!res.ok) throw new Error('Failed to fetch audit events');
  return res.json();
}

