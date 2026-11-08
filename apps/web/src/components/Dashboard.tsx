import React from 'react';
import { InsightsPanel } from './InsightsPanel';
import { Invoice } from '@paypilot/shared';
import {
  CreditCard,
  FileText,
  ShieldCheck,
  Sparkles,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Zap,
  ArrowRight,
} from 'lucide-react';

interface DashboardProps {
  invoices: Invoice[];
  transactions: any[];
  onSelectTab: (tab: string, initialPrompt?: string) => void;
  onViewReceipt: (receipt: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  invoices,
  transactions,
  onSelectTab,
  onViewReceipt,
}) => {
  const unpaidInvoices = invoices.filter((i) => i.status === 'UNPAID');
  const totalOutstanding = unpaidInvoices.reduce((acc, i) => acc + i.amount, 0);
  const totalPaid = transactions.reduce((acc, t) => acc + t.amount, 0);

  return (
    <div className="space-y-6">
      <InsightsPanel refreshKey={transactions.length} onOpen={onSelectTab} />

      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-[#F8FAFC] to-[#E0E7FF]/35 border border-slate-200/90 p-6 md:p-8 shadow-soft-md">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#E0E7FF] text-[#4F46E5] text-xs font-semibold border border-indigo-200">
            <Sparkles className="w-3.5 h-3.5 text-[#4F46E5]" />
            <span>Autonomous Payment Copilot</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-[#0F172A] tracking-tight">
            Seamless Invoice-to-Payment Orchestration
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            Turn vendor invoices and payment requests into deterministic, user-approved, verifiable PayPal payments.
            Guaranteed by the backend <strong className="text-[#0F172A] font-semibold">TrustGuard Policy Engine</strong> with cryptographic proof of payment.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <button
              onClick={() => onSelectTab('copilot')}
              className="px-5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs shadow-soft-md hover:shadow-soft-lg flex items-center space-x-2 transition transform active:scale-[0.98]"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>Launch AI Copilot</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
            <button
              onClick={() => onSelectTab('invoices')}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-200 shadow-soft-sm transition"
            >
              Manage Invoices ({invoices.length})
            </button>
          </div>
        </div>
      </div>

      {/* Production Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Captured */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-soft-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Settled Payments</span>
            <div className="w-7 h-7 rounded-lg bg-[#E0E7FF] text-[#4F46E5] flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#0F172A] font-mono">
            ${totalPaid.toFixed(2)}
          </div>
          <p className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>{transactions.length} Authoritative Captures</span>
          </p>
        </div>

        {/* Metric 2: Outstanding Invoices */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-soft-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Payable Balance</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#0F172A] font-mono">
            ${totalOutstanding.toFixed(2)}
          </div>
          <p className="text-[11px] text-amber-700 font-medium mt-1">
            {unpaidInvoices.length} unpaid invoices pending
          </p>
        </div>

        {/* Metric 3: TrustGuard Security Engine */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-soft-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">TrustGuard Engine</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            Enforced
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            10 Deterministic Security Policies
          </p>
        </div>

        {/* Metric 4: PayPal Orders v2 Gateway */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-soft-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Gateway Status</span>
            <div className="w-7 h-7 rounded-lg bg-[#E0E7FF] text-[#4F46E5] flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#4F46E5] font-mono">
            Connected
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            PayPal Orders v2 REST API
          </p>
        </div>
      </div>

      {/* Two Column Layout: Unpaid Invoices & Recent Authoritative Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unpaid Invoices */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-soft-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-[#4F46E5]" />
              <h3 className="text-sm font-bold text-[#0F172A]">Pending Invoices</h3>
            </div>
            <button
              onClick={() => onSelectTab('invoices')}
              className="text-xs text-[#4F46E5] hover:text-[#4338CA] font-semibold flex items-center space-x-1"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {unpaidInvoices.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">All invoices are settled.</p>
            ) : (
              unpaidInvoices.slice(0, 4).map((inv) => (
                <div
                  key={inv.id}
                  className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/70 flex items-center justify-between hover:bg-slate-100/70 hover:border-slate-300/80 transition"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-[#0F172A]">{inv.vendor}</span>
                      <span className="text-[10px] font-mono text-slate-500 font-medium">#{inv.invoiceNumber}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[200px]">
                      {inv.description}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <span className="text-sm font-black text-[#0F172A] font-mono">
                        ${inv.amount.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-amber-700 block font-semibold">Due {inv.dueDate}</span>
                    </div>
                    <button
                      onClick={() => onSelectTab('copilot', `Pay invoice #${inv.invoiceNumber} for ${inv.vendor}`)}
                      className="px-2.5 py-1.5 bg-[#E0E7FF] hover:bg-indigo-200 text-[#4F46E5] border border-indigo-200 rounded-lg text-xs font-semibold transition"
                    >
                      Pay
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Authoritative Transactions */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-soft-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-[#0F172A]">Recent PayPal Captures</h3>
            </div>
            <button
              onClick={() => onSelectTab('transactions')}
              className="text-xs text-[#4F46E5] hover:text-[#4338CA] font-semibold flex items-center space-x-1"
            >
              <span>View History</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {transactions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                <Clock className="w-6 h-6 mx-auto text-slate-300 mb-1" />
                <p>No verified PayPal payments recorded yet.</p>
                <p className="text-[11px] text-slate-400">
                  Payments completed via AI Copilot will display authoritative receipts here.
                </p>
              </div>
            ) : (
              transactions.slice(0, 4).map((tx) => (
                <div
                  key={tx.id}
                  className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/70 flex items-center justify-between hover:bg-slate-100/70 hover:border-slate-300/80 transition"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-[#0F172A]">{tx.intent?.recipient || 'Vendor'}</span>
                      <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-semibold">
                        {tx.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Cap ID: {tx.captureId.slice(0, 16)}...
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-black text-[#0F172A] font-mono">
                      ${tx.amount.toFixed(2)}
                    </span>
                    <button
                      onClick={() => onViewReceipt(tx)}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 shadow-soft-sm transition"
                    >
                      Receipt
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
