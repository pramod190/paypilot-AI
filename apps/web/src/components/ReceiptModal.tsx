import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  CheckCircle,
  X,
  ShieldCheck,
  Printer,
} from 'lucide-react';

interface ReceiptModalProps {
  receipt: any;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  useEffect(() => {
    // Launch celebratory confetti
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="bg-white border border-slate-200/90 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Receipt Header */}
        <div className="bg-gradient-to-r from-emerald-50 via-[#E0E7FF]/20 to-transparent p-6 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-sm">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-extrabold text-[#0F172A]">Payment Verified</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  AUTHORITATIVE
                </span>
              </div>
              <p className="text-xs text-slate-500">Authoritative PayPal Sandbox Capture</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Receipt Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Main Amount Callout */}
          <div className="text-center py-4 bg-[#F8FAFC] rounded-2xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 block mb-1">Total Paid via PayPal</span>
            <div className="flex items-baseline justify-center space-x-1">
              <span className="text-3xl font-black text-[#0F172A] font-mono">
                ${receipt.amount.toFixed(2)}
              </span>
              <span className="text-sm font-bold text-slate-500">{receipt.currency}</span>
            </div>
            <p className="text-xs text-emerald-700 font-semibold mt-1">Status: {receipt.verifiedStatus}</p>
          </div>

          {/* Authoritative Transaction Evidence */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Authoritative Payment References
            </h4>
            <div className="bg-[#F8FAFC] rounded-xl p-4 border border-slate-200 space-y-2.5 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Capture ID:</span>
                <span className="text-emerald-700 font-bold select-all">{receipt.captureId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">PayPal Order ID:</span>
                <span className="text-[#4F46E5] font-bold select-all">{receipt.paypalOrderId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Receipt ID:</span>
                <span className="text-slate-800 font-semibold select-all">{receipt.receiptId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Timestamp:</span>
                <span className="text-slate-800">{new Date(receipt.timestamp).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Invoice & Vendor Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Vendor & Invoice Details
            </h4>
            <div className="bg-[#F8FAFC] rounded-xl p-4 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Recipient / Vendor:</span>
                <span className="text-[#0F172A] font-semibold">{receipt.recipient}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Purpose / Description:</span>
                <span className="text-slate-800">{receipt.purpose}</span>
              </div>
              {receipt.invoice && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice Number:</span>
                    <span className="text-[#0F172A] font-mono font-medium">#{receipt.invoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Billing Period:</span>
                    <span className="text-slate-800">{receipt.invoice.billingPeriod}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Cryptographic / Audit Trail Summary */}
          {receipt.auditTrail && receipt.auditTrail.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#4F46E5]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  TrustGuard Verification Trail
                </h4>
              </div>
              <div className="bg-[#F8FAFC] rounded-xl p-3 border border-slate-200 space-y-1.5 text-[11px] font-mono">
                {receipt.auditTrail.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-slate-600">
                    <span className="text-slate-800">• {item.event}</span>
                    <span className="text-slate-400">
                      {new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-[#F8FAFC] p-4 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={handlePrint}
            className="flex items-center space-x-2 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 shadow-sm transition"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Print Receipt</span>
          </button>

          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition transform active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
