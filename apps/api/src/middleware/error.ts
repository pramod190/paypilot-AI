import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.requestId;

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      requestId,
      details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  // Malformed JSON bodies and oversized payloads are client errors, not server faults.
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body', requestId });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large', requestId });

  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    // Log the real error server-side (never the request body); return a generic message to the client.
    console.error(JSON.stringify({ level: 'error', msg: 'unhandled_error', requestId, name: err?.name, message: err?.message, stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack }));
  }
  const message = status >= 500 && err.name !== 'PayPalError' ? 'Internal Server Error' : (err.message || 'Internal Server Error');
  res.status(status).json({ error: message, status, requestId });
}
