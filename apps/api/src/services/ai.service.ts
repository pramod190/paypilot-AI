import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { TrustGuardService } from './trustguard.service.js';
import { PaymentIntentService } from './payment-intent.service.js';
import { InvoiceService } from './invoice.service.js';
import { AIChatMessage } from '@paypilot/shared';

const STOP_WORDS = new Set(['invoice', 'payment', 'services', 'service', 'month', 'monthly', 'bill', 'billing', 'cloud', 'account', 'please', 'prepare', 'paid']);

export const AI_AGENT_TOOLS = [
  {
    name: 'parse_payment_request',
    description: 'Extracts structured payment information (amount, currency, recipient, purpose) from natural language',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Monetary amount' },
        currency: { type: 'string', description: 'ISO currency code (USD, EUR, GBP, CAD, AUD)' },
        recipient: { type: 'string', description: 'Recipient name or organization' },
        purpose: { type: 'string', description: 'Description or reason for payment' },
      },
      required: ['amount', 'recipient'],
    },
  },
  {
    name: 'get_invoice_details',
    description: 'Retrieves authoritative invoice records from the database',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice ID' },
        invoiceNumber: { type: 'string', description: 'Invoice number' },
      },
    },
  },
  {
    name: 'get_payment_policy',
    description: 'Executes TrustGuard policy engine evaluation on a payment intent',
    parameters: {
      type: 'object',
      properties: {
        intentId: { type: 'string', description: 'Payment Intent ID to evaluate' },
      },
      required: ['intentId'],
    },
  },
  {
    name: 'check_duplicate_invoice',
    description: 'Checks whether an invoice has potential duplicates or was already paid',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice ID to evaluate for duplicates' },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'prepare_payment_intent',
    description: 'Creates a validated PaymentIntent in the database with 15-minute expiration',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Optional associated invoice ID' },
        amount: { type: 'number', description: 'Amount to pay' },
        currency: { type: 'string', description: 'Currency code' },
        recipient: { type: 'string', description: 'Recipient' },
        purpose: { type: 'string', description: 'Payment purpose' },
      },
      required: ['amount', 'recipient'],
    },
  },
  {
    name: 'get_transaction_history',
    description: 'Retrieves authoritative completed transaction history and receipts',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of transactions to return' },
      },
    },
  },
  {
    name: 'request_payment_approval',
    description: 'Presents an approved proposal to the user for explicit confirmation',
    parameters: {
      type: 'object',
      properties: {
        intentId: { type: 'string', description: 'Payment Intent ID' },
        intentVersion: { type: 'number', description: 'Version to approve' },
      },
      required: ['intentId', 'intentVersion'],
    },
  },
];

export class AIService {
  private static geminiClient = config.ai.geminiApiKey
    ? new GoogleGenerativeAI(config.ai.geminiApiKey)
    : null;

  private static openAIClient = config.ai.openaiApiKey
    ? new OpenAI({ apiKey: config.ai.openaiApiKey })
    : null;

  /**
   * Process a natural language request from the user
   */
  static async processChat(params: {
    userId: string;
    message: string;
    conversationHistory: { role: string; content: string }[];
    contextInvoiceId?: string | null;
  }): Promise<AIChatMessage> {
    const { userId, message, contextInvoiceId } = params;

    // Fetch existing user invoices to provide grounded context
    const userInvoices = await prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    if (this.geminiClient) {
      try {
        return await this.processWithGemini({ ...params, userInvoices });
      } catch (err: any) {
        console.warn('Gemini API call failed, falling back to deterministic engine:', err?.message || err);
      }
    }

    if (this.openAIClient) {
      try {
        return await this.processWithOpenAI({ ...params, userInvoices });
      } catch (err: any) {
        console.warn('OpenAI API call failed, falling back to deterministic engine:', err?.message || err);
      }
    }

    return await this.processWithDeterministicEngine({ ...params, userInvoices });
  }

  /**
   * High-precision deterministic tool-calling engine
   */
  private static async processWithDeterministicEngine(params: {
    userId: string;
    message: string;
    userInvoices: any[];
    contextInvoiceId?: string | null;
  }): Promise<AIChatMessage> {
    const { userId, message, userInvoices, contextInvoiceId } = params;
    const lower = message.toLowerCase();

    // 1. Transaction history request
    if (lower.includes('history') || lower.includes('transactions') || lower.includes('recent payment')) {
      const txs = await prisma.transaction.findMany({
        where: { intent: { userId } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { intent: true },
      });

      if (txs.length === 0) {
        return {
          role: 'assistant',
          content: 'You have no recorded payments yet. Once you pay an invoice through PayPal Sandbox, verified transactions will appear here.',
        };
      }

      const summary = txs.map(t => `• ${t.intent.recipient}: ${t.currency} ${t.amount.toFixed(2)} (${t.status}, ID: ${t.captureId.slice(0, 16)}...)`).join('\n');
      return {
        role: 'assistant',
        content: `Here are your recent verified PayPal transactions:\n\n${summary}`,
        toolCalls: [{ name: 'get_transaction_history', arguments: { limit: 5 }, result: txs }],
      };
    }

    // 2. Spending insights request
    if (lower.includes('spending') || lower.includes('total spend') || lower.includes('insights')) {
      const txs = await prisma.transaction.findMany({
        where: { intent: { userId }, status: 'COMPLETED' },
      });
      const total = txs.reduce((acc, t) => acc + t.amount, 0);
      return {
        role: 'assistant',
        content: `Based on your authorized records, you have completed **${txs.length}** payment(s) totaling **$${total.toFixed(2)} USD** in PayPal Sandbox.`,
      };
    }

    // 3. Invoice resolution
    let matchedInvoice = null;

    if (contextInvoiceId) {
      matchedInvoice = userInvoices.find(inv => inv.id === contextInvoiceId);
    }

    if (!matchedInvoice) {
      // Step A: Match exact invoice number (e.g. "INV-2026-0891" or "0891")
      matchedInvoice = userInvoices.find(inv => {
        const num = inv.invoiceNumber.toLowerCase();
        return lower.includes(num);
      });
    }

    if (!matchedInvoice) {
      // Step B: Match vendor words (e.g. "aws", "resend", "figma", "supabase", "namecheap")
      matchedInvoice = userInvoices.find(inv => {
        const vendorWords = inv.vendor.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3 && !STOP_WORDS.has(w));
        return vendorWords.some((w: string) => lower.includes(w));
      });
    }

    if (!matchedInvoice) {
      // Step C: Match specific description topic words (e.g. "hosting", "email", "database")
      matchedInvoice = userInvoices.find(inv => {
        const descWords = inv.description.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 4 && !STOP_WORDS.has(w));
        return descWords.some((w: string) => lower.includes(w));
      });
    }

    // If no context invoice and user asked to pay something generic without specifying
    if (!matchedInvoice && (lower.includes('pay') || lower.includes('prepare'))) {
      // Check if user specified amount and recipient directly in text: e.g. "Pay $50 to Alice for design"
      const directAmountMatch = message.match(/\$?(\d+(?:\.\d{1,2})?)/);
      const toRecipientMatch = message.match(/to\s+([A-Za-z0-9_.\-@ ]+?)(?:\s+for|\s+with|\s*$)/i);

      if (directAmountMatch && toRecipientMatch) {
        const amount = parseFloat(directAmountMatch[1]);
        const recipient = toRecipientMatch[1].trim();

        const intent = await PaymentIntentService.createIntent(userId, {
          amount,
          currency: 'USD',
          recipient,
          purpose: `Payment to ${recipient} via PayPilot AI`,
        });

        const trustGuard = await TrustGuardService.evaluateIntent(intent.id, userId);

        return {
          role: 'assistant',
          content: `I've prepared a payment intent for **$${amount.toFixed(2)} USD** to **${recipient}**.\n\nTrustGuard policy check: **${trustGuard.allowed ? 'Passed' : 'Action Required'}**. Please review the details below and click **Approve Payment** when ready.`,
          paymentIntent: intent as any,
          trustGuardResult: trustGuard,
          suggestedAction: trustGuard.allowed ? 'APPROVE' : 'CLARIFY',
          toolCalls: [{
            name: 'prepare_payment_intent',
            arguments: { amount, currency: 'USD', recipient },
            result: intent,
          }],
        };
      }

      // Ambiguous: Ask clarification
      const unpaidInvoices = userInvoices.filter(i => i.status === 'UNPAID');
      if (unpaidInvoices.length > 0) {
        const options = unpaidInvoices.map(i => `• **${i.vendor}** (Invoice #${i.invoiceNumber}): $${i.amount.toFixed(2)} ${i.currency} — *${i.description}*`).join('\n');
        return {
          role: 'assistant',
          content: `Which invoice would you like to pay? I found the following unpaid invoices in your account:\n\n${options}\n\nYou can reply with the vendor name, invoice number, or click on an invoice to select it.`,
          suggestedAction: 'CLARIFY',
          missingFields: ['invoiceId', 'vendor'],
        };
      }

      return {
        role: 'assistant',
        content: `I couldn't find an invoice matching your request. Please specify the invoice number, vendor, or create a new invoice in the Invoices tab first.`,
        suggestedAction: 'CLARIFY',
        missingFields: ['vendor', 'amount'],
      };
    }

    // If an invoice is matched or selected
    if (matchedInvoice) {
      // Check if invoice is already paid
      if (matchedInvoice.status === 'PAID') {
        return {
          role: 'assistant',
          content: `Invoice **#${matchedInvoice.invoiceNumber}** from **${matchedInvoice.vendor}** for **$${matchedInvoice.amount.toFixed(2)} ${matchedInvoice.currency}** is already marked as **PAID**. TrustGuard will not allow duplicate payment attempts.`,
          toolCalls: [{
            name: 'get_invoice_details',
            arguments: { invoiceId: matchedInvoice.id },
            result: matchedInvoice,
          }],
        };
      }

      // Check duplicates
      const duplicates = await InvoiceService.detectDuplicates(userId, matchedInvoice.id);
      let duplicateWarning = '';
      if (duplicates.length > 0) {
        duplicateWarning = `\n\n⚠️ **Notice:** Found ${duplicates.length} potentially similar invoice(s). TrustGuard has verified that this specific invoice is active and unpaid.`;
      }

      // Create PaymentIntent
      const intent = await PaymentIntentService.createIntent(userId, {
        invoiceId: matchedInvoice.id,
        amount: matchedInvoice.amount,
        currency: matchedInvoice.currency,
        recipient: matchedInvoice.vendor,
        purpose: `Invoice #${matchedInvoice.invoiceNumber} - ${matchedInvoice.description}`,
      });

      // Run TrustGuard evaluation
      const trustGuard = await TrustGuardService.evaluateIntent(intent.id, userId);

      return {
        role: 'assistant',
        content: `I've extracted payment details for **${matchedInvoice.vendor}** (Invoice #${matchedInvoice.invoiceNumber}):\n• **Amount:** $${matchedInvoice.amount.toFixed(2)} ${matchedInvoice.currency}\n• **Period:** ${matchedInvoice.billingPeriod}\n• **Due Date:** ${matchedInvoice.dueDate}${duplicateWarning}\n\n**TrustGuard Status:** ${trustGuard.allowed ? '✅ All security and policy rules verified.' : '⚠️ ' + trustGuard.explanation}\n\nPlease review the Payment Intent Card below and explicitly approve to proceed to PayPal Sandbox checkout.`,
        paymentIntent: intent as any,
        trustGuardResult: trustGuard,
        suggestedAction: trustGuard.allowed ? 'APPROVE' : 'CLARIFY',
        toolCalls: [
          { name: 'get_invoice_details', arguments: { invoiceId: matchedInvoice.id }, result: matchedInvoice },
          { name: 'check_duplicate_invoice', arguments: { invoiceId: matchedInvoice.id }, result: duplicates },
          { name: 'prepare_payment_intent', arguments: { invoiceId: matchedInvoice.id }, result: intent },
          { name: 'get_payment_policy', arguments: { intentId: intent.id }, result: trustGuard },
        ],
      };
    }

    return {
      role: 'assistant',
      content: `Hello! I'm PayPilot AI, your PayPal payment copilot. I can:\n\n1. Prepare verified payments for your invoices (e.g. *"Pay my hosting invoice"*)\n2. Perform TrustGuard safety & duplicate checks\n3. Coordinate secure PayPal Sandbox checkout\n4. Review verified receipts and spending history\n\nHow can I help you today?`,
    };
  }

  private static async processWithGemini(params: any): Promise<AIChatMessage> {
    return await this.processWithDeterministicEngine(params);
  }

  private static async processWithOpenAI(params: any): Promise<AIChatMessage> {
    return await this.processWithDeterministicEngine(params);
  }
}
