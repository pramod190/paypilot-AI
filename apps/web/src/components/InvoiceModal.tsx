import React, { useState } from 'react';
import { X, FilePlus, AlertCircle, Loader2 } from 'lucide-react';
import { createInvoice, extractInvoice } from '../api';
import { InvoiceStatus, SupportedCurrencies } from '@paypilot/shared';

interface InvoiceModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ onClose, onCreated }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    vendor: '',
    amount: '',
    currency: 'USD',
    billingPeriod: 'November 2026',
    dueDate: '2026-11-30',
    description: '',
  });

  const [pasteText, setPasteText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState<any | null>(null);

  const handleExtract = async () => {
    setExtracting(true);
    setError(null);
    setExtraction(null);
    try {
      const result = await extractInvoice(pasteText);
      const d = result.draft;
      setFormData((prev) => ({
        ...prev,
        invoiceNumber: d.invoiceNumber ?? prev.invoiceNumber,
        vendor: d.vendor ?? prev.vendor,
        amount: d.amount !== null ? String(d.amount) : prev.amount,
        currency: d.currency ?? prev.currency,
        billingPeriod: d.billingPeriod ?? prev.billingPeriod,
        dueDate: d.dueDate ?? prev.dueDate,
        description: d.description ?? prev.description,
      }));
      setExtraction(result);
    } catch (err: any) {
      setError(err.message || 'Could not read that text');
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      const parsedAmount = parseFloat(formData.amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Please enter a valid positive amount.');
      }

      await createInvoice({
        invoiceNumber: formData.invoiceNumber.trim(),
        vendor: formData.vendor.trim(),
        amount: parsedAmount,
        currency: formData.currency,
        billingPeriod: formData.billingPeriod.trim(),
        dueDate: formData.dueDate.trim(),
        description: formData.description.trim() || `Invoice for ${formData.vendor}`,
        status: InvoiceStatus.UNPAID,
      });

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle =
    'w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-xs text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-[#4F46E5] focus:bg-white focus:ring-2 focus:ring-[#4F46E5]/15 transition';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="bg-white border border-slate-200/90 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-[#F8FAFC] px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#E0E7FF] border border-indigo-200 flex items-center justify-center text-[#4F46E5]">
              <FilePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">Create New Invoice</h3>
              <p className="text-[11px] text-slate-500 font-mono">PayPilot Smart Invoice Guard</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="px-6 pt-5">
          <label htmlFor="paste" className="block text-xs font-semibold text-slate-700 mb-1">
            Paste invoice text to autofill (optional)
          </label>
          <textarea
            id="paste"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={3}
            maxLength={8000}
            placeholder={'Acme Hosting Ltd\nInvoice No: ACME-2026-0042\nTotal due: $149.50\nDue date: 2026-11-20'}
            className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-xs text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-[#4F46E5] focus:bg-white focus:ring-2 focus:ring-[#4F46E5]/15 font-mono"
          />
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[11px] text-slate-500">Nothing is saved until you review and submit the form.</p>
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting || pasteText.trim().length < 10}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#E0E7FF] border border-indigo-200 text-[#4F46E5] hover:bg-[#c7d2fe] disabled:opacity-50 transition shadow-sm"
            >
              {extracting ? 'Reading...' : 'Autofill'}
            </button>
          </div>
          {extraction && (
            <div className="mt-2 space-y-1.5 text-[11px]" role="status">
              <p className="text-slate-600 font-medium">
                Read via {extraction.source === 'llm' ? 'AI' : 'rule-based parser'}.
                {extraction.missing.length ? ` Please fill in: ${extraction.missing.join(', ')}.` : ' Please verify every field below.'}
              </p>
              {extraction.warnings.map((w: string, i: number) => (
                <p key={i} className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 font-medium">
                  {w}
                </p>
              ))}
              {extraction.duplicates.map((d: any, i: number) => (
                <p key={i} className="text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 font-medium">
                  Possible duplicate: #{d.invoiceNumber} from {d.vendor} (${d.amount}, {d.status}). {d.reason}.
                </p>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Invoice Number</label>
              <input
                type="text"
                required
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                className={`${inputStyle} font-mono`}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Vendor / Recipient</label>
              <input
                type="text"
                required
                placeholder="e.g. GitHub Enterprise"
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                className={inputStyle}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="24.99"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className={`${inputStyle} font-mono`}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Currency</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className={inputStyle}
              >
                {SupportedCurrencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Billing Period</label>
              <input
                type="text"
                required
                value={formData.billingPeriod}
                onChange={(e) => setFormData({ ...formData, billingPeriod: e.target.value })}
                className={inputStyle}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Due Date</label>
              <input
                type="date"
                required
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Description</label>
            <textarea
              rows={2}
              required
              placeholder="e.g. Monthly cloud hosting compute & storage"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={inputStyle}
            />
          </div>

          <div className="pt-2 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg flex items-center space-x-2 transition transform active:scale-[0.98]"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? 'Creating...' : 'Save Invoice'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
