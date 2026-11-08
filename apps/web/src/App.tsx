import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { InvoiceManager } from './components/InvoiceManager';
import { AICopilot } from './components/AICopilot';
import { PaymentsView } from './components/PaymentsView';
import { TransactionsView } from './components/TransactionsView';
import { AuditTrailView } from './components/AuditTrailView';
import { ReceiptModal } from './components/ReceiptModal';
import { SettingsModal } from './components/SettingsModal';
import { LoginScreen } from './components/LoginScreen';
import { fetchInvoices, fetchTransactions, fetchConfig, fetchReceipt, fetchMe, hasSession, logout, AUTH_EVENT, SessionUser } from './api';
import { Invoice } from '@paypilot/shared';

export function App() {
  const [authed, setAuthed] = useState<boolean>(hasSession());
  const [user, setUser] = useState<SessionUser | null>(null);

  // Any 401 from the API (expired/forged token) returns the user to the sign-in screen.
  useEffect(() => {
    const onUnauthorized = () => { setAuthed(false); setUser(null); };
    window.addEventListener(AUTH_EVENT, onUnauthorized);
    return () => window.removeEventListener(AUTH_EVENT, onUnauthorized);
  }, []);

  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
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
    if (!authed) return;
    fetchMe().then(setUser).catch(() => undefined);
    loadData();
  }, [authed]);

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

  if (!authed) {
    return <LoginScreen onSignedIn={() => setAuthed(true)} />;
  }

  return (
    <div className="h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col font-['Plus_Jakarta_Sans',sans-serif] overflow-hidden">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          setInitialPrompt(undefined);
          setCurrentTab(tab);
        }}
        isPayPalConfigured={config.isPayPalConfigured}
        onOpenSettings={() => setShowSettings(true)}
        userName={user?.name}
        onLogout={logout}
      />

      <main
        className={`flex-1 w-full px-4 sm:px-6 lg:px-8 min-h-0 ${
          currentTab === 'copilot'
            ? 'overflow-hidden flex flex-col py-2.5 sm:py-3.5'
            : 'overflow-y-auto py-5'
        }`}
      >
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
            onPromptConsumed={() => setInitialPrompt(undefined)}
            selectedInvoice={selectedInvoice}
            onClearSelectedInvoice={() => setSelectedInvoice(null)}
            onPaymentCompleted={(receipt) => {
              setActiveReceipt(receipt);
              loadData();
            }}
          />
        )}

        {currentTab === 'payments' && (
          <PaymentsView
            onSelectTab={setCurrentTab}
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

        {currentTab !== 'copilot' && (
          <footer className="mt-12 border-t border-slate-200/80 py-6 px-4 text-center text-xs text-slate-500">
            <p>
              PayPilot AI — Automated Invoice & Payment Copilot powered by PayPal Orders v2 REST API & TrustGuard Policy Engine.
            </p>
          </footer>
        )}
      </main>

      {/* Authoritative Receipt Modal */}
      {activeReceipt && (
        <ReceiptModal
          receipt={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

export default App;
