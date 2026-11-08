import React, { useState, useEffect, useRef } from 'react';
import { Invoice, PaymentIntent, TrustGuardEvaluation, AIChatMessage } from '@paypilot/shared';
import { sendChatMessage } from '../api';
import {
  Sparkles,
  Send,
  Loader2,
  ShieldCheck,
  HelpCircle,
  FileText,
  X,
} from 'lucide-react';
import { PaymentIntentCard } from './PaymentIntentCard';
import { PayPalCheckoutModal } from './PayPalCheckoutModal';

interface AICopilotProps {
  initialPrompt?: string;
  selectedInvoice?: Invoice | null;
  onClearSelectedInvoice?: () => void;
  onPaymentCompleted: (receipt: any) => void;
  onPromptConsumed?: () => void;
}

/** Formats simple markdown bold, code, and italic tokens into styled React elements. */
function renderMessageContent(content: string) {
  const lines = content.split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
    return (
      <React.Fragment key={lineIdx}>
        {parts.map((part, partIdx) => {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return (
              <strong key={partIdx} className="font-bold text-[#0F172A]">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
            return (
              <code
                key={partIdx}
                className="font-mono text-[11px] bg-slate-100 border border-slate-200 px-1 py-0.5 rounded text-[#4F46E5] font-semibold"
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            return (
              <em key={partIdx} className="italic text-slate-700">
                {part.slice(1, -1)}
              </em>
            );
          }
          return part;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export const AICopilot: React.FC<AICopilotProps> = ({
  initialPrompt,
  selectedInvoice,
  onClearSelectedInvoice,
  onPaymentCompleted,
  onPromptConsumed,
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
  const isSubmittingRef = useRef<boolean>(false);
  const handledInitialPromptRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Handle initial prompt from parent strictly once
  useEffect(() => {
    if (initialPrompt && handledInitialPromptRef.current !== initialPrompt) {
      handledInitialPromptRef.current = initialPrompt;
      handleSend(initialPrompt);
      onPromptConsumed?.();
    }
  }, [initialPrompt]);

  const handleSend = async (messageText?: string) => {
    if (isSubmittingRef.current) return;
    const textToSend = (messageText || input).trim();
    if (!textToSend) return;

    isSubmittingRef.current = true;
    setLoading(true);
    setInput('');
    const userMessage: AIChatMessage = { role: 'user', content: textToSend };
    setMessages((prev) => [...prev, userMessage]);

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
      isSubmittingRef.current = false;
    }
  };

  const handleIntentUpdated = (updatedIntent: PaymentIntent, evaluation?: TrustGuardEvaluation) => {
    setMessages((prev) => {
      const updatedList = prev.map((msg) => {
        if (msg.paymentIntent && msg.paymentIntent.id === updatedIntent.id) {
          return {
            ...msg,
            paymentIntent: updatedIntent,
            trustGuardResult: evaluation || msg.trustGuardResult,
          };
        }
        return msg;
      });

      if (updatedIntent.status === 'REJECTED') {
        return [
          ...updatedList,
          {
            role: 'assistant',
            content: `❌ Payment intent for **${updatedIntent.recipient}** ($${updatedIntent.amount.toFixed(2)} ${updatedIntent.currency}) has been **rejected and cancelled**. No funds were moved or authorized. You can select another invoice or prepare a new payment anytime.`,
          },
        ];
      }

      return updatedList;
    });
  };

  const quickPrompts = [
    'Prepare my hosting payment for this month',
    'Show my spending insights',
    'Pay invoice #INV-2026-0012',
    'Pay $50 to Alice for design services',
  ];

  return (
    <div className="flex flex-col h-full w-full bg-white border border-slate-200/90 rounded-2xl md:rounded-3xl shadow-soft-lg overflow-hidden min-h-0">
      {/* Copilot Header */}
      <div className="bg-[#F8FAFC] px-4 sm:px-6 py-3 sm:py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-gradient-to-tr from-[#4F46E5] to-indigo-500 flex items-center justify-center text-white shadow-soft-md shrink-0">
            <Sparkles className="w-4 sm:w-5 h-4 sm:w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xs sm:text-sm font-bold text-[#0F172A] tracking-tight">PayPilot AI Agent</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E0E7FF] text-[#4F46E5] border border-indigo-200">
                Active Grounding
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500 hidden sm:block">Grounded in database invoices & TrustGuard policy engine</p>
          </div>
        </div>

        {selectedInvoice && (
          <div className="flex items-center space-x-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-[#E0E7FF] border border-indigo-200 text-xs text-[#4F46E5]">
            <FileText className="w-3.5 h-3.5" />
            <span className="truncate max-w-[140px] sm:max-w-none">
              Invoice: <strong>#{selectedInvoice.invoiceNumber}</strong> (${selectedInvoice.amount})
            </span>
            <button
              onClick={onClearSelectedInvoice}
              className="p-0.5 hover:text-[#0F172A] rounded transition ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Messages Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#F8FAFC]/50">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          return (
            <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-3xl lg:max-w-4xl xl:max-w-5xl w-auto rounded-2xl p-4 sm:p-5 text-xs md:text-sm leading-relaxed ${
                  isUser
                    ? 'bg-[#4F46E5] text-white rounded-tr-none shadow-soft-md ml-8'
                    : 'bg-white text-[#0F172A] border border-slate-200/90 rounded-tl-none shadow-soft-sm space-y-3 mr-8'
                }`}
              >
                {/* Message text with rendered markdown */}
                <div className="leading-relaxed">
                  {renderMessageContent(msg.content)}
                </div>

                {/* Tool calls rendered cleanly */}
                {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                    {msg.toolCalls.map((tc, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-600"
                      >
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        <span>tool: {tc.name}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Missing fields or clarification prompt */}
                {!isUser && msg.missingFields && msg.missingFields.length > 0 && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center space-x-2">
                    <HelpCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>Missing details: {msg.missingFields.join(', ')}</span>
                  </div>
                )}

                {/* Payment Intent Card embedded inline */}
                {!isUser && msg.paymentIntent && (
                  <div className="pt-1">
                    <PaymentIntentCard
                      intent={msg.paymentIntent}
                      trustGuardResult={msg.trustGuardResult}
                      onUpdated={handleIntentUpdated}
                      onProceedToCheckout={(intent) => setActiveIntentForCheckout(intent)}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200/90 rounded-2xl rounded-tl-none p-4 flex items-center space-x-3 text-xs text-slate-600 shadow-soft-sm">
              <Loader2 className="w-4 h-4 text-[#4F46E5] animate-spin" />
              <span>PayPilot AI is analyzing invoices and evaluating TrustGuard policies...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Chips */}
      <div className="px-4 sm:px-6 py-2 bg-[#F8FAFC] border-t border-slate-200 flex items-center space-x-2 overflow-x-auto shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
          Suggested:
        </span>
        <div className="flex items-center space-x-2">
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              disabled={loading}
              onClick={() => handleSend(prompt)}
              className="px-3 py-1 rounded-full bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 hover:text-[#0F172A] text-xs whitespace-nowrap border border-slate-200 shadow-soft-sm transition"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Message Input Box */}
      <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0">
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
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-xs md:text-sm text-[#0F172A] placeholder-slate-400 focus:outline-none focus:border-[#4F46E5] focus:bg-white focus:ring-2 focus:ring-[#4F46E5]/15 transition"
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2.5 sm:p-3 bg-[#4F46E5] hover:bg-[#4338CA] disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl sm:rounded-2xl shadow-soft-md hover:shadow-soft-lg transition transform active:scale-[0.98] shrink-0"
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
