import React from 'react';
import {
  CreditCard,
  FileText,
  Sparkles,
  History,
  ShieldCheck,
  Settings,
  Layers,
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  isPayPalConfigured: boolean;
  onOpenSettings: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  isPayPalConfigured,
  onOpenSettings,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: CreditCard },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'copilot', label: 'AI Copilot', icon: Sparkles },
    { id: 'payments', label: 'Payments', icon: Layers },
    { id: 'transactions', label: 'Transactions', icon: History },
    { id: 'audit', label: 'TrustGuard Audit', icon: ShieldCheck },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentTab('dashboard')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 p-[2px] shadow-lg shadow-blue-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
                  P
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg text-white tracking-tight">PayPilot</span>
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  AI
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">PayPal AI Hackathon 2026</p>
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
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Status Badges & Settings */}
          <div className="flex items-center space-x-2.5">
            <div className="flex items-center space-x-2 px-2.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-semibold">PayPal Sandbox</span>
            </div>

            <button
              onClick={onOpenSettings}
              title="System Settings & Diagnostics"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            >
              <Settings className="w-4 h-4" />
            </button>

            <div className="hidden sm:flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/80 text-xs text-slate-300">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center text-[9px]">
                AM
              </div>
              <span className="font-semibold text-slate-200 text-xs">Alex Mercer</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="lg:hidden flex overflow-x-auto px-4 py-2 border-t border-slate-800/60 bg-slate-900/50 space-x-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap font-medium ${
                isActive ? 'bg-blue-600 text-white' : 'text-slate-400 bg-slate-800/40'
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
