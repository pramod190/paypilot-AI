import React, { useState } from 'react';
import { LogIn, UserPlus, Loader2, AlertCircle } from 'lucide-react';
import { login, register } from '../api';

interface LoginScreenProps {
  onSignedIn: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSignedIn }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onSignedIn();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => (mode === 'login' ? login(email, password) : register(email, name, password)));
  };

  const inputStyle =
    'w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-[#4F46E5] focus:bg-white focus:ring-2 focus:ring-[#4F46E5]/15 transition';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex items-center justify-center p-4 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-[#4F46E5] to-indigo-400 p-[2px] shadow-lg">
            <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center">
              <span className="text-2xl font-black text-[#4F46E5]">P</span>
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-[#0F172A] tracking-tight">PayPilot AI</h1>
          <p className="text-sm text-slate-500 mt-1">An AI payment copilot with user-approved, verifiable PayPal payments</p>
          <span className="inline-block mt-3 text-[11px] font-mono px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
            SANDBOX: test money only
          </span>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-3xl p-7 shadow-xl">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-5" role="tablist">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => { setMode(m); setError(null); }}
                className={`py-2 text-xs font-bold rounded-lg transition ${
                  mode === m
                    ? 'bg-white text-[#0F172A] shadow-sm'
                    : 'text-slate-500 hover:text-[#0F172A]'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          {error && (
            <div role="alert" className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label htmlFor="name" className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                <input id="name" className={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input id="email" type="email" className={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input id="password" type="password" className={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              {mode === 'register' && <p className="text-[11px] text-slate-500 mt-1">At least 8 characters.</p>}
            </div>
            <button disabled={busy} className="w-full flex items-center justify-center space-x-2 bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-60 text-white font-bold text-sm py-2.5 rounded-xl shadow-md hover:shadow-lg transition transform active:scale-[0.99]">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              <span>{mode === 'login' ? 'Sign in' : 'Create account'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
