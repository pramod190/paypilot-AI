import React, { useEffect, useState } from 'react';
import { apiFetch, reconcilePayment } from '../api';
import { PaymentIntent } from '@paypilot/shared';
import { CreditCard, Clock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { PayPalCheckoutModal } from './PayPalCheckoutModal';

interface PaymentsViewProps {
  onSelectTab: (tab: string) => void;
  onPaymentCompleted: (receipt: any) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({ onSelectTab, onPaymentCompleted }) => {
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIntentForCheckout, setActiveIntentForCheckout] = useState<PaymentIntent | null>(null);

  const [reconciling, setReconciling] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleReconcile = async (intent: any) => {
    setReconciling(intent.id);
    setNotice(null);
    try {
      const res = await reconcilePayment(intent.id);
      if (res.outcome === 'CAPTURED' && res.receipt) {
        onPaymentCompleted(res.receipt);
      } else {
        setNotice('PayPal reports this payment was not captured, so it is safe to retry checkout.');
      }
      await fetchIntents();
    } catch (err: any) {
      setNotice(err.message || 'Could not reconcile this payment. Try again shortly.');
    } finally {
      setReconciling(null);
    }
  };

  const fetchIntents = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/intents?limit=100');
      if (res.ok) {
        setIntents(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntents();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#0F172A] tracking-tight">Payment Intents & Checkout</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Inspect active payment intents, authorization versions, and proceed to PayPal Sandbox execution.
          </p>
        </div>

        <button
          onClick={() => onSelectTab('copilot')}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition self-start sm:self-auto transform active:scale-[0.98]"
        >
          <CreditCard className="w-4 h-4" />
          <span>Prepare New Intent via Copilot</span>
        </button>
      </div>

      {notice && (
        <div role="status" className="p-3.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 shadow-sm">
          {notice}
        </div>
      )}

      {/* Intents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-400">Loading payment intents...</div>
        ) : intents.length === 0 ? (
          <div className="col-span-full py-16 text-center text-xs text-slate-400 space-y-2">
            <Clock className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-600">No payment intents found</p>
            <p className="text-slate-400">Ask the AI Copilot to prepare a payment for an invoice to see it here.</p>
          </div>
        ) : (
          intents.map((intent) => {
            const isApproved = intent.status === 'APPROVED' || intent.status === 'CHECKOUT_PENDING';
            const needsReconcile = intent.status === 'PENDING_RECONCILIATION';
            const isCompleted = intent.status === 'COMPLETED';

            return (
              <div
                key={intent.id}
                className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-5 shadow-sm hover:shadow-md space-y-4 flex flex-col justify-between transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-400">ID: {intent.id.slice(0, 8)}...</span>
                    <div className="flex items-center space-x-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E0E7FF] text-[#4F46E5] border border-indigo-200">
                        v{intent.version}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isCompleted
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : isApproved
                            ? 'bg-[#E0E7FF] text-[#4F46E5] border border-indigo-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {intent.status}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-[#0F172A] mt-2">{intent.recipient}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{intent.purpose}</p>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <div className="flex justify-between items-baseline mb-3">
                    <span className="text-[10px] uppercase text-slate-400 font-semibold">Amount</span>
                    <div>
                      <span className="text-base font-black text-[#0F172A] font-mono">${intent.amount.toFixed(2)}</span>
                      <span className="text-[10px] font-bold text-slate-400 ml-1">{intent.currency}</span>
                    </div>
                  </div>

                  {isCompleted ? (
                    <div className="w-full py-2 bg-emerald-50 rounded-xl text-emerald-800 text-xs font-semibold flex items-center justify-center space-x-1.5 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Captured via PayPal</span>
                    </div>
                  ) : needsReconcile ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-800 leading-snug">
                        The outcome of this payment is unknown (network timeout). Do not retry yet: check PayPal's record first.
                      </p>
                      <button
                        onClick={() => handleReconcile(intent)}
                        disabled={reconciling === intent.id}
                        className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 disabled:opacity-60 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition shadow-sm"
                      >
                        {reconciling === intent.id ? 'Checking with PayPal...' : 'Check payment status'}
                      </button>
                    </div>
                  ) : isApproved ? (
                    <button
                      onClick={() => setActiveIntentForCheckout(intent)}
                      className="w-full py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-md hover:shadow-lg transition transform active:scale-[0.99]"
                    >
                      <span>{intent.status === 'CHECKOUT_PENDING' ? 'Resume Checkout' : 'Proceed to Checkout'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onSelectTab('copilot')}
                      className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-medium border border-slate-200 transition"
                    >
                      Review in AI Copilot
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {activeIntentForCheckout && (
        <PayPalCheckoutModal
          intent={activeIntentForCheckout}
          onClose={() => setActiveIntentForCheckout(null)}
          onSuccess={(receipt) => {
            setActiveIntentForCheckout(null);
            onPaymentCompleted(receipt);
            fetchIntents();
          }}
        />
      )}
    </div>
  );
};
