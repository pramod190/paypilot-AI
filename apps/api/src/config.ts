import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    environment: (process.env.PAYPAL_ENVIRONMENT || 'sandbox').toLowerCase() as 'sandbox' | 'production',
    webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
    get baseUrl() {
      return this.environment === 'production'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
    }
  },

  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    provider: (process.env.AI_PROVIDER || 'auto').toLowerCase(),
  },

  jwtSecret: process.env.JWT_SECRET || 'paypilot-jwt-dev-secret-2026',
  sessionSecret: process.env.SESSION_SECRET || 'paypilot-session-secret',
};

