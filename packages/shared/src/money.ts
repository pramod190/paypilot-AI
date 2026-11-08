/**
 * Money helpers. All monetary arithmetic and comparison in PayPilot happens on INTEGER MINOR UNITS
 * (cents). Decimal strings are parsed with string operations, never floating-point multiplication.
 * Every currency in SupportedCurrencies (USD, EUR, GBP, CAD, AUD) has 2 minor-unit digits.
 */

export const MINOR_UNIT_DIGITS = 2;
/** Single-transaction policy limit: $10,000.00 */
export const MAX_SINGLE_PAYMENT_MINOR = 1_000_000;

/** Parse "24.99" / 24.99 / "25" into integer minor units. Throws on more than 2 decimals or non-numeric input. */
export function toMinor(value: number | string): number {
  const raw = typeof value === 'number' ? numberToPlainString(value) : value.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw new Error(`Invalid monetary amount: ${String(value)}`);
  const [, sign, whole, frac = ''] = match;
  if (frac.length > MINOR_UNIT_DIGITS && /[1-9]/.test(frac.slice(MINOR_UNIT_DIGITS))) {
    throw new Error(`Amount must have at most ${MINOR_UNIT_DIGITS} decimal places: ${raw}`);
  }
  const minor = parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  return sign ? -minor : minor;
}

/** Exact decimal string for a JS number without exponent notation (e.g. 1e-7 -> "0.0000001"). */
function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) throw new Error('Amount must be a finite number');
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
}

/** 2499 -> "24.99" (exact, integer-only string formatting). Use this for PayPal "value" fields. */
export function formatMinor(minor: number): string {
  if (!Number.isInteger(minor)) throw new Error('Minor-unit amounts must be integers');
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Display-only conversion for UI/JSON convenience. Never use the result for arithmetic or comparison. */
export function minorToDisplay(minor: number): number {
  return minor / 100;
}
