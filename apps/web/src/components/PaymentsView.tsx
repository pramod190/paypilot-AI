import React, { useEffect, useState } from 'react';
import { PaymentIntent } from '@paypilot/shared';
import { ShieldCheck, CreditCard, Clock, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { PayPalCheckoutModal } from './PayPalCheckoutModal';

interface PaymentsViewProps {
  onSelectTab: (tab: string) => void;
  onPaymentCompleted: (receipt: any) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({ onSelectTab, onPaymentCompleted }) => {
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIntentForCheckout, setActiveIntentForCheckout] = useState<PaymentIntent | null>(null);

  const fetchIntents = async () => {
    try {
      setLoading(true);
      // Fetch recent audit/intents from API
      const res = await fetch('/api/audit/recent');
      if (res.ok) {
        const events = await res.json();
        // Extract distinct intents from audit
        const intentMap = new Map();
        for (const evt of events) {
          if (evt.intent && !intentMap.has(evt.intent.id)) {
            intentMap.set(evt.intent.id, evt.intent);
          }
        }
        setIntents(Array.from(intentMap.values()));
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
          <h2 className="text-xl font-extrabold text-white tracking-tight">Payment Intents & Checkout</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Inspect active payment intents, authorization versions, and proceed to PayPal Sandbox execution.
          </p>
        </div>

        <button
          onClick={() => onSelectTab('copilot')}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition self-start sm:self-auto"
        >
          <CreditCard className="w-4 h-4" />
          <span>Prepare New Intent via Copilot</span>
        </button>
      </div>

      {/* Intents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-400">Loading payment intents...</div>
        ) : intents.length === 0 ? (
          <div className="col-span-full py-16 text-center text-xs text-slate-500 space-y-2">
            <Clock className="w-8 h-8 mx-auto text-slate-600" />
            <p className="font-semibold text-slate-400">No payment intents found</p>
            <p className="text-slate-500">Ask the AI Copilot to prepare a payment for an invoice to see it here.</p>
          </div>
        ) : (
          intents.map((intent) => {
            const isApproved = intent.status === 'APPROVED';
            const isCompleted = intent.status === 'COMPLETED';

            return (
              <div
                key={intent.id}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-400">ID: {intent.id.slice(0, 8)}...</span>
                    <div className="flex items-center space-x-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        v{intent.version}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isCompleted
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : isApproved
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {intent.status}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-white mt-2">{intent.recipient}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{intent.purpose}</p>
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <div className="flex justify-between items-baseline mb-3">
                    <span className="text-[10px] uppercase text-slate-500 font-semibold">Amount</span>
                    <div>
                      <span className="text-base font-black text-white font-mono">${intent.amount.toFixed(2)}</span>
                      <span className="text-[10px] font-bold text-slate-400 ml-1">{intent.currency}</span>
                    </div>
                  </div>

                  {isCompleted ? (
                    <div className="w-full py-2 bg-emerald-500/10 rounded-xl text-emerald-400 text-xs font-semibold flex items-center justify-center space-x-1.5 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Captured via PayPal</span>
                    </div>
                  ) : isApproved ? (
                    <button
                      onClick={() => setActiveIntentForCheckout(intent)}
                      className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow transition"
                    >
                      <span>Proceed to Checkout</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onSelectTab('copilot')}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition"
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
