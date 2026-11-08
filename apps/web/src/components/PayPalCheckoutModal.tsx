import React, { useEffect, useRef, useState } from 'react';
import { PaymentIntent } from '@paypilot/shared';
import { createPayPalOrder, capturePayPalPayment, cancelPayPalCheckout, fetchConfig } from '../api';
import { X, CreditCard, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';

interface PayPalCheckoutModalProps {
  intent: PaymentIntent;
  onClose: () => void;
  onSuccess: (receipt: any) => void;
}

declare global {
  interface Window {
    paypal?: any;
  }
}

/** Load the PayPal JS SDK once per (clientId, currency). */
function loadPayPalSdk(clientId: string, currency: string): Promise<any> {
  const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&disable-funding=credit,card`;
  return new Promise((resolve, reject) => {
    if (window.paypal && document.querySelector(`script[src="${src}"]`)) return resolve(window.paypal);
    document.querySelectorAll('script[data-paypilot-sdk]').forEach(n => n.remove());
    const script = document.createElement('script');
    script.src = src;
    script.dataset.paypilotSdk = '1';
    script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error('PayPal SDK failed to initialise')));
    script.onerror = () => reject(new Error('Could not load the PayPal SDK'));
    document.head.appendChild(script);
  });
}

export const PayPalCheckoutModal: React.FC<PayPalCheckoutModalProps> = ({ intent, onClose, onSuccess }) => {
  const buttonsRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading PayPal Sandbox checkout...');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let buttons: any;

    (async () => {
      try {
        const cfg = await fetchConfig();
        if (!cfg.isPayPalConfigured || !cfg.paypalClientId) {
          throw new Error('PayPal Sandbox is not configured on the server (set PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).');
        }
        const paypal = await loadPayPalSdk(cfg.paypalClientId, intent.currency);
        if (cancelled || !buttonsRef.current) return;

        buttons = paypal.Buttons({
          // The SERVER creates the order from the approved intent; the browser never supplies an amount.
          createOrder: async () => {
            setError(null);
            const order = await createPayPalOrder(intent.id);
            setOrderId(order.orderId);
            return order.orderId;
          },
          // After buyer approval, the SERVER captures and verifies. We never trust this callback as proof of payment.
          onApprove: async (data: { orderID: string }) => {
            try {
              setBusy(true);
              setStatus('Capturing and verifying with PayPal on the server...');
              const res = await capturePayPalPayment(intent.id, data.orderID);
              onSuccess(res.receipt);
            } catch (err: any) {
              setError(err.message || 'Capture failed');
              setBusy(false);
            }
          },
          onCancel: async () => {
            await cancelPayPalCheckout(intent.id);
            setError('Checkout was cancelled. Your approved intent is preserved; you can try again.');
          },
          onError: (err: any) => setError(err?.message || 'PayPal reported an error'),
        });
        await buttons.render(buttonsRef.current);
        if (!cancelled) {
          setBusy(false);
          setStatus('Choose PayPal to pay with your Sandbox buyer account.');
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to start checkout');
          setBusy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try { buttons?.close?.(); } catch { /* ignore */ }
    };
  }, [intent.id, intent.currency]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="bg-white border border-slate-200/90 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className="bg-[#F8FAFC] px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#E0E7FF] border border-indigo-200 flex items-center justify-center text-[#4F46E5]">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">PayPal Sandbox Checkout</h3>
              <p className="text-[11px] text-amber-700 font-mono font-medium">SANDBOX — no real money moves</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close checkout" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-[#F8FAFC] rounded-2xl p-4 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block">Total Payment</span>
              <span className="text-2xl font-black text-[#0F172A] font-mono">{intent.amount.toFixed(2)}</span>
              <span className="text-xs font-bold text-slate-500 ml-1.5">{intent.currency}</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block">Recipient</span>
              <span className="text-xs font-bold text-slate-800">{intent.recipient}</span>
              <span className="text-[10px] text-slate-500 block truncate max-w-[150px]">{intent.purpose}</span>
            </div>
          </div>

          {orderId && (
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs flex justify-between">
              <span className="text-slate-600">PayPal Order ID:</span>
              <span className="font-mono text-[#4F46E5] font-semibold">{orderId}</span>
            </div>
          )}

          {busy && (
            <div className="py-4 flex flex-col items-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#4F46E5] animate-spin" />
              <p className="text-xs font-medium text-slate-600 text-center">{status}</p>
            </div>
          )}

          <div ref={buttonsRef} className={busy ? 'hidden' : ''} />
          {!busy && !error && <p className="text-[11px] text-center text-slate-500">{status}</p>}

          <div className="flex items-center space-x-2 text-[11px] text-slate-500 justify-center pt-1 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Payment is only recorded after the server verifies PayPal's capture response.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
