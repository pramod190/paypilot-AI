import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { InvoiceService } from '../services/invoice.service.js';
import { CreateInvoiceSchema } from '@paypilot/shared';
import { prisma } from '../prisma.js';

const router = Router();

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const invoices = await InvoiceService.getUserInvoices(req.user!.id);
    res.json(invoices);
  } catch (err) {
    next(err);
  }
});

router.post('/reset', async (req: AuthenticatedRequest, res, next) => {
  try {
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
    const invoice = await InvoiceService.createInvoice(req.user!.id, data);
    res.status(201).json(invoice);
  } catch (err) {
    next(err);
  }
});

export default router;
