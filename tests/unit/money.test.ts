import { describe, it, expect } from 'vitest';
import { toMinor, formatMinor, MoneyAmountSchema, MAX_SINGLE_PAYMENT_MINOR } from '@paypilot/shared';

describe('Integer minor-unit money (no floating-point arithmetic)', () => {
  it('converts decimals exactly, including values that break float math', () => {
    expect(toMinor(24.99)).toBe(2499);
    expect(toMinor('24.99')).toBe(2499);
    expect(toMinor(Number((0.1 + 0.2).toFixed(2)))).toBe(30);
    expect(toMinor(1.1)).toBe(110);
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor('0.07')).toBe(7);
    expect(toMinor(100)).toBe(10000);
    expect(toMinor(-5)).toBe(-500);
  });

  it('rejects sub-cent precision and malformed values instead of rounding silently', () => {
    expect(() => toMinor(0.1 + 0.2)).toThrow(); // 0.30000000000000004: float noise is refused, never rounded away
    expect(() => toMinor(1.005)).toThrow();
    expect(() => toMinor('12.345')).toThrow();
    expect(() => toMinor('abc')).toThrow();
    expect(() => toMinor('')).toThrow();
    expect(() => toMinor(NaN)).toThrow();
    expect(() => toMinor(Infinity)).toThrow();
    expect(toMinor('12.340')).toBe(1234); // trailing zeros are not extra precision
  });

  it('formats back to exact decimal strings for PayPal', () => {
    expect(formatMinor(2499)).toBe('24.99');
    expect(formatMinor(7)).toBe('0.07');
    expect(formatMinor(10000)).toBe('100.00');
    expect(formatMinor(0)).toBe('0.00');
    expect(formatMinor(-250)).toBe('-2.50');
    expect(() => formatMinor(1.5)).toThrow();
  });

  it('round-trips every cent value exactly', () => {
    for (let c = 0; c <= 200000; c += 7) {
      expect(toMinor(formatMinor(c))).toBe(c);
    }
  });

  it('API amount schema enforces positivity, 2 decimals and the $10,000 limit', () => {
    expect(MoneyAmountSchema.safeParse(24.99).success).toBe(true);
    expect(MoneyAmountSchema.safeParse(0).success).toBe(false);
    expect(MoneyAmountSchema.safeParse(-1).success).toBe(false);
    expect(MoneyAmountSchema.safeParse(1.234).success).toBe(false);
    expect(MoneyAmountSchema.safeParse(10000).success).toBe(true);
    expect(MoneyAmountSchema.safeParse(10000.01).success).toBe(false);
    expect(MAX_SINGLE_PAYMENT_MINOR).toBe(1_000_000);
  });
});
