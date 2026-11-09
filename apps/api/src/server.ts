import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config.js';
import helmet from 'helmet';
import { requestContext } from './middleware/request-context.js';
import { PaymentIntentService } from './services/payment-intent.service.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import aiRoutes from './routes/ai.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import intentRoutes from './routes/intent.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import transactionRoutes from './routes/transaction.routes.js';
import auditRoutes from './routes/audit.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import { PayPalService } from './services/paypal.service.js';
import { rateLimit } from './middleware/rate-limit.js';
import authRoutes from './routes/auth.routes.js';
import insightsRoutes from './routes/insights.routes.js';
import { prisma, disconnectPrisma } from './prisma.js';
import { seedDatabase } from './seed.js';
import { DEMO_USER } from './services/auth.service.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

app.disable('x-powered-by');
// Behind Render/other proxies: trust the first hop so rate limiting sees real client IPs.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(requestContext);

// Security headers. The CSP allows exactly what the PayPal JS SDK needs and nothing else.
// Set CSP_ENFORCE=true once you have clicked through checkout in your deployed environment;
// until then it runs in report-only mode so a policy mistake can never block a payment demo.
const paypalHosts = ['https://*.paypal.com', 'https://*.paypalobjects.com'];
app.use(helmet({
  contentSecurityPolicy: {
    reportOnly: process.env.CSP_ENFORCE !== 'true',
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...paypalHosts],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', ...paypalHosts],
      connectSrc: ["'self'", ...paypalHosts],
      frameSrc: ["'self'", ...paypalHosts],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // would block the PayPal iframes
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cors({
  origin: [config.clientUrl],
  credentials: true,
}));

app.use(express.json({ limit: '100kb' }));

// Root route redirects to /api/health for convenience
app.get('/', (_req, res) => {
  res.redirect('/api/health');
});

// Public health & config routes
app.get('/api/health', async (_req, res) => {
  let database: 'up' | 'down' = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }
  res.status(database === 'up' ? 200 : 503).json({
    status: database === 'up' ? 'ok' : 'degraded',
    database,
    timestamp: new Date().toISOString(),
    service: 'PayPilot AI Backend',
    environment: config.nodeEnv,
    paypalConfigured: PayPalService.isConfigured(),
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    paypalClientId: config.paypal.clientId,
    paypalEnvironment: config.paypal.environment,
    isPayPalConfigured: PayPalService.isConfigured(),
    aiProvider: config.ai.provider,
  });
});

// PayPal Webhooks (public endpoint for PayPal server callbacks)
app.use('/api/webhooks', webhookRoutes);

// Authentication endpoints (public, strictly rate limited)
app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 10 }), authRoutes);

// Authenticated API routes
app.use('/api', authMiddleware);
app.use('/api/ai', rateLimit({ windowMs: 60_000, max: 20 }), aiRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/intents', intentRoutes);
app.use('/api/payments', rateLimit({ windowMs: 60_000, max: 30 }), paymentRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/insights', insightsRoutes);

// Production: serve the built React app from this same service (one deployable unit)
if (process.env.NODE_ENV === 'production') {
  const webDist = process.env.WEB_DIST || 
    (fs.existsSync(path.resolve(process.cwd(), 'apps/web/dist'))
      ? path.resolve(process.cwd(), 'apps/web/dist')
      : path.resolve(__dirname, '../../web/dist'));
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }
}

// Central error handler
app.use(errorHandler);

async function ensureDemoData() {
  // First boot of a demo deployment: create the seeded (clearly labelled) demo invoices if none exist yet.
  if (!config.demoLoginEnabled) return;
  const existing = await prisma.invoice.count({ where: { userId: DEMO_USER.id } });
  if (existing === 0) await seedDatabase();
}

if (process.env.NODE_ENV !== 'test') {
  const warnings = validateConfig();
  ensureDemoData().catch(err => console.error('Demo data check failed:', err));

  const server = app.listen(config.port, () => {
    console.log(`🚀 PayPilot AI Server running on port ${config.port}`);
    console.log(`💳 PayPal Sandbox: ${PayPalService.isConfigured() ? 'configured' : 'NOT CONFIGURED - checkout will return 503 until credentials are set'}`);
    console.log(`🤖 AI Provider: ${config.ai.geminiApiKey ? 'Gemini API' : (config.ai.openaiApiKey ? 'OpenAI API' : 'NONE - rule-based fallback only')}`);
    warnings.forEach(w => console.warn(`⚠️  ${w}`));
  });

  // Periodically expire intents that were never approved/used.
  const sweeper = setInterval(() => {
    PaymentIntentService.expireStaleIntents().catch(err => console.error('Expiry sweep failed:', err));
  }, 60_000);
  sweeper.unref();

  // Graceful shutdown: stop accepting connections, let in-flight requests (e.g. a capture) finish, close the DB.
  const shutdown = (signal: string) => {
    console.log(JSON.stringify({ level: 'info', msg: 'shutdown', signal }));
    clearInterval(sweeper);
    server.close(async () => {
      await disconnectPrisma().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
