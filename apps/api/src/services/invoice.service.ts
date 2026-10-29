import { prisma } from '../prisma.js';
import { InvoiceStatus } from '@paypilot/shared';
import { AuditService } from './audit.service.js';

export class InvoiceService {
  /**
   * Get all invoices for a user
   */
  static async getUserInvoices(userId: string) {
    return await prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        paymentIntents: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { transaction: true },
        },
      },
    });
  }

  /**
   * Get single invoice with full relations
   */
  static async getInvoiceById(id: string, userId: string) {
    return await prisma.invoice.findFirst({
      where: { id, userId },
      include: {
        paymentIntents: {
          include: {
            approvals: true,
            transaction: true,
          },
        },
      },
    });
  }

  /**
   * Create a new invoice with duplicate detection
   */
  static async createInvoice(userId: string, data: {
    invoiceNumber: string;
    vendor: string;
    amount: number;
    currency?: string;
    billingPeriod: string;
    dueDate: string;
    description: string;
    status?: InvoiceStatus;
  }) {
    // Check if an invoice with same number & vendor already exists
    const existing = await prisma.invoice.findFirst({
      where: {
        userId,
        invoiceNumber: data.invoiceNumber,
        vendor: { equals: data.vendor },
      },
    });

    if (existing) {
      throw new Error(`An invoice with number '${data.invoiceNumber}' for vendor '${data.vendor}' already exists.`);
    }

    const invoice = await prisma.invoice.create({
      data: {
        userId,
        invoiceNumber: data.invoiceNumber,
        vendor: data.vendor,
        amount: data.amount,
        currency: data.currency || 'USD',
        billingPeriod: data.billingPeriod,
        dueDate: data.dueDate,
        description: data.description,
        status: data.status || InvoiceStatus.UNPAID,
      },
    });

    await AuditService.logEvent({
      userId,
      eventType: 'INVOICE_CREATED',
      safeDetails: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        vendor: invoice.vendor,
      },
    });

    return invoice;
  }

  /**
   * Detect potential duplicates for an invoice
   */
  static async detectDuplicates(userId: string, invoiceId: string) {
    const target = await prisma.invoice.findFirst({ where: { id: invoiceId, userId } });
    if (!target) return [];

    // Find invoices with identical vendor or amount
    const duplicates = await prisma.invoice.findMany({
      where: {
        userId,
        id: { not: target.id },
        OR: [
          { invoiceNumber: target.invoiceNumber },
          {
            vendor: target.vendor,
            amount: target.amount,
            billingPeriod: target.billingPeriod,
          },
        ],
      },
    });

    return duplicates.map(dup => ({
      invoice: dup,
      reason: dup.invoiceNumber === target.invoiceNumber
        ? 'Duplicate invoice number'
        : `Matching vendor (${dup.vendor}), amount ($${dup.amount}), and billing period (${dup.billingPeriod})`,
    }));
  }

  /**
   * Update invoice status (e.g. to PAID after verified capture)
   */
  static async updateStatus(invoiceId: string, status: InvoiceStatus) {
    return await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status },
    });
  }
}
