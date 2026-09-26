/**
 * Money primitives. Every rupee, unit and NAV in the domain layer is a Decimal,
 * never a JavaScript number. Numbers only appear at the edges (JSON in/out).
 */
import Decimal from 'decimal.js';

/** Isolated Decimal constructor so no other code can change global precision/rounding. */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;

/** Mutual fund units are allotted to 3 decimal places (as on a CAS / RTA statement). */
export const UNIT_DP = 3;
/** Rupee amounts are held to the paisa. */
export const RUPEE_DP = 2;
/** Smallest purchase allowed. Real schemes have minimums too; this also blocks ₹1 spam trades. */
export const MIN_BUY_RUPEES = new Dec(100);

export function toDec(value: Decimal.Value | { toString(): string }): Dec {
  return new Dec(typeof value === 'object' ? value.toString() : value);
}

/** Serialise for JSON. Strings keep full precision; the UI decides how to round for display. */
export function money(value: Dec): string {
  return value.toFixed(RUPEE_DP);
}

export function unitsStr(value: Dec): string {
  return value.toFixed(UNIT_DP);
}
