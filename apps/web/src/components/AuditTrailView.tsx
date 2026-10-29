import React, { useEffect, useState } from 'react';
import { fetchAuditEvents } from '../api';
import { ShieldCheck, Clock, Terminal, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';

export const AuditTrailView: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function loadEvents() {
      try {
        setLoading(true);
        const data = await fetchAuditEvents();
        setEvents(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-extrabold text-white tracking-tight">TrustGuard Audit Trail</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              IMMUTABLE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Cryptographic log of all payment proposals, policy evaluations, user approvals, and PayPal captures.
          </p>
        </div>
      </div>

      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-xl p-5">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading audit records...</div>
        ) : events.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">No audit events recorded yet.</div>
        ) : (
          <div className="space-y-3">
            {events.map((evt) => {
              const isExpanded = expandedId === evt.id;
              const isPass = evt.eventType.includes('PASSED') || evt.eventType.includes('SUCCESS');
              const isBlock = evt.eventType.includes('BLOCKED') || evt.eventType.includes('FAILED');

              return (
                <div
                  key={evt.id}
                  className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 hover:border-slate-700 transition"
                >
                  <div
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => toggleExpand(evt.id)}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs ${
                          isPass
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : isBlock
                            ? 'bg-rose-500/10 text-rose-400'
                            : 'bg-blue-500/10 text-blue-400'
                        }`}
                      >
                        {isPass ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : isBlock ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <Terminal className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-mono font-bold text-white block">
                          {evt.eventType}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          ID: {evt.id} | Intent: {evt.intentId ? evt.intentId.slice(0, 8) + '...' : 'N/A'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span className="text-[11px] text-slate-400">
                        {new Date(evt.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-800">
                      <div className="text-[11px] font-mono text-slate-300 bg-slate-900 p-3 rounded-xl overflow-x-auto">
                        <pre>{JSON.stringify(evt.safeDetails, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
