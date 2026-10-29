import { prisma } from '../prisma.js';

export class AuditService {
  static async logEvent(params: {
    userId?: string | null;
    intentId?: string | null;
    eventType: string;
    safeDetails: Record<string, any>;
  }) {
    try {
      // Ensure details don't contain sensitive fields
      const cleanDetails = { ...params.safeDetails };
      delete cleanDetails.clientSecret;
      delete cleanDetails.token;
      delete cleanDetails.password;
      delete cleanDetails.apiKey;

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
