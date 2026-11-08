import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { AuthService, DEMO_USER } from '../services/auth.service.js';
import { AuditService } from '../services/audit.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { seedInvoicesForUser } from '../seed.js';

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email().max(200).transform(v => v.toLowerCase()),
  name: z.string().min(1).max(100),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});
const LoginSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase()),
  password: z.string().min(1).max(200),
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, name, password } = RegisterSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });
    const user = await prisma.user.create({ data: { email, name, passwordHash: AuthService.hashPassword(password) } });
    await seedInvoicesForUser(user.id);
    await AuditService.logEvent({ userId: user.id, eventType: 'USER_REGISTERED', safeDetails: { email } });
    res.status(201).json({ token: AuthService.signToken(user), user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // Same response for unknown email and wrong password: no account enumeration.
    if (!user || !AuthService.verifyPassword(password, user.passwordHash)) {
      await AuditService.logEvent({ eventType: 'LOGIN_FAILED', safeDetails: { email } });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    await seedInvoicesForUser(user.id);
    await AuditService.logEvent({ userId: user.id, eventType: 'LOGIN_SUCCESS', safeDetails: {} });
    res.json({ token: AuthService.signToken(user), user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

/** One-click demo identity for judges. Disable with DEMO_LOGIN_ENABLED=false. */
router.post('/demo', async (_req, res, next) => {
  try {
    if (!config.demoLoginEnabled) return res.status(404).json({ error: 'Not found' });
    const user = await prisma.user.upsert({ where: { id: DEMO_USER.id }, update: {}, create: DEMO_USER });
    res.json({ token: AuthService.signToken(user), user: { id: user.id, email: user.email, name: user.name }, demo: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  res.json(req.user);
});

export default router;
