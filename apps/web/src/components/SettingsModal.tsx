import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { X, Settings, ShieldCheck, CreditCard, Sparkles } from 'lucide-react';
import { fetchConfig } from '../api';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchConfig();
        setConfig(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="bg-white border border-slate-200/90 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#F8FAFC] px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#E0E7FF] border border-indigo-200 flex items-center justify-center text-[#4F46E5]">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">System Settings & Status</h3>
              <p className="text-[11px] text-slate-500 font-mono">PayPilot System Diagnostics</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {loading ? (
            <p className="text-slate-400 py-6 text-center">Loading settings...</p>
          ) : (
            <>
              {/* PayPal Sandbox Diagnostics */}
              <div className="bg-[#F8FAFC] rounded-2xl p-4 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="w-4 h-4 text-[#4F46E5]" />
                    <span className="font-bold text-[#0F172A] text-xs">PayPal Sandbox Integration</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    ORDERS v2 ACTIVE
                  </span>
                </div>
                <div className="font-mono text-slate-500 space-y-1 pt-1">
                  <div className="flex justify-between">
                    <span>Environment:</span>
                    <span className="text-slate-800 font-medium">{config?.paypalEnvironment || 'sandbox'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Client ID:</span>
                    <span className="text-slate-800 font-medium truncate max-w-[200px]">
                      {config?.paypalClientId ? `${config.paypalClientId.slice(0, 12)}...` : 'Default Test Mode'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Server Capture:</span>
                    <span className="text-emerald-700 font-semibold">Enabled (OAuth 2.0 REST)</span>
                  </div>
                </div>
              </div>

              {/* AI Agent Configuration */}
              <div className="bg-[#F8FAFC] rounded-2xl p-4 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-[#4F46E5]" />
                    <span className="font-bold text-[#0F172A] text-xs">AI Agent Configuration</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E0E7FF] text-[#4F46E5] border border-indigo-200">
                    GROUNDED
                  </span>
                </div>
                <div className="font-mono text-slate-500 space-y-1 pt-1">
                  <div className="flex justify-between">
                    <span>Active Provider:</span>
                    <span className="text-slate-800 font-medium">
                      {config?.aiProvider === 'gemini' ? 'Google Gemini 2.5 Flash' : config?.aiProvider === 'openai' ? 'OpenAI GPT-4o' : 'Deterministic Tool-Calling Engine'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Scoped Tools:</span>
                    <span className="text-slate-800 font-medium">7 Narrowly Scoped Tools</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Context Window:</span>
                    <span className="text-slate-800 font-medium">Dynamic Invoice Grounding</span>
                  </div>
                </div>
              </div>

              {/* TrustGuard Security Rules */}
              <div className="bg-[#F8FAFC] rounded-2xl p-4 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-[#0F172A] text-xs">TrustGuard Policy Rules</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    10 ENFORCED
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Deterministic backend evaluation: Zero LLM authority for financial or security decisions.
                  Version binding guarantees that tampering with approved amounts immediately invalidates authorization.
                </p>
              </div>

              {/* Reset Data for Testing */}
              <div className="bg-[#F8FAFC] rounded-2xl p-4 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-[#0F172A] text-xs block">Reset Invoices</span>
                  <span className="text-slate-500 text-[11px]">Reset all invoices back to UNPAID for re-testing.</span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch('/api/invoices/reset', { method: 'POST' });
                    alert('Invoices have been reset to UNPAID! You can now test paying AWS Cloud Services again.');
                    window.location.reload();
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  Reset to Unpaid
                </button>
              </div>
            </>
          )}

          <div className="pt-2 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold rounded-xl shadow-md hover:shadow-lg transition transform active:scale-[0.98]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
