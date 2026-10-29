import React, { useState } from 'react';
import {
  History,
  Search,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  FileText,
  Clock,
} from 'lucide-react';

interface TransactionsViewProps {
  transactions: any[];
  onViewReceipt: (tx: any) => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  onViewReceipt,
}) => {
  const [search, setSearch] = useState('');

  const filtered = transactions.filter((t) => {
    const q = search.toLowerCase();
    const recipient = t.intent?.recipient?.toLowerCase() || '';
    const captureId = t.captureId?.toLowerCase() || '';
    const orderId = t.paypalOrderId?.toLowerCase() || '';
    const purpose = t.intent?.purpose?.toLowerCase() || '';
    return recipient.includes(q) || captureId.includes(q) || orderId.includes(q) || purpose.includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Authoritative Transactions</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Authoritatively captured PayPal payments with cryptographic audit records.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by recipient, order ID, capture ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Transactions Table / List */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500 space-y-2">
            <Clock className="w-8 h-8 mx-auto text-slate-600" />
            <p className="font-semibold text-slate-400">No verified transactions found</p>
            <p className="text-slate-500">Pay an invoice using AI Copilot to see authoritative records here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3.5 px-5">Recipient / Purpose</th>
                  <th className="py-3.5 px-5">Authoritative Capture ID</th>
                  <th className="py-3.5 px-5">PayPal Order ID</th>
                  <th className="py-3.5 px-5">Amount</th>
                  <th className="py-3.5 px-5">Date</th>
                  <th className="py-3.5 px-5 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-4 px-5">
                      <div className="font-bold text-white text-xs">{tx.intent?.recipient || 'Vendor'}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs">{tx.intent?.purpose}</div>
                    </td>
                    <td className="py-4 px-5 font-mono text-emerald-400 text-xs select-all">
                      {tx.captureId}
                    </td>
                    <td className="py-4 px-5 font-mono text-blue-400 text-xs select-all">
                      {tx.paypalOrderId}
                    </td>
                    <td className="py-4 px-5">
                      <span className="font-black text-white font-mono text-xs">
                        ${tx.amount.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold ml-1">{tx.currency}</span>
                    </td>
                    <td className="py-4 px-5 text-slate-400 text-xs">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <button
                        onClick={() => onViewReceipt(tx)}
                        className="px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-semibold transition"
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

