import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';
import { AuthService } from '../services/auth.service.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Bearer-token authentication. Identity comes ONLY from a signed, unexpired JWT in the Authorization header.
 * Because no ambient credentials (cookies) are used, browsers never attach auth automatically, so classic CSRF
 * does not apply to these endpoints. CORS is additionally restricted to the configured client origin.
 */
export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const userId = token ? AuthService.verifyToken(token) : null;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required. Provide a valid Bearer token.' });
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(401).json({ error: 'Authentication required. Unknown user.' });
    }
    req.user = { id: user.id, email: user.email, name: user.name };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication failure' });
  }
}
