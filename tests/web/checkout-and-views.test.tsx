// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PayPalCheckoutModal } from '../../apps/web/src/components/PayPalCheckoutModal';
import { TransactionsView } from '../../apps/web/src/components/TransactionsView';
import { InvoiceModal } from '../../apps/web/src/components/InvoiceModal';
import { PaymentsView } from '../../apps/web/src/components/PaymentsView';
import { InsightsPanel } from '../../apps/web/src/components/InsightsPanel';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function fakeApi(routes: Record<string, (init?: RequestInit, url?: string) => Response>) {
  const calls: { method: string; url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, init });
    const key = Object.keys(routes).find(k => { const [m, p] = k.split(' '); return m === method && url.startsWith(p); });
    return key ? routes[key](init, url) : json({ error: 'not mocked' }, 404);
  }));
  return calls;
}

beforeEach(() => sessionStorage.setItem('paypilot.token', 'tok'));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); delete (window as any).paypal; document.head.querySelectorAll('script').forEach(s => s.remove()); });

const intent: any = { id: 'intent-1', amount: 24.99, amountMinor: 2499, currency: 'USD', recipient: 'AWS Cloud Services', purpose: 'Hosting', version: 1, status: 'APPROVED' };

/** Make the PayPal SDK "already loaded" so the modal mounts the Buttons without a network script fetch. */
function installFakePayPal() {
  const src = 'https://www.paypal.com/sdk/js?client-id=cid&currency=USD&intent=capture&disable-funding=credit,card';
  const s = document.createElement('script'); s.setAttribute('src', src); document.head.appendChild(s);
  const render = vi.fn().mockResolvedValue(undefined);
  const Buttons = vi.fn(() => ({ render, close: vi.fn() }));
  (window as any).paypal = { Buttons };
  return { Buttons, render };
}

describe('PayPalCheckoutModal: the browser is never trusted with money', () => {
  it('createOrder sends NO amount; onApprove sends ONLY the order id; success surfaces the server receipt', async () => {
    const pp = installFakePayPal();
    const calls = fakeApi({
      'GET /api/config': () => json({ isPayPalConfigured: true, paypalClientId: 'cid' }),
      'POST /api/payments/intent-1/order': () => json({ orderId: 'ORDER-9', status: 'CREATED' }),
      'POST /api/payments/intent-1/capture': () => json({ success: true, receipt: { captureId: 'CAP-REAL', verifiedStatus: 'COMPLETED' } }),
    });
    const onSuccess = vi.fn();
    render(<PayPalCheckoutModal intent={intent} onClose={vi.fn()} onSuccess={onSuccess} />);
    await waitFor(() => expect(pp.render).toHaveBeenCalled());
    expect(screen.getByText(/SANDBOX/)).toBeInTheDocument();
    const cfg = pp.Buttons.mock.calls[0][0] as any;

    const orderId = await act(async () => cfg.createOrder());
    expect(orderId).toBe('ORDER-9');
    const orderCall = calls.find(c => c.url.endsWith('/order'))!;
    expect(orderCall.init!.body).toBeUndefined(); // the server derives the amount from the approved intent

    await act(async () => cfg.onApprove({ orderID: 'ORDER-9' }));
    const capture = calls.find(c => c.url.endsWith('/capture'))!;
    expect(Object.keys(JSON.parse(capture.init!.body as string))).toEqual(['paypalOrderId']); // no amount, no status, no flags
    expect(onSuccess).toHaveBeenCalledWith({ captureId: 'CAP-REAL', verifiedStatus: 'COMPLETED' });
    expect((capture.init!.headers as any).Authorization).toBe('Bearer tok');
  });

  it('a failed server capture shows the error and never reports success', async () => {
    const pp = installFakePayPal();
    fakeApi({
      'GET /api/config': () => json({ isPayPalConfigured: true, paypalClientId: 'cid' }),
      'POST /api/payments/intent-1/capture': () => json({ error: 'This PayPal order is not bound to the payment intent.' }, 409),
    });
    const onSuccess = vi.fn();
    render(<PayPalCheckoutModal intent={intent} onClose={vi.fn()} onSuccess={onSuccess} />);
    await waitFor(() => expect(pp.render).toHaveBeenCalled());
    await act(async () => (pp.Buttons.mock.calls[0][0] as any).onApprove({ orderID: 'FORGED' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not bound to the payment intent');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('buyer cancellation tells the server and keeps the intent retryable', async () => {
    const pp = installFakePayPal();
    const calls = fakeApi({
      'GET /api/config': () => json({ isPayPalConfigured: true, paypalClientId: 'cid' }),
      'POST /api/payments/intent-1/cancel': () => json({ message: 'ok' }),
    });
    render(<PayPalCheckoutModal intent={intent} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(pp.render).toHaveBeenCalled());
    await act(async () => (pp.Buttons.mock.calls[0][0] as any).onCancel());
    expect(await screen.findByRole('alert')).toHaveTextContent(/cancelled/i);
    expect(calls.some(c => c.url.endsWith('/intent-1/cancel') && c.method === 'POST')).toBe(true);
  });

  it('refuses to start checkout when the server has no PayPal credentials, instead of faking one', async () => {
    const pp = installFakePayPal();
    fakeApi({ 'GET /api/config': () => json({ isPayPalConfigured: false, paypalClientId: '' }) });
    render(<PayPalCheckoutModal intent={intent} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not configured/i);
    expect(pp.Buttons).not.toHaveBeenCalled();
    expect(screen.queryByText(/instant/i)).not.toBeInTheDocument(); // the old simulated-capture button is gone
  });
});

describe('TransactionsView: server-side search', () => {
  const row = (id: string, recipient: string, amountMinor: number) => ({
    id, paypalOrderId: `ORD-${id}`, captureId: `CAP-${id}`, amount: amountMinor / 100, amountMinor, currency: 'USD', status: 'COMPLETED',
    createdAt: new Date().toISOString(), intent: { recipient, purpose: `${recipient} services`, invoice: { invoiceNumber: `INV-${id}` }, approvals: [] },
  });

  it('queries the server (debounced) with the typed text and amount range, and shows the total', async () => {
    const calls = fakeApi({ 'GET /api/transactions': (_i, url) => json(url!.includes('q=alpha') ? [row('1', 'Alpha Filter Co', 5100)] : [], 200, { 'X-Total-Count': url!.includes('q=alpha') ? '1' : '0' }) });
    render(<TransactionsView transactions={[row('1', 'Alpha Filter Co', 5100), row('2', 'Beta Filter Co', 5200)]} onViewReceipt={vi.fn()} />);
    expect(screen.getByText('2 transactions')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Search transactions'), 'alpha');
    await waitFor(() => expect(calls.some(c => c.url.includes('q=alpha'))).toBe(true));
    expect(await screen.findByText('1 transaction')).toBeInTheDocument();
    expect(screen.queryByText('Beta Filter Co')).not.toBeInTheDocument();
    expect(calls.filter(c => c.url.includes('/api/transactions')).length).toBeLessThanOrEqual(2); // debounced, not one request per keystroke

    await userEvent.type(screen.getByLabelText('Minimum amount'), '50');
    await waitFor(() => expect(calls.some(c => c.url.includes('minAmount=50'))).toBe(true));
  });

  it('shows the server validation message instead of failing silently', async () => {
    fakeApi({ 'GET /api/transactions': () => json({ error: 'Validation failed', details: [{ path: 'minAmount', message: 'At most 2 decimal places' }] }, 400) });
    render(<TransactionsView transactions={[]} onViewReceipt={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Minimum amount'), '1.234');
    expect(await screen.findByText('At most 2 decimal places')).toBeInTheDocument();
  });
});

describe('InvoiceModal: paste-to-autofill', () => {
  it('fills the form from the extracted draft, surfaces duplicate + injection warnings, and saves as UNPAID only after submit', async () => {
    const calls = fakeApi({
      'POST /api/invoices/extract': () => json({
        draft: { invoiceNumber: 'ACME-2026-0042', vendor: 'Acme Hosting Ltd', amount: 149.5, currency: 'USD', billingPeriod: 'October 2026', dueDate: '2026-11-20', description: 'Dedicated server' },
        missing: [], source: 'heuristic', saved: false,
        warnings: ['This document contains text that looks like instructions to an AI. It was treated purely as data and had no effect.'],
        duplicates: [{ invoiceNumber: 'ACME-2026-0042', vendor: 'Acme Hosting Ltd', amount: '149.50', status: 'UNPAID', reason: 'Same invoice number' }],
      }),
      'POST /api/invoices': () => json({ id: 'new' }, 201),
    });
    const onCreated = vi.fn();
    render(<InvoiceModal onClose={vi.fn()} onCreated={onCreated} />);

    const autofill = screen.getByRole('button', { name: 'Autofill' });
    expect(autofill).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/paste invoice text/i), 'Acme Hosting Ltd\nInvoice No: ACME-2026-0042\nTotal due: $149.50');
    await userEvent.click(autofill);

    expect(await screen.findByDisplayValue('Acme Hosting Ltd')).toBeInTheDocument();
    expect(screen.getByDisplayValue('149.5')).toBeInTheDocument();
    expect(screen.getByText(/looks like instructions to an AI/)).toBeInTheDocument();
    expect(screen.getByText(/Possible duplicate: #ACME-2026-0042/)).toBeInTheDocument();
    expect(calls.some(c => c.url.endsWith('/api/invoices') && c.method === 'POST')).toBe(false); // nothing saved yet

    await userEvent.click(screen.getByRole('button', { name: /create invoice|save|add invoice/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const saved = JSON.parse(calls.find(c => c.url.endsWith('/api/invoices') && c.method === 'POST')!.init!.body as string);
    expect(saved).toMatchObject({ invoiceNumber: 'ACME-2026-0042', amount: 149.5, status: 'UNPAID' });
  });
});

describe('PaymentsView: resume and reconcile', () => {
  const base = { currency: 'USD', amount: 10, version: 1, purpose: 'p' };

  it('offers Resume Checkout for a pending checkout and a status check (not a retry) for an unknown outcome', async () => {
    const calls = fakeApi({
      'GET /api/intents': () => json([
        { ...base, id: 'aaaaaaaa-1', recipient: 'Pending Co', status: 'CHECKOUT_PENDING' },
        { ...base, id: 'bbbbbbbb-2', recipient: 'Unknown Co', status: 'PENDING_RECONCILIATION' },
      ]),
      'POST /api/payments/bbbbbbbb-2/reconcile': () => json({ reconciled: true, outcome: 'NOT_CAPTURED' }),
    });
    render(<PaymentsView onSelectTab={vi.fn()} onPaymentCompleted={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /resume checkout/i })).toBeInTheDocument();
    expect(screen.getByText(/do not retry yet/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /check payment status/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/not captured/i);
    expect(calls.some(c => c.url.endsWith('/bbbbbbbb-2/reconcile') && c.method === 'POST')).toBe(true);
  });

  it('when PayPal did capture, reconcile hands the verified receipt to the app', async () => {
    fakeApi({
      'GET /api/intents': () => json([{ ...base, id: 'cccccccc-3', recipient: 'Late Co', status: 'PENDING_RECONCILIATION' }]),
      'POST /api/payments/cccccccc-3/reconcile': () => json({ reconciled: true, outcome: 'CAPTURED', receipt: { captureId: 'CAP-LATE' } }),
    });
    const onDone = vi.fn();
    render(<PaymentsView onSelectTab={vi.fn()} onPaymentCompleted={onDone} />);
    await userEvent.click(await screen.findByRole('button', { name: /check payment status/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ captureId: 'CAP-LATE' }));
  });
});

describe('InsightsPanel', () => {
  it('renders server-computed figures and flags payments that need attention', async () => {
    fakeApi({
      'GET /api/insights/overview': () => json({
        outstanding: { count: 3, totalMinor: 12345 }, overdue: [{ vendor: 'Late Vendor' }], dueSoon: [], paidThisMonth: { totalMinor: 2499 },
        pendingApprovals: 2, pendingReconciliation: 1, recentTransactions: [],
      }),
    });
    render(<InsightsPanel />);
    expect(await screen.findByText('$123.45')).toBeInTheDocument();
    expect(screen.getByText('3 unpaid invoices')).toBeInTheDocument();
    expect(screen.getByText('$24.99')).toBeInTheDocument();
    expect(screen.getByText(/2 payments awaiting you/)).toBeInTheDocument();
    expect(screen.getByText(/1 payment need a status check/)).toBeInTheDocument();
  });
});
