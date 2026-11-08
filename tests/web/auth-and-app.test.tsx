// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from '../../apps/web/src/components/LoginScreen';
import { App } from '../../apps/web/src/App';
import { apiFetch, hasSession, logout, AUTH_EVENT } from '../../apps/web/src/api';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** Route table fake backend: first matching "METHOD /path-prefix" wins. */
function fakeApi(routes: Record<string, (init?: RequestInit) => Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find(k => {
      const [method, path] = k.split(' ');
      return (init?.method ?? 'GET') === method && url.startsWith(path);
    });
    return key ? routes[key](init) : json({}, 404);
  }));
  return calls;
}

beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Session handling (api client)', () => {
  it('refuses to call the API without a token and tells the app to show sign-in', async () => {
    const onAuth = vi.fn();
    window.addEventListener(AUTH_EVENT, onAuth);
    const calls = fakeApi({});
    await expect(apiFetch('/api/invoices')).rejects.toThrow(/sign in/i);
    expect(onAuth).toHaveBeenCalled();
    expect(calls.length).toBe(0); // no unauthenticated request was even attempted
    window.removeEventListener(AUTH_EVENT, onAuth);
  });

  it('sends the Bearer token and ends the session on a 401', async () => {
    sessionStorage.setItem('paypilot.token', 'tok-123');
    const onAuth = vi.fn();
    window.addEventListener(AUTH_EVENT, onAuth);
    const calls = fakeApi({ 'GET /api/invoices': () => json({ error: 'expired' }, 401) });
    const res = await apiFetch('/api/invoices');
    expect(res.status).toBe(401);
    expect((calls[0].init!.headers as any).Authorization).toBe('Bearer tok-123');
    expect(hasSession()).toBe(false);
    expect(onAuth).toHaveBeenCalled();
    window.removeEventListener(AUTH_EVENT, onAuth);
  });
});

describe('LoginScreen', () => {
  it('signs in with email and password and stores the token', async () => {
    const onSignedIn = vi.fn();
    const calls = fakeApi({ 'POST /api/auth/login': () => json({ token: 'T1', user: { id: 'u', email: 'a@b.co', name: 'A' } }) });
    render(<LoginScreen onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'hunter2hunter2');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(sessionStorage.getItem('paypilot.token')).toBe('T1');
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ email: 'a@b.co', password: 'hunter2hunter2' });
  });

  it('shows the server error and stays signed out on bad credentials; handles rate limiting', async () => {
    const onSignedIn = vi.fn();
    let status = 401;
    fakeApi({ 'POST /api/auth/login': () => json({ error: 'Invalid email or password.' }, status) });
    render(<LoginScreen onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(hasSession()).toBe(false);

    status = 429;
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/too many attempts/i));
  });

  it('registers a new account (8+ char password enforced by the form)', async () => {
    const onSignedIn = vi.fn();
    const calls = fakeApi({
      'POST /api/auth/register': () => json({ token: 'T2', user: { id: 'u2', email: 'n@b.co', name: 'New' } }, 201),
    });
    render(<LoginScreen onSignedIn={onSignedIn} />);
    await userEvent.click(screen.getByRole('tab', { name: /create account/i }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '8');
    await userEvent.type(screen.getByLabelText('Name'), 'New User');
    await userEvent.type(screen.getByLabelText('Email'), 'n@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'long-enough-pw');
    await userEvent.click(screen.getAllByRole('button', { name: /create account/i }).find(b => b.getAttribute('type') !== 'tab' && b.tagName === 'BUTTON' && b.getAttribute('role') !== 'tab')!);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(calls[0].url).toContain('/auth/register');
  });
});

describe('App auth gate', () => {
  const backend = () => fakeApi({
    'GET /api/auth/me': () => json({ id: 'u', email: 'a@b.co', name: 'Ada Lovelace' }),
    'GET /api/config': () => json({ isPayPalConfigured: true, paypalClientId: 'cid' }),
    'GET /api/invoices': () => json([]),
    'GET /api/transactions': () => json([], 200, { 'X-Total-Count': '0' }),
    'GET /api/insights/overview': () => json({ outstanding: { count: 0, totalMinor: 0 }, overdue: [], dueSoon: [], paidThisMonth: { totalMinor: 0 }, pendingApprovals: 0, pendingReconciliation: 0, recentTransactions: [] }),
  });

  it('shows the sign-in screen when there is no session', () => {
    backend();
    render(<App />);
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('shows the real user name (not a hard-coded one), and signing out returns to sign-in', async () => {
    sessionStorage.setItem('paypilot.token', 'tok');
    backend();
    render(<App />);
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Alex Mercer')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(hasSession()).toBe(false);
  });

  it('a 401 in the middle of a session sends the user back to sign-in', async () => {
    sessionStorage.setItem('paypilot.token', 'expired');
    fakeApi({ 'GET /api/auth/me': () => json({ error: 'x' }, 401), 'GET /api/config': () => json({ isPayPalConfigured: false }), 'GET /api/invoices': () => json({}, 401), 'GET /api/transactions': () => json({}, 401) });
    render(<App />);
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('the header is honest when PayPal is not configured', async () => {
    sessionStorage.setItem('paypilot.token', 'tok');
    fakeApi({
      'GET /api/auth/me': () => json({ id: 'u', email: 'a@b.co', name: 'Ada' }),
      'GET /api/config': () => json({ isPayPalConfigured: false }),
      'GET /api/invoices': () => json([]), 'GET /api/transactions': () => json([]),
      'GET /api/insights/overview': () => json({ outstanding: { count: 0, totalMinor: 0 }, overdue: [], dueSoon: [], paidThisMonth: { totalMinor: 0 }, pendingApprovals: 0, pendingReconciliation: 0, recentTransactions: [] }),
    });
    render(<App />);
    expect(await screen.findByText('Sandbox not configured')).toBeInTheDocument();
  });
});
