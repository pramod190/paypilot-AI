// Core Payment States as specified in Payment State Machine
export enum PaymentState {
  DRAFT = 'DRAFT',
  VALIDATED = 'VALIDATED',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  APPROVED = 'APPROVED',
  CHECKOUT_PENDING = 'CHECKOUT_PENDING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
  PENDING_RECONCILIATION = 'PENDING_RECONCILIATION',
}

// Invoice Statuses
export enum InvoiceStatus {
  UNPAID = 'UNPAID',
  PENDING = 'PENDING',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

// User model
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

// Invoice model
export interface Invoice {
  id: string;
  userId: string;
  invoiceNumber: string;
  vendor: string;
  amount: number; // Stored in minor units (e.g. cents) or decimal
  currency: string;
  billingPeriod: string;
  dueDate: string;
  description: string;
  status: InvoiceStatus;
  createdAt: string;
  updatedAt: string;
}

// PaymentIntent model
export interface PaymentIntent {
  id: string;
  userId: string;
  invoiceId?: string | null;
  amount: number; // e.g. 24.99 or in cents
  currency: string;
  recipient: string;
  purpose: string;
  status: PaymentState;
  version: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// Approval model
export interface Approval {
  id: string;
  intentId: string;
  approvedBy: string;
  intentVersion: number;
  approvedAt: string;
}

// Authoritative PayPal Transaction
export interface Transaction {
  id: string;
  intentId: string;
  paypalOrderId: string;
  captureId: string;
  amount: number;
  currency: string;
  status: string; // e.g. 'COMPLETED'
  createdAt: string;
  updatedAt: string;
}

// Audit Log Event
export interface AuditEvent {
  id: string;
  userId?: string | null;
  intentId?: string | null;
  eventType: string;
  safeDetails: Record<string, any>;
  createdAt: string;
}

// TrustGuard Rule Evaluation Results
export interface PolicyCheckResult {
  ruleName: string;
  passed: boolean;
  message: string;
  details?: Record<string, any>;
}

export interface TrustGuardEvaluation {
  allowed: boolean;
  intentId: string;
  intentVersion: number;
  checks: PolicyCheckResult[];
  explanation: string;
  evaluatedAt: string;
}

// AI Chat Communication
export interface AIChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: AIToolCall[];
  paymentIntent?: PaymentIntent | null;
  trustGuardResult?: TrustGuardEvaluation | null;
  suggestedAction?: 'APPROVE' | 'MODIFY' | 'CLARIFY' | 'CHECKOUT' | null;
  missingFields?: string[];
}

export interface AIToolCall {
  name: string;
  arguments: Record<string, any>;
  result?: any;
}

