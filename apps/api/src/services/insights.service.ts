import { prisma } from '../prisma.js';
import { formatMinor } from '@paypilot/shared';

export type SpendingPeriod = 'all' | 'last_30_days' | 'this_month';
export type SpendingGroup = 'vendor' | 'month';

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Deterministic analytics over VERIFIED records only (completed PayPal captures and the user's own invoices).
 * All sums are integer cents. The AI agent reads these numbers through a tool; it never computes them itself.
 */
export class InsightsService {
  static async spending(userId: string, opts: { period?: SpendingPeriod; groupBy?: SpendingGroup } = {}) {
    const period = opts.period ?? 'all';
    const groupBy = opts.groupBy ?? 'vendor';
    const now = new Date();

    let since: Date | undefined;
    if (period === 'last_30_days') since = new Date(now.getTime() - 30 * 86_400_000);
    if (period === 'this_month') since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const txs = await prisma.transaction.findMany({
      where: { status: 'COMPLETED', intent: { userId }, ...(since ? { createdAt: { gte: since } } : {}) },
      include: { intent: { select: { recipient: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const groups = new Map<string, { key: string; totalMinor: number; count: number }>();
    let totalMinor = 0;
    for (const t of txs) {
      totalMinor += t.amountMinor;
      const key = groupBy === 'month' ? t.createdAt.toISOString().slice(0, 7) : t.intent.recipient;
      const g = groups.get(key) ?? { key, totalMinor: 0, count: 0 };
      g.totalMinor += t.amountMinor;
      g.count += 1;
      groups.set(key, g);
    }

    const breakdown = [...groups.values()]
      .sort((a, b) => b.totalMinor - a.totalMinor)
      .map(g => ({ [groupBy]: g.key, total: formatMinor(g.totalMinor), totalMinor: g.totalMinor, payments: g.count }));

    return {
      period,
      groupBy,
      currency: 'USD',
      paymentCount: txs.length,
      total: formatMinor(totalMinor),
      totalMinor,
      averageMinor: txs.length ? Math.round(totalMinor / txs.length) : 0,
      breakdown,
      basis: 'Verified completed PayPal captures only',
    };
  }

  static async overview(userId: string) {
    const today = todayISO();
    const soon = addDaysISO(7);

    const [invoices, openIntents, reconciling, recent] = await Promise.all([
      prisma.invoice.findMany({ where: { userId }, orderBy: { dueDate: 'asc' } }),
      prisma.paymentIntent.count({
        where: { userId, status: { in: ['VALIDATED', 'AWAITING_APPROVAL', 'APPROVED'] }, expiresAt: { gt: new Date() } },
      }),
      prisma.paymentIntent.count({ where: { userId, status: 'PENDING_RECONCILIATION' } }),
      prisma.transaction.findMany({
        where: { intent: { userId } },
        include: { intent: { select: { recipient: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const payable = invoices.filter(i => i.status !== 'PAID' && i.status !== 'CANCELLED');
    const overdue = payable.filter(i => i.dueDate < today);
    const dueSoon = payable.filter(i => i.dueDate >= today && i.dueDate <= soon);
    const outstandingMinor = payable.reduce((s, i) => s + i.amountMinor, 0);
    const slim = (i: (typeof invoices)[number]) => ({
      id: i.id, invoiceNumber: i.invoiceNumber, vendor: i.vendor, amount: formatMinor(i.amountMinor), amountMinor: i.amountMinor, currency: i.currency, dueDate: i.dueDate, status: i.status,
    });

    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const paidThisMonthMinor = (await prisma.transaction.aggregate({
      _sum: { amountMinor: true },
      where: { status: 'COMPLETED', intent: { userId }, createdAt: { gte: monthStart } },
    }))._sum.amountMinor ?? 0;

    return {
      outstanding: { count: payable.length, total: formatMinor(outstandingMinor), totalMinor: outstandingMinor },
      overdue: overdue.map(slim),
      dueSoon: dueSoon.map(slim),
      paidThisMonth: { total: formatMinor(paidThisMonthMinor), totalMinor: paidThisMonthMinor },
      pendingApprovals: openIntents,
      pendingReconciliation: reconciling,
      recentTransactions: recent.map(t => ({
        id: t.id, recipient: t.intent.recipient, amount: formatMinor(t.amountMinor), amountMinor: t.amountMinor, currency: t.currency, captureId: t.captureId, createdAt: t.createdAt.toISOString(),
      })),
      asOf: new Date().toISOString(),
    };
  }
}
