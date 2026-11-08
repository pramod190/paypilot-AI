import React, { useState } from 'react';
import { PaymentIntent, TrustGuardEvaluation, PaymentState } from '@paypilot/shared';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Edit2,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { approvePaymentIntent, rejectPaymentIntent, updatePaymentIntent } from '../api';

interface PaymentIntentCardProps {
  intent: PaymentIntent;
  trustGuardResult?: TrustGuardEvaluation | null;
  onUpdated: (intent: PaymentIntent, evaluation?: TrustGuardEvaluation) => void;
  onProceedToCheckout: (intent: PaymentIntent) => void;
}

export const PaymentIntentCard: React.FC<PaymentIntentCardProps> = ({
  intent,
  trustGuardResult,
  onUpdated,
  onProceedToCheckout,
}) => {
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(intent.amount.toString());
  const [error, setError] = useState<string | null>(null);

  const isApproved = intent.status === PaymentState.APPROVED || intent.status === PaymentState.CHECKOUT_PENDING;
  const isCompleted = intent.status === PaymentState.COMPLETED;
  const isExpired = intent.status === PaymentState.EXPIRED;
  const isRejected = intent.status === PaymentState.REJECTED;

  const handleApprove = async () => {
    try {
      setLoading(true);
      setError(null);
      const updated = await approvePaymentIntent(intent.id, intent.version);
      onUpdated(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to approve intent');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      setLoading(true);
      setError(null);
      const updated = await rejectPaymentIntent(intent.id, 'User rejected from card');
      onUpdated(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to reject intent');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      setLoading(true);
      setError(null);
      const parsedAmount = parseFloat(editAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Please enter a valid positive amount');
      }

      // Updating amount increments version and revokes prior approval
      const updated = await updatePaymentIntent(intent.id, { amount: parsedAmount });
      setIsEditing(false);
      onUpdated(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to update intent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-full sm:max-w-xl bg-white border border-slate-200/90 rounded-2xl shadow-soft-md overflow-hidden my-3 transition-all">
      {/* Card Header */}
      <div className="bg-[#F8FAFC] px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#E0E7FF] border border-indigo-200 flex items-center justify-center text-[#4F46E5]">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#0F172A] tracking-tight">Payment Intent</h4>
            <p className="text-[11px] text-slate-500 font-mono">ID: {intent.id.slice(0, 13)}...</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Version badge */}
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#E0E7FF] text-[#4F46E5] border border-indigo-200">
            v{intent.version}
          </span>
          {/* Status badge */}
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              isCompleted
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : isApproved
                ? 'bg-[#E0E7FF] text-[#4F46E5] border border-indigo-200'
                : isRejected
                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                : isExpired
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {intent.status}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-5 space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Amount & Recipient */}
        <div className="flex items-baseline justify-between bg-slate-50/80 p-4 rounded-xl border border-slate-200">
          <div>
            <span className="text-xs font-semibold text-slate-500 block mb-0.5">Amount to Authorize</span>
            {isEditing ? (
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-lg font-bold text-slate-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-28 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm font-mono text-[#0F172A] focus:outline-none focus:border-[#4F46E5]"
                />
                <button
                  onClick={handleSaveEdit}
                  disabled={loading}
                  className="px-2.5 py-1 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-xs font-semibold shadow-soft-sm"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-black text-[#0F172A] font-mono">
                  ${intent.amount.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-slate-500">{intent.currency}</span>
                {!isCompleted && !isApproved && (
                  <button
                    onClick={() => {
                      setEditAmount(intent.amount.toString());
                      setIsEditing(true);
                    }}
                    title="Edit amount to test approval invalidation"
                    className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-[#4F46E5] transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-slate-500 block mb-0.5">Recipient</span>
            <span className="text-sm font-bold text-[#0F172A]">{intent.recipient}</span>
            <span className="text-[11px] text-slate-500 block truncate max-w-[200px]">{intent.purpose}</span>
          </div>
        </div>

        {/* Expiration Note */}
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>
            Expires:{' '}
            <strong className="text-slate-700">
              {new Date(intent.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </strong>
          </span>
        </div>

        {/* TrustGuard Evaluation Panel */}
        {trustGuardResult && (
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                  TrustGuard Policy Evaluation
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  trustGuardResult.allowed
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {trustGuardResult.allowed ? 'ALL RULES PASSED' : 'VIOLATION DETECTED'}
              </span>
            </div>

            <p className="text-xs text-slate-700 p-3 bg-white rounded-lg border border-slate-200 shadow-soft-sm leading-relaxed">
              {trustGuardResult.explanation}
            </p>

            {/* Checklist of rules */}
            <div className="space-y-1.5 pt-1">
              {trustGuardResult.checks.map((check, idx) => (
                <div key={idx} className="flex items-start space-x-2 text-xs">
                  {check.passed && check.severity === 'warning' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                  ) : check.passed ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
                  )}
                  <span className={check.passed ? (check.severity === 'warning' ? 'text-amber-800 font-medium' : 'text-slate-600') : 'text-rose-800 font-medium'}>
                    <strong className="text-slate-800">{check.ruleName.replace(/_/g, ' ')}:</strong>{' '}
                    {check.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Card Actions */}
        <div className="pt-2">
          {isCompleted ? (
            <div className="w-full py-2.5 px-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center justify-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Paid & Authoritatively Verified via PayPal Sandbox</span>
            </div>
          ) : isRejected ? (
            <div className="w-full py-3 px-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center justify-center space-x-2">
              <XCircle className="w-4 h-4 text-rose-600" />
              <span>Payment Intent Cancelled & Rejected by User</span>
            </div>
          ) : isApproved ? (
            <div className="space-y-2">
              <button
                onClick={() => onProceedToCheckout(intent)}
                className="w-full py-3 px-4 bg-gradient-to-r from-[#4F46E5] to-indigo-600 hover:from-[#4338CA] hover:to-indigo-700 text-white font-bold text-sm rounded-xl shadow-soft-md hover:shadow-soft-lg flex items-center justify-center space-x-2 transition transform active:scale-[0.99]"
              >
                <span>Proceed to PayPal Sandbox Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[11px] text-center text-slate-500">
                Intent approved for v{intent.version}. PayPal Orders v2 integration will execute on click.
              </p>
            </div>
          ) : isExpired ? (
            <div className="text-xs text-amber-800 text-center py-2 bg-amber-50 rounded-lg border border-amber-200">
              Payment Intent has expired. Please request a new payment intent.
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <button
                onClick={handleApprove}
                disabled={loading || Boolean(trustGuardResult && !trustGuardResult.allowed)}
                className="flex-1 py-2.5 px-4 bg-[#4F46E5] hover:bg-[#4338CA] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-xl shadow-soft-md hover:shadow-soft-lg transition flex items-center justify-center space-x-2 transform active:scale-[0.99]"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{loading ? 'Approving...' : `Explicitly Approve (v${intent.version})`}</span>
              </button>

              <button
                onClick={handleReject}
                disabled={loading}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-400 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition"
              >
                {loading ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
