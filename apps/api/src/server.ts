import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import aiRoutes from './routes/ai.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import intentRoutes from './routes/intent.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import transactionRoutes from './routes/transaction.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { PayPalService } from './services/paypal.service.js';

export const app = express();

app.use(cors({
  origin: '*',
  credentials: true,
}));

app.use(express.json());

// Public health & config routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'PayPilot AI Backend',
    environment: config.nodeEnv,
    paypalConfigured: PayPalService.isConfigured(),
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    paypalClientId: config.paypal.clientId || 'test',
    paypalEnvironment: config.paypal.environment,
    isPayPalConfigured: PayPalService.isConfigured(),
    aiProvider: config.ai.provider,
  });
});

// Authenticated API routes
app.use('/api', authMiddleware);
app.use('/api/ai', aiRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/intents', intentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/audit', auditRoutes);

// Central error handler
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`🚀 PayPilot AI Server running on port ${config.port}`);
    console.log(`💳 PayPal Mode: ${PayPalService.isConfigured() ? 'LIVE SANDBOX' : 'MOCK / DEMO SANDBOX'}`);
    console.log(`🤖 AI Provider: ${config.ai.geminiApiKey ? 'Gemini API' : (config.ai.openaiApiKey ? 'OpenAI API' : 'Deterministic High-Precision Engine')}`);
  });
}
