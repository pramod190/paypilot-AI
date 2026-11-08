import React, { useEffect, useState } from 'react';
import { Wallet, AlertTriangle, CalendarClock, BadgeCheck, Hourglass, Loader2 } from 'lucide-react';
import { fetchInsightsOverview } from '../api';

const usd = (minor: number) => (minor / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Live, server-computed numbers (integer cents) from the user's own invoices and verified PayPal captures. */
export const InsightsPanel: React.FC<{ refreshKey?: number; onOpen?: (tab: string, prompt?: string) => void }> = ({ refreshKey, onOpen }) => {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    fetchInsightsOverview().then((d) => live && setData(d)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [refreshKey]);

  if (error) return null;
  if (!data) {
    return (
      <div className="flex items-center justify-center py-6 text-xs text-slate-400" role="status">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading insights...
      </div>
    );
  }

  const cards = [
    { icon: Wallet, label: 'Outstanding', value: usd(data.outstanding.totalMinor), sub: `${data.outstanding.count} unpaid invoice${data.outstanding.count === 1 ? '' : 's'}`, tone: 'text-[#4F46E5]' },
    { icon: AlertTriangle, label: 'Overdue', value: String(data.overdue.length), sub: data.overdue.length ? data.overdue.map((i: any) => i.vendor).slice(0, 2).join(', ') : 'Nothing overdue', tone: data.overdue.length ? 'text-rose-700' : 'text-slate-700' },
    { icon: CalendarClock, label: 'Due in 7 days', value: String(data.dueSoon.length), sub: data.dueSoon.length ? data.dueSoon.map((i: any) => `${i.vendor} (${i.dueDate})`).slice(0, 2).join(', ') : 'Nothing due soon', tone: 'text-amber-700' },
    { icon: BadgeCheck, label: 'Paid this month', value: usd(data.paidThisMonth.totalMinor), sub: 'Verified PayPal captures', tone: 'text-emerald-700' },
  ];

  return (
    <section aria-label="Payment insights" className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-soft-sm hover:shadow-soft-md transition-shadow">
            <div className="flex items-center space-x-2 text-[11px] uppercase tracking-wide font-semibold text-slate-500">
              <c.icon className="w-3.5 h-3.5 text-slate-400" /> <span>{c.label}</span>
            </div>
            <div className={`mt-1.5 text-xl font-black font-mono ${c.tone}`}>{c.value}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={c.sub}>{c.sub}</div>
          </div>
        ))}
      </div>

      {(data.pendingApprovals > 0 || data.pendingReconciliation > 0) && (
        <div className="flex flex-wrap gap-2">
          {data.pendingApprovals > 0 && (
            <button onClick={() => onOpen?.('payments')} className="flex items-center space-x-2 text-xs px-3 py-1.5 rounded-full bg-[#E0E7FF] border border-indigo-200 text-[#3730A3] hover:bg-indigo-200 transition shadow-soft-sm font-semibold">
              <Hourglass className="w-3.5 h-3.5 text-[#4F46E5]" /> <span>{data.pendingApprovals} payment{data.pendingApprovals === 1 ? '' : 's'} awaiting you</span>
            </button>
          )}
          {data.pendingReconciliation > 0 && (
            <button onClick={() => onOpen?.('payments')} className="flex items-center space-x-2 text-xs px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 transition shadow-soft-sm font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> <span>{data.pendingReconciliation} payment{data.pendingReconciliation === 1 ? '' : 's'} need a status check</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
};
