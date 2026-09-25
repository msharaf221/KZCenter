/** Shared two-decimal rounding. Kept identical to existing billing calculations. */
export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}
