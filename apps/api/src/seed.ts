import { prisma } from './prisma.js';
import { InvoiceStatus } from '@paypilot/shared';

export async function seedDatabase() {
  console.log('🌱 Seeding PayPilot AI Database...');

  // 1. Create or update Demo User
  const demoUserId = 'demo-user-001';
  const user = await prisma.user.upsert({
    where: { id: demoUserId },
    update: {
      name: 'Alex Mercer (Freelance Studio)',
      email: 'alex.freelancer@example.com',
    },
    create: {
      id: demoUserId,
      email: 'alex.freelancer@example.com',
      name: 'Alex Mercer (Freelance Studio)',
    },
  });

  console.log(`👤 Seeded User: ${user.name} (${user.email})`);

  // Clear existing demo invoices to avoid collisions on seed rerun
  await prisma.auditEvent.deleteMany({ where: { userId: demoUserId } });
  await prisma.transaction.deleteMany({ where: { intent: { userId: demoUserId } } });
  await prisma.approval.deleteMany({ where: { intent: { userId: demoUserId } } });
  await prisma.paymentIntent.deleteMany({ where: { userId: demoUserId } });
  await prisma.invoice.deleteMany({ where: { userId: demoUserId } });

  // 2. Seed Invoices matching Hackathon Live Demo Requirements
  const invoicesData = [
    {
      invoiceNumber: 'INV-2026-0891',
      vendor: 'AWS Cloud Services',
      amount: 24.99,
      currency: 'USD',
      billingPeriod: 'October 2026',
      dueDate: '2026-11-15',
      description: 'Monthly cloud hosting infrastructure & edge compute',
      status: InvoiceStatus.UNPAID,
    },
    {
      invoiceNumber: 'INV-2026-0422',
      vendor: 'Supabase Database',
      amount: 25.00,
      currency: 'USD',
      billingPeriod: 'October 2026',
      dueDate: '2026-11-20',
      description: 'Managed PostgreSQL database instance and storage',
      status: InvoiceStatus.UNPAID,
    },
    {
      invoiceNumber: 'INV-2026-1033',
      vendor: 'Figma Enterprise',
      amount: 45.00,
      currency: 'USD',
      billingPeriod: 'Q4 2026',
      dueDate: '2026-11-05',
      description: 'Collaborative UI/UX design suite team seat',
      status: InvoiceStatus.UNPAID,
    },
    {
      invoiceNumber: 'INV-2026-0012',
      vendor: 'Resend Email API',
      amount: 20.00,
      currency: 'USD',
      billingPeriod: 'September 2026',
      dueDate: '2026-10-01',
      description: 'Transactional email dispatch tier (Already Paid)',
      status: InvoiceStatus.PAID,
    },
    {
      invoiceNumber: 'INV-2026-5541',
      vendor: 'Namecheap DNS Services',
      amount: 14.99,
      currency: 'USD',
      billingPeriod: 'Annual 2026-2027',
      dueDate: '2026-11-28',
      description: 'Domain registration and SSL cert renewal',
      status: InvoiceStatus.UNPAID,
    },
    {
      invoiceNumber: 'INV-2026-5542',
      vendor: 'Namecheap DNS Services',
      amount: 14.99,
      currency: 'USD',
      billingPeriod: 'Annual 2026-2027',
      dueDate: '2026-11-29',
      description: 'Potential duplicate candidate invoice',
      status: InvoiceStatus.UNPAID,
    },
  ];

  for (const inv of invoicesData) {
    await prisma.invoice.create({
      data: {
        userId: user.id,
        invoiceNumber: inv.invoiceNumber,
        vendor: inv.vendor,
        amount: inv.amount,
        currency: inv.currency,
        billingPeriod: inv.billingPeriod,
        dueDate: inv.dueDate,
        description: inv.description,
        status: inv.status,
      },
    });
  }

  console.log(`📑 Seeded ${invoicesData.length} realistic invoices.`);
  console.log('✅ Database seeding complete.');
}

if (process.argv[1]?.includes('seed.ts') || process.argv[1]?.includes('seed')) {
  seedDatabase()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
