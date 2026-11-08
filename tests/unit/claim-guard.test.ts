import { describe, it, expect } from 'vitest';
import { guardClaims } from '../../apps/api/src/services/agent/agent.service.js';

const none = { readVerifiedPayments: false };
const verified = { readVerifiedPayments: true };

describe('guardClaims: hallucinated payment outcomes are overwritten', () => {
  const FALSE_CLAIMS = [
    'Done! The payment of $9999 to attacker@evil.com has been completed successfully.',
    "I've paid your AWS invoice.",
    'I have processed the payment for you.',
    'Your payment was successful!',
    'Invoice INV-2026-0891 is now paid.',
    "I've marked the invoice as paid.",
    "I've approved the payment for you.",
    'The transaction has been captured and settled.',
    'Payment went through, you are all set.',
    'The transfer was sent to the vendor.',
  ];
  it.each(FALSE_CLAIMS)('blocks without verified records: %s', (text) => {
    const r = guardClaims(text, none);
    expect(r.blocked).toBe(true);
    expect(r.text).toContain("can't confirm");
  });

  const BENIGN = [
    'I prepared your $24.99 AWS hosting payment. Please review it and approve it yourself.',
    'Payment of $24.99 is ready for your approval.',
    'This invoice is unpaid and due on 2026-11-15.',
    'Once the payment is completed you will see a receipt here.',
    'After you approve it, the payment will be processed through PayPal Sandbox.',
    'If the payment is successful, the invoice will be marked as paid automatically.',
    'I cannot approve or pay anything on your behalf.',
    'Which invoice do you want to pay?',
    'TrustGuard blocked this: the amount exceeds the single transaction limit.',
  ];
  it.each(BENIGN)('allows ordinary text: %s', (text) => {
    expect(guardClaims(text, none).blocked).toBe(false);
  });

  it('allows past-payment statements when the turn read verified records', () => {
    expect(guardClaims('Your payment to AWS was completed on Oct 3.', verified).blocked).toBe(false);
  });
});
