import { z } from 'zod';
import { InvoiceStatus, PaymentState } from './types.js';
import { toMinor, MAX_SINGLE_PAYMENT_MINOR } from './money.js';

export const SupportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const;

export const MoneyAmountSchema = z.number()
  .positive('Payment amount must be greater than zero')
  .refine(val => {
    try { toMinor(val); return true; } catch { return false; }
  }, 'Amount must have at most 2 decimal places')
  .refine(val => {
    try { return toMinor(val) <= MAX_SINGLE_PAYMENT_MINOR; } catch { return true; }
  }, 'Single transaction limit of $10,000 exceeded');

export const CurrencySchema = z.enum(SupportedCurrencies, {
  errorMap: () => ({ message: 'Unsupported currency. Supported currencies: USD, EUR, GBP, CAD, AUD' })
});

// Invoice Schema
export const CreateInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1, 'Invoice number is required').max(100),
  vendor: z.string().min(1, 'Vendor name is required').max(150),
  amount: MoneyAmountSchema,
  currency: CurrencySchema,
  billingPeriod: z.string().min(1, 'Billing period is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  description: z.string().min(1, 'Description is required').max(500),
  status: z.nativeEnum(InvoiceStatus).default(InvoiceStatus.UNPAID),
});

export const UpdateInvoiceSchema = CreateInvoiceSchema.partial();

// Payment Intent Schema
export const CreatePaymentIntentSchema = z.object({
  invoiceId: z.string().optional().nullable(),
  amount: MoneyAmountSchema,
  currency: CurrencySchema,
  recipient: z.string().min(1, 'Recipient name/email is required'),
  purpose: z.string().min(1, 'Purpose/description is required'),
});

export const UpdatePaymentIntentSchema = z.object({
  amount: MoneyAmountSchema.optional(),
  currency: CurrencySchema.optional(),
  recipient: z.string().min(1).optional(),
  purpose: z.string().min(1).optional(),
});

export const ApprovePaymentIntentSchema = z.object({
  intentVersion: z.number().int().positive('Intent version is required for approval integrity'),
});

export const CapturePaymentSchema = z.object({
  paypalOrderId: z.string().min(5, 'Valid PayPal Order ID is required'),
});

export const AIChatRequestSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message is too long (max 2000 characters)'),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(4000),
  })).max(30).optional().default([]),
  contextInvoiceId: z.string().optional().nullable(),
});

