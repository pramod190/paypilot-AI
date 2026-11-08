import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from '../middleware/rate-limit.js';
import { InvoiceExtractionService, MAX_EXTRACT_CHARS } from '../services/invoice-extraction.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { InvoiceService } from '../services/invoice.service.js';
import { CreateInvoiceSchema, InvoiceStatus } from '@paypilot/shared';
import { prisma } from '../prisma.js';
import { seedInvoicesForUser } from '../seed.js';

const router = Router();

const ExtractSchema = z.object({ text: z.string().trim().min(10, 'Paste at least a few lines of invoice text').max(MAX_EXTRACT_CHARS, `Invoice text is too long (max ${MAX_EXTRACT_CHARS} characters)`) });

/** Parse pasted invoice text into an UNSAVED draft + duplicate evidence. Must be declared before '/:id'. */
router.post('/extract', rateLimit({ windowMs: 60_000, max: 15 }), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { text } = ExtractSchema.parse(req.body);
    res.json(await InvoiceExtractionService.extract(req.user!.id, text));
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    let invoices = await InvoiceService.getUserInvoices(req.user!.id);
    if (invoices.length === 0) {
      await seedInvoicesForUser(req.user!.id);
      invoices = await InvoiceService.getUserInvoices(req.user!.id);
    }
    res.json(invoices);
  } catch (err) {
    next(err);
  }
});

router.post('/reset', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    const userId = req.user!.id;
    await prisma.transaction.deleteMany({ where: { intent: { userId } } });
    await prisma.approval.deleteMany({ where: { intent: { userId } } });
    await prisma.paymentIntent.deleteMany({ where: { userId } });
    await prisma.invoice.updateMany({
      where: { userId, invoiceNumber: { not: 'INV-2026-0012' } },
      data: { status: 'UNPAID' },
    });
    res.json({ success: true, message: 'Invoices successfully reset to UNPAID' });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const invoice = await InvoiceService.getInvoiceById(id, req.user!.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const duplicates = await InvoiceService.detectDuplicates(req.user!.id, invoice.id);
    res.json({ invoice, duplicates });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = CreateInvoiceSchema.parse(req.body);
    // Payment status is only ever changed by verified captures, never by client input.
    const invoice = await InvoiceService.createInvoice(req.user!.id, { ...data, status: InvoiceStatus.UNPAID });
    res.status(201).json(invoice);
  } catch (err) {
    next(err);
  }
});

export default router;
