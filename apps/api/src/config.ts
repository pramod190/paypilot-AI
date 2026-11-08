import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const environment = (process.env.PAYPAL_ENVIRONMENT || 'sandbox').toLowerCase() as 'sandbox' | 'production';

const jwtSecret = process.env.JWT_SECRET || '';
if (!jwtSecret && (process.env.NODE_ENV === 'production')) {
  throw new Error('JWT_SECRET must be set in production.');
}

export const config = {
  jwtSecret: jwtSecret || 'dev-only-insecure-secret-do-not-use-in-production',
  demoLoginEnabled: (process.env.DEMO_LOGIN_ENABLED || 'true').toLowerCase() !== 'false',
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiUrl: process.env.API_URL || 'http://localhost:4000',
  clientUrl,
  databaseUrl: process.env.DATABASE_URL || '',
  
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    environment,
    webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
    baseUrl: environment === 'production'
      ? (process.env.PAYPAL_PROD_API_BASE_URL || 'https://api-m.paypal.com')
      : (process.env.PAYPAL_API_BASE_URL || 'https://api-m.sandbox.paypal.com'),
    checkoutUrl: process.env.PAYPAL_CHECKOUT_URL || 'https://www.sandbox.paypal.com/checkoutnow',
    returnUrl: process.env.PAYPAL_RETURN_URL || `${clientUrl}/payment/success`,
    cancelUrl: process.env.PAYPAL_CANCEL_URL || `${clientUrl}/payment/cancel`,
  },

  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    provider: (process.env.AI_PROVIDER || 'auto').toLowerCase(),
  },

};

/**
 * Fail fast on unsafe or incomplete configuration. Called at startup (not in tests).
 * Returns warnings for things that are allowed but worth knowing about.
 */
export function validateConfig(): string[] {
  const warnings: string[] = [];
  const errors: string[] = [];
  const isProd = config.nodeEnv === 'production';

  if (!config.databaseUrl) errors.push('DATABASE_URL is required (PostgreSQL connection string).');
  else if (!/^postgres(ql)?:\/\//.test(config.databaseUrl)) errors.push('DATABASE_URL must be a postgresql:// URL.');

  if (config.paypal.environment !== 'sandbox') {
    errors.push('PAYPAL_ENVIRONMENT must be "sandbox". PayPilot refuses to process live payments.');
  }

  if (isProd) {
    if ((process.env.JWT_SECRET || '').length < 32) errors.push('JWT_SECRET must be set to a random string of at least 32 characters in production.');
    if (!process.env.CLIENT_URL) errors.push('CLIENT_URL is required in production (CORS and PayPal return URLs).');
    if (config.demoLoginEnabled) warnings.push('DEMO_LOGIN_ENABLED=true: anyone can sign in as the shared demo user. Fine for a hackathon demo; disable for real users.');
    if (!config.paypal.webhookId) warnings.push('PAYPAL_WEBHOOK_ID is not set: PayPal webhooks will be rejected (the redirect/capture flow still works).');
  }

  if (!process.env.PAYPAL_CLIENT_ID || /^your_|_here$/i.test(process.env.PAYPAL_CLIENT_ID)) warnings.push('PayPal Sandbox credentials are not set: checkout will return 503 until they are.');
  if (!config.ai.geminiApiKey && !config.ai.openaiApiKey) warnings.push('No LLM API key set: the AI Copilot uses the rule-based fallback (no agentic tool-calling).');

  if (errors.length) {
    throw new Error('Invalid configuration:\n - ' + errors.join('\n - '));
  }
  return warnings;
}
