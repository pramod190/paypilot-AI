import React, { useEffect, useState } from 'react';
import { searchTransactions } from '../api';
import { Search, Clock } from 'lucide-react';

interface TransactionsViewProps {
  transactions: any[];
  onViewReceipt: (tx: any) => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  onViewReceipt,
}) => {
  const [search, setSearch] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [items, setItems] = useState<any[]>(transactions);
  const [total, setTotal] = useState<number>(transactions.length);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Keep in sync when the parent reloads (e.g. a payment just completed) and no filter is active.
  useEffect(() => {
    if (!search && !minAmount && !maxAmount) {
      setItems(transactions);
      setTotal(transactions.length);
    }
  }, [transactions]);

  // Server-side search (debounced).
  useEffect(() => {
    if (!search && !minAmount && !maxAmount) {
      setSearchError(null);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchTransactions({ q: search, minAmount, maxAmount, limit: 100 });
        setItems(res.items);
        setTotal(res.total);
        setSearchError(null);
      } catch (err: any) {
        setSearchError(err.message || 'Search failed');
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [search, minAmount, maxAmount]);

  const filtered = items;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#0F172A] tracking-tight">Authoritative Transactions</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Payments recorded only after the server verified PayPal's capture response.
          </p>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by recipient, order ID, capture ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search transactions"
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15 shadow-sm transition"
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Min $"
              aria-label="Minimum amount"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="w-24 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15 shadow-sm transition"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Max $"
              aria-label="Maximum amount"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="w-24 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15 shadow-sm transition"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium" role="status" aria-live="polite">
        <span>
          {searching
            ? 'Searching...'
            : `${total} transaction${total === 1 ? '' : 's'}${filtered.length < total ? ` (showing ${filtered.length})` : ''}`}
        </span>
        {searchError && <span className="text-rose-600 font-semibold">{searchError}</span>}
      </div>

      {/* Transactions Table / List */}
      <div className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-md">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400 space-y-2">
            <Clock className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-600">No verified transactions found</p>
            <p className="text-slate-400">Pay an invoice using AI Copilot to see authoritative records here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3.5 px-5">Recipient / Purpose</th>
                  <th className="py-3.5 px-5">Authoritative Capture ID</th>
                  <th className="py-3.5 px-5">PayPal Order ID</th>
                  <th className="py-3.5 px-5">Amount</th>
                  <th className="py-3.5 px-5">Date</th>
                  <th className="py-3.5 px-5 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-4 px-5">
                      <div className="font-bold text-[#0F172A] text-xs">{tx.intent?.recipient || 'Vendor'}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">{tx.intent?.purpose}</div>
                    </td>
                    <td className="py-4 px-5 font-mono text-emerald-700 font-medium text-xs select-all">
                      {tx.captureId}
                    </td>
                    <td className="py-4 px-5 font-mono text-[#4F46E5] font-medium text-xs select-all">
                      {tx.paypalOrderId}
                    </td>
                    <td className="py-4 px-5">
                      <span className="font-black text-[#0F172A] font-mono text-xs">
                        ${tx.amount.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold ml-1">{tx.currency}</span>
                    </td>
                    <td className="py-4 px-5 text-slate-500 text-xs">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <button
                        onClick={() => onViewReceipt(tx)}
                        className="px-3 py-1.5 bg-[#E0E7FF] hover:bg-[#c7d2fe] text-[#4F46E5] border border-indigo-200 rounded-lg text-xs font-semibold transition shadow-sm"
                      >
                        View Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
