import { prisma } from '../prisma.js';

const SENSITIVE_KEY = /secret|token|password|passwd|authorization|api[-_]?key|cookie|signature|credential|card|cvv|ssn/i;

export function redact(value: any, depth = 0): any {
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map(v => redact(v, depth + 1));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return value.slice(0, 500) + '…';
  return value;
}

export class AuditService {
  static async logEvent(params: {
    userId?: string | null;
    intentId?: string | null;
    eventType: string;
    safeDetails: Record<string, any>;
  }) {
    try {
      // Defence in depth: redact anything that looks like a credential, at any nesting depth.
      const cleanDetails = redact(params.safeDetails);

      let verifiedUserId: string | null = null;
      if (params.userId) {
        const userExists = await prisma.user.findUnique({
          where: { id: params.userId },
          select: { id: true },
        });
        if (userExists) {
          verifiedUserId = userExists.id;
        }
      }

      let verifiedIntentId: string | null = null;
      if (params.intentId) {
        const intentExists = await prisma.paymentIntent.findUnique({
          where: { id: params.intentId },
          select: { id: true },
        });
        if (intentExists) {
          verifiedIntentId = intentExists.id;
        }
      }

      return await prisma.auditEvent.create({
        data: {
          userId: verifiedUserId,
          intentId: verifiedIntentId,
          eventType: params.eventType,
          safeDetails: JSON.stringify(cleanDetails),
        },
      });
    } catch (err) {
      console.error('Failed to log audit event:', err);
      return null;
    }
  }

  static async getEventsForIntent(intentId: string) {
    const events = await prisma.auditEvent.findMany({
      where: { intentId },
      orderBy: { createdAt: 'desc' },
    });

    return events.map(e => ({
      ...e,
      safeDetails: JSON.parse(e.safeDetails),
    }));
  }

  static async getRecentEvents(limit: number = 50) {
    const events = await prisma.auditEvent.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        intent: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });

    return events.map(e => ({
      ...e,
      safeDetails: JSON.parse(e.safeDetails),
    }));
  }
}
