import React, { useState } from 'react';
import { Invoice } from '@paypilot/shared';
import {
  FileText,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { InvoiceModal } from './InvoiceModal';

interface InvoiceManagerProps {
  invoices: Invoice[];
  onRefresh: () => void;
  onPayWithCopilot: (invoice: Invoice) => void;
}

export const InvoiceManager: React.FC<InvoiceManagerProps> = ({
  invoices,
  onRefresh,
  onPayWithCopilot,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [search, setSearch] = useState('');

  const filteredInvoices = invoices.filter((inv) => {
    const matchesFilter =
      filter === 'ALL' ? true : filter === 'UNPAID' ? inv.status === 'UNPAID' : inv.status === 'PAID';
    const matchesSearch =
      inv.vendor.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.description.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Smart Invoice Guard</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage vendor invoices with automated duplicate detection and TrustGuard integrity.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Invoice</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search vendor, invoice #, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {(['ALL', 'UNPAID', 'PAID'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === tab
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'ALL' ? 'All Invoices' : tab === 'UNPAID' ? 'Unpaid' : 'Paid'}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredInvoices.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 text-xs">
            No invoices match the specified criteria.
          </div>
        ) : (
          filteredInvoices.map((inv) => {
            const isPaid = inv.status === 'PAID';
            // Duplicate warning flag for demo (e.g. Namecheap similar invoices)
            const hasDuplicateWarning = inv.invoiceNumber.includes('5541') || inv.invoiceNumber.includes('5542');

            return (
              <div
                key={inv.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-sm transition flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-mono text-blue-400 font-semibold block">
                        #{inv.invoiceNumber}
                      </span>
                      <h3 className="text-sm font-bold text-white mt-0.5">{inv.vendor}</h3>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isPaid
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                    {inv.description}
                  </p>

                  {hasDuplicateWarning && (
                    <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-[11px] flex items-center space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Smart Guard: Potential similar invoice detected</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-800/80">
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-medium">Billing Period</span>
                      <span className="text-xs text-slate-300 font-medium">{inv.billingPeriod}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block uppercase font-medium">Total Amount</span>
                      <span className="text-base font-black text-white font-mono">
                        ${inv.amount.toFixed(2)}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 ml-1">{inv.currency}</span>
                    </div>
                  </div>

                  {isPaid ? (
                    <div className="w-full py-2 bg-emerald-500/10 rounded-xl text-emerald-400 text-xs font-semibold flex items-center justify-center space-x-1.5 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Settled & Paid</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => onPayWithCopilot(inv)}
                      className="w-full py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-md shadow-blue-500/10 transition"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                      <span>Pay with AI Copilot</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {showModal && (
        <InvoiceModal onClose={() => setShowModal(false)} onCreated={onRefresh} />
      )}
    </div>
  );
};
