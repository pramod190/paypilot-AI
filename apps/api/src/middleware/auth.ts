import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Authentication middleware with demo identity support for hackathon evaluation
 */
export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const demoUserId = (req.headers['x-user-id'] as string) || 'demo-user-001';
    const demoEmail = 'alex.freelancer@example.com';
    const demoName = 'Alex Mercer (Freelance Studio)';

    // Ensure demo user exists in database
    let user = await prisma.user.findUnique({
      where: { id: demoUserId },
    });

    if (!user) {
      user = await prisma.user.upsert({
        where: { email: demoEmail },
        update: {},
        create: {
          id: demoUserId,
          email: demoEmail,
          name: demoName,
        },
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication initialization failure' });
  }
}
