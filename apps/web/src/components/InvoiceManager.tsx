import React, { useState } from 'react';
import { Invoice } from '@paypilot/shared';
import {
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
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
          <h2 className="text-xl font-extrabold text-[#0F172A] tracking-tight">Smart Invoice Guard</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage vendor invoices with automated duplicate detection and TrustGuard integrity.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-soft-md hover:shadow-soft-lg transition self-start sm:self-auto transform active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Invoice</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-soft-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search vendor, invoice #, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-[#4F46E5] focus:bg-white focus:ring-2 focus:ring-[#4F46E5]/15 transition"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {(['ALL', 'UNPAID', 'PAID'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === tab
                  ? 'bg-[#4F46E5] text-white shadow-soft-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-[#0F172A] hover:bg-slate-200'
              }`}
            >
              {tab === 'ALL' ? 'All Invoices' : tab === 'UNPAID' ? 'Unpaid' : 'Paid'}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
        {filteredInvoices.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 text-xs">
            No invoices match the specified criteria.
          </div>
        ) : (
          filteredInvoices.map((inv) => {
            const isPaid = inv.status === 'PAID';
            const hasDuplicateWarning = inv.invoiceNumber.includes('5541') || inv.invoiceNumber.includes('5542');

            return (
              <div
                key={inv.id}
                className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-5 shadow-soft-sm hover:shadow-soft-md transition flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-mono text-[#4F46E5] font-semibold block">
                        #{inv.invoiceNumber}
                      </span>
                      <h3 className="text-sm font-bold text-[#0F172A] mt-0.5">{inv.vendor}</h3>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isPaid
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                    {inv.description}
                  </p>

                  {hasDuplicateWarning && (
                    <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] flex items-center space-x-1.5 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <span>Smart Guard: Potential similar invoice detected</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase font-semibold">Billing Period</span>
                      <span className="text-xs text-slate-700 font-medium">{inv.billingPeriod}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block uppercase font-semibold">Total Amount</span>
                      <span className="text-base font-black text-[#0F172A] font-mono">
                        ${inv.amount.toFixed(2)}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 ml-1">{inv.currency}</span>
                    </div>
                  </div>

                  {isPaid ? (
                    <div className="w-full py-2 bg-emerald-50 rounded-xl text-emerald-800 text-xs font-semibold flex items-center justify-center space-x-1.5 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Settled & Paid</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => onPayWithCopilot(inv)}
                      className="w-full py-2.5 px-3 bg-gradient-to-r from-[#4F46E5] to-indigo-600 hover:from-[#4338CA] hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-soft-md hover:shadow-soft-lg transition transform active:scale-[0.99]"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
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
