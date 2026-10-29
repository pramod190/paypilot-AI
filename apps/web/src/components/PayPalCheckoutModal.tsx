import React, { useState } from 'react';
import { PaymentIntent } from '@paypilot/shared';
import { createPayPalOrder, capturePayPalPayment } from '../api';
import {
  X,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Zap,
} from 'lucide-react';

interface PayPalCheckoutModalProps {
  intent: PaymentIntent;
  onClose: () => void;
  onSuccess: (receipt: any) => void;
}

export const PayPalCheckoutModal: React.FC<PayPalCheckoutModalProps> = ({
  intent,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('Creating PayPal Sandbox Order...');
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [approveUrl, setApproveUrl] = useState<string | null>(null);

  // Initialize order on mount
  React.useEffect(() => {
    let mounted = true;
    async function initOrder() {
      try {
        setLoading(true);
        setStatusMessage('Creating PayPal Orders v2 in Sandbox...');
        const order = await createPayPalOrder(intent.id);
        if (mounted) {
          setOrderId(order.orderId);
          setApproveUrl(order.approveUrl || null);
          setStatusMessage('Order created. Complete payment via PayPal Sandbox.');
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Failed to create PayPal order');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    initOrder();
    return () => {
      mounted = false;
    };
  }, [intent.id]);

  const handleCapture = async (activeOrderId: string, forceInstant: boolean = false) => {
    try {
      setLoading(true);
      setStatusMessage('Authoritatively capturing order server-side via PayPal REST API...');
      setError(null);
      const res = await capturePayPalPayment(intent.id, activeOrderId, forceInstant);
      setStatusMessage('Payment verified! Generating authoritative receipt...');
      setTimeout(() => {
        onSuccess(res.receipt);
      }, 600);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('ORDER_NOT_APPROVED')) {
        setError('Order not yet approved on PayPal. Please click "1. Open PayPal Window to Approve" first, or use "Option B: 1-Click Instant Sandbox Capture" below.');
      } else {
        setError(msg || 'Authoritative capture failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">PayPal Sandbox Checkout</h3>
              <p className="text-[11px] text-emerald-400 font-mono">REST API Orders v2</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Amount Overview */}
          <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">
                Total Payment
              </span>
              <span className="text-2xl font-black text-white font-mono">
                ${intent.amount.toFixed(2)}
              </span>
              <span className="text-xs font-bold text-slate-400 ml-1.5">{intent.currency}</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">
                Recipient
              </span>
              <span className="text-xs font-bold text-slate-200">{intent.recipient}</span>
              <span className="text-[10px] text-slate-500 block truncate max-w-[150px]">{intent.purpose}</span>
            </div>
          </div>

          {/* Order Status */}
          {orderId && (
            <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/60 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">PayPal Order ID:</span>
                <span className="font-mono text-blue-400 font-semibold">{orderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Environment:</span>
                <span className="text-emerald-400 font-medium">Sandbox (Live Orders v2)</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3 pt-1">
            {loading ? (
              <div className="py-6 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-xs font-medium text-slate-300 animate-pulse text-center">
                  {statusMessage}
                </p>
              </div>
            ) : (
              <>
                {/* Option A: Real PayPal Sandbox Popup */}
                {approveUrl && (
                  <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 block">
                      Option A: Real PayPal Sandbox Popup
                    </span>
                    <a
                      href={approveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center justify-center space-x-2 transition"
                    >
                      <span>1. Open PayPal Window to Approve (${intent.amount.toFixed(2)})</span>
                      <ExternalLink className="w-3.5 h-3.5 text-blue-200" />
                    </a>
                    {orderId && (
                      <button
                        onClick={() => handleCapture(orderId, false)}
                        className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center justify-center space-x-2 transition"
                      >
                        <span>2. Capture Approved Order from PayPal</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Option B: 1-Click Instant Capture (Bypass popup) */}
                {orderId && (
                  <div className="space-y-1.5 pt-1">
                    <button
                      onClick={() => handleCapture(orderId, true)}
                      className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 transition transform active:scale-[0.98]"
                    >
                      <Zap className="w-4 h-4 text-slate-950 fill-slate-950" />
                      <span>Option B: 1-Click Instant Sandbox Capture (No Login Needed)</span>
                    </button>
                    <p className="text-[10px] text-center text-slate-500">
                      Use Option B for fast 1-click testing & demo video recording.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Security Guarantee */}
          <div className="flex items-center space-x-2 text-[11px] text-slate-500 justify-center pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Authoritative capture executed server-side. Zero simulated IDs.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
