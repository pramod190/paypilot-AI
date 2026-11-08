import { Request, Response, NextFunction } from 'express';

/** Minimal in-memory fixed-window limiter (per IP). Disabled under test. Use a shared store if you scale out. */
export function rateLimit(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') return next();
    const now = Date.now();
    const key = req.ip || 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > opts.max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    next();
  };
}
