import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const SCRYPT_KEYLEN = 64;

export const DEMO_USER = {
  id: 'demo-user-001',
  email: 'alex.freelancer@example.com',
  name: 'Alex Mercer (Freelance Studio)',
};

export class AuthService {
  /** scrypt with a per-user random salt. Stored as "scrypt$<salt>$<hash>" (hex). */
  static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
    return `scrypt$${salt}$${hash}`;
  }

  static verifyPassword(password: string, stored: string | null | undefined): boolean {
    if (!stored) return false;
    const [scheme, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(hash, 'hex');
    return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
  }

  static signToken(user: { id: string; email: string }): string {
    return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, { expiresIn: '8h', algorithm: 'HS256' });
  }

  /** Returns the user id, or null when the token is missing, malformed, expired or forged. */
  static verifyToken(token: string): string | null {
    try {
      const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
