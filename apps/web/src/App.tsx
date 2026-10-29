import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { InvoiceManager } from './components/InvoiceManager';
import { AICopilot } from './components/AICopilot';
import { TransactionsView } from './components/TransactionsView';
import { AuditTrailView } from './components/AuditTrailView';
import { ReceiptModal } from './components/ReceiptModal';
import { fetchInvoices, fetchTransactions, fetchConfig, fetchReceipt } from './api';
import { Invoice } from '@paypilot/shared';

export function App() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);
  const [config, setConfig] = useState<any>({ isPayPalConfigured: false });

  const loadData = async () => {
    try {
      const [invs, txs, cfg] = await Promise.all([
        fetchInvoices(),
        fetchTransactions(),
        fetchConfig(),
      ]);
      setInvoices(invs);
      setTransactions(txs);
      setConfig(cfg);
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLaunchCopilotWithInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setInitialPrompt(`Prepare payment for invoice #${invoice.invoiceNumber} from ${invoice.vendor}`);
    setCurrentTab('copilot');
  };

  const handleLaunchWithPrompt = (tab: string, prompt?: string) => {
    if (prompt) {
      setInitialPrompt(prompt);
    }
    setCurrentTab(tab);
  };

  const handleOpenReceipt = async (tx: any) => {
    try {
      const receipt = await fetchReceipt(tx.id);
      setActiveReceipt(receipt);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          setInitialPrompt(undefined);
          setCurrentTab(tab);
        }}
        isPayPalConfigured={config.isPayPalConfigured}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'dashboard' && (
          <Dashboard
            invoices={invoices}
            transactions={transactions}
            onSelectTab={handleLaunchWithPrompt}
            onViewReceipt={handleOpenReceipt}
          />
        )}

        {currentTab === 'invoices' && (
          <InvoiceManager
            invoices={invoices}
            onRefresh={loadData}
            onPayWithCopilot={handleLaunchCopilotWithInvoice}
          />
        )}

        {currentTab === 'copilot' && (
          <AICopilot
            initialPrompt={initialPrompt}
            selectedInvoice={selectedInvoice}
            onClearSelectedInvoice={() => setSelectedInvoice(null)}
            onPaymentCompleted={(receipt) => {
              setActiveReceipt(receipt);
              loadData();
            }}
          />
        )}

        {currentTab === 'transactions' && (
          <TransactionsView
            transactions={transactions}
            onViewReceipt={handleOpenReceipt}
          />
        )}

        {currentTab === 'audit' && <AuditTrailView />}
      </main>

      {/* Authoritative Receipt Modal */}
      {activeReceipt && (
        <ReceiptModal
          receipt={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 px-4 text-center text-xs text-slate-500">
        <p>
          PayPilot AI — PayPal AI Hackathon 2026 Submission. Built with PayPal Orders v2 REST API & TrustGuard Policy Engine.
        </p>
      </footer>
    </div>
  );
}

export default App;
