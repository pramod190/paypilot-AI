import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { minorToDisplay } from '@paypilot/shared';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and point it at a PostgreSQL database.');
}

// Prisma's own "?schema=" URL option is not understood by node-postgres, so pass it to the adapter instead.
const url = new URL(connectionString);
const schema = url.searchParams.get('schema') || undefined;
url.searchParams.delete('schema');

const adapter = new PrismaPg({ connectionString: url.toString() }, schema ? { schema } : undefined);

const base = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * `amountMinor` (integer cents) is the single source of truth. `amount` is a read-only DISPLAY value derived
 * from it so the UI/JSON stay friendly. No server logic may use `amount` for arithmetic or comparison.
 */
export const prisma = base.$extends({
  result: {
    invoice: { amount: { needs: { amountMinor: true }, compute: (r) => minorToDisplay(r.amountMinor) } },
    paymentIntent: { amount: { needs: { amountMinor: true }, compute: (r) => minorToDisplay(r.amountMinor) } },
    transaction: { amount: { needs: { amountMinor: true }, compute: (r) => minorToDisplay(r.amountMinor) } },
  },
});

export async function disconnectPrisma() {
  await base.$disconnect();
}
