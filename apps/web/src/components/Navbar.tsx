import React from 'react';
import {
  CreditCard,
  FileText,
  Sparkles,
  History,
  ShieldCheck,
  Settings,
  Layers,
  LogOut,
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  isPayPalConfigured: boolean;
  onOpenSettings: () => void;
  userName?: string;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  isPayPalConfigured,
  onOpenSettings,
  userName,
  onLogout,
}) => {
  const initials = (userName || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: CreditCard },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'copilot', label: 'AI Copilot', icon: Sparkles },
    { id: 'payments', label: 'Payments', icon: Layers },
    { id: 'transactions', label: 'Transactions', icon: History },
    { id: 'audit', label: 'TrustGuard Audit', icon: ShieldCheck },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-soft-sm shrink-0">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => setCurrentTab('dashboard')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#4F46E5] via-indigo-600 to-indigo-400 p-[2px] shadow-soft-md group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center">
                <span className="text-xl font-black text-[#4F46E5]">
                  P
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg text-[#0F172A] tracking-tight">PayPilot</span>
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-[#E0E7FF] text-[#4F46E5] border border-indigo-200">
                  AI
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium">Automated Payment Operations</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#E0E7FF] text-[#4F46E5] border border-indigo-200/90 shadow-soft-sm'
                      : 'text-slate-600 hover:text-[#0F172A] hover:bg-slate-100/70'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#4F46E5]' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Status Badges & Settings */}
          <div className="flex items-center space-x-2.5">
            <div
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
                isPayPalConfigured
                  ? 'bg-emerald-50 border-emerald-200/90 text-emerald-800'
                  : 'bg-amber-50 border-amber-200/90 text-amber-800'
              }`}
              title={
                isPayPalConfigured
                  ? 'Connected to the PayPal Sandbox. Test money only.'
                  : 'PayPal Sandbox credentials are not set on the server; checkout is unavailable.'
              }
            >
              <span className={`w-2 h-2 rounded-full ${isPayPalConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              <span className="text-[11px] font-semibold">{isPayPalConfigured ? 'PayPal Sandbox' : 'Sandbox not configured'}</span>
            </div>

            <button
              onClick={onOpenSettings}
              title="System Settings & Diagnostics"
              className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 hover:text-[#0F172A] border border-slate-200 shadow-soft-sm transition"
            >
              <Settings className="w-4 h-4" />
            </button>

            {onLogout && (
              <button
                onClick={onLogout}
                title="Sign out"
                aria-label="Sign out"
                className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 hover:text-[#0F172A] border border-slate-200 shadow-soft-sm transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}

            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-soft-sm text-xs text-slate-700">
              <div className="w-5 h-5 rounded-full bg-[#E0E7FF] border border-indigo-200 text-[#4F46E5] font-bold flex items-center justify-center text-[9px]">
                {initials}
              </div>
              <span className="font-semibold text-[#0F172A] text-xs">{userName || 'Account'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="lg:hidden flex overflow-x-auto px-4 py-2 border-t border-slate-200 bg-white/95 space-x-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-medium transition ${
                isActive ? 'bg-[#4F46E5] text-white shadow-soft-sm' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
