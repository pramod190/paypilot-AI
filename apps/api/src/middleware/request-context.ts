import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

/** Attach a request id and emit ONE structured access-log line per request. Bodies, headers and tokens are never logged. */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);

  if (process.env.NODE_ENV === 'test') return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(JSON.stringify({
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      msg: 'request',
      requestId: id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(ms * 10) / 10,
    }));
  });
  next();
}
