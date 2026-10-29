import React, { useState, useEffect, useRef } from 'react';
import { Invoice, PaymentIntent, TrustGuardEvaluation, AIChatMessage } from '@paypilot/shared';
import { sendChatMessage } from '../api';
import {
  Sparkles,
  Send,
  Loader2,
  Lock,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  FileText,
  X,
  CreditCard,
  CheckCircle2,
} from 'lucide-react';
import { PaymentIntentCard } from './PaymentIntentCard';
import { PayPalCheckoutModal } from './PayPalCheckoutModal';

interface AICopilotProps {
  initialPrompt?: string;
  selectedInvoice?: Invoice | null;
  onClearSelectedInvoice?: () => void;
  onPaymentCompleted: (receipt: any) => void;
}

export const AICopilot: React.FC<AICopilotProps> = ({
  initialPrompt,
  selectedInvoice,
  onClearSelectedInvoice,
  onPaymentCompleted,
}) => {
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      role: 'assistant',
      content: `Hello Alex! I'm **PayPilot AI**, your intelligent PayPal copilot.\n\nI can parse your invoices, run **TrustGuard security & duplicate checks**, and prepare user-approved payments directly in the **PayPal Sandbox**.\n\nTry asking me to *"Prepare my hosting payment for this month"* or select one of the suggested prompts below.`,
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeIntentForCheckout, setActiveIntentForCheckout] = useState<PaymentIntent | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Handle initial prompt from parent
  useEffect(() => {
    if (initialPrompt) {
      handleSend(initialPrompt);
    }
  }, [initialPrompt]);

  const handleSend = async (messageText?: string) => {
    const textToSend = (messageText || input).trim();
    if (!textToSend || loading) return;

    setInput('');
    const userMessage: AIChatMessage = { role: 'user', content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await sendChatMessage(textToSend, selectedInvoice?.id || null);
      setMessages((prev) => [...prev, response]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ Error processing request: ${err.message || 'Network error'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleIntentUpdated = (updatedIntent: PaymentIntent, evaluation?: TrustGuardEvaluation) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.paymentIntent && msg.paymentIntent.id === updatedIntent.id) {
          return {
            ...msg,
            paymentIntent: updatedIntent,
            trustGuardResult: evaluation || msg.trustGuardResult,
          };
        }
        return msg;
      })
    );
  };

  const quickPrompts = [
    'Prepare my hosting payment for this month',
    'Show my spending insights',
    'Pay invoice #INV-2026-0012',
    'Pay $50 to Alice for design services',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-4xl mx-auto bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
      {/* Copilot Header */}
      <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-white tracking-tight">PayPilot AI Agent</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Active Grounding
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Grounded in database invoices & TrustGuard policy engine</p>
          </div>
        </div>

        {selectedInvoice && (
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300">
            <FileText className="w-3.5 h-3.5" />
            <span>
              Invoice: <strong>#{selectedInvoice.invoiceNumber}</strong> (${selectedInvoice.amount})
            </span>
            <button
              onClick={onClearSelectedInvoice}
              className="p-0.5 hover:text-white rounded transition ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          return (
            <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-2xl rounded-2xl p-4 text-xs md:text-sm leading-relaxed ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-600/10'
                    : 'bg-slate-950/80 text-slate-200 border border-slate-800 rounded-tl-none space-y-3'
                }`}
              >
                {/* Message text */}
                <div className="whitespace-pre-line prose-invert">
                  {msg.content}
                </div>

                {/* Tool calls rendered cleanly */}
                {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5">
                    {msg.toolCalls.map((tc, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400"
                      >
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>tool: {tc.name}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Missing fields or clarification prompt */}
                {!isUser && msg.missingFields && msg.missingFields.length > 0 && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-center space-x-2">
                    <HelpCircle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Missing details: {msg.missingFields.join(', ')}</span>
                  </div>
                )}

                {/* Payment Intent Card embedded inline */}
                {!isUser && msg.paymentIntent && (
                  <PaymentIntentCard
                    intent={msg.paymentIntent}
                    trustGuardResult={msg.trustGuardResult}
                    onUpdated={handleIntentUpdated}
                    onProceedToCheckout={(intent) => setActiveIntentForCheckout(intent)}
                  />
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl rounded-tl-none p-4 flex items-center space-x-3 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              <span>PayPilot AI is analyzing invoices and evaluating TrustGuard policies...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Chips */}
      <div className="px-6 py-2 bg-slate-950/40 border-t border-slate-800/60 flex items-center space-x-2 overflow-x-auto no-scrollbar">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
          Suggested:
        </span>
        {quickPrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(prompt)}
            className="px-3 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white text-xs whitespace-nowrap border border-slate-700/60 transition"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Message Input Box */}
      <div className="p-4 bg-slate-950 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            placeholder={
              selectedInvoice
                ? `Ask to pay invoice #${selectedInvoice.invoiceNumber} for ${selectedInvoice.vendor}...`
                : "Ask PayPilot to pay an invoice or check spending (e.g. 'Pay my hosting invoice')..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="flex-1 bg-slate-900 border border-slate-700/80 rounded-2xl px-4 py-3 text-xs md:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-2xl shadow transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* PayPal Checkout Modal */}
      {activeIntentForCheckout && (
        <PayPalCheckoutModal
          intent={activeIntentForCheckout}
          onClose={() => setActiveIntentForCheckout(null)}
          onSuccess={(receipt) => {
            setActiveIntentForCheckout(null);
            onPaymentCompleted(receipt);
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `🎉 **Payment Verified!**\nAuthoritative capture completed for **$${receipt.amount.toFixed(2)} ${receipt.currency}** to **${receipt.recipient}**.\n\n• **Capture ID:** \`${receipt.captureId}\`\n• **PayPal Order ID:** \`${receipt.paypalOrderId}\`\n\nThe invoice has been updated to **PAID** and the receipt has been added to your records.`,
              },
            ]);
          }}
        />
      )}
    </div>
  );
};
