import type { Settings } from '../models';

export interface BillingPolicy {
  dueDayOfMonth?: number;
  graceDays: number;
  sessionsPerMonth: number;
  receiptPrefix?: string;
}

export function billingPolicy(s: Settings): BillingPolicy {
  return {
    dueDayOfMonth: s.dueDayOfMonth && s.dueDayOfMonth >= 1 && s.dueDayOfMonth <= 28
      ? s.dueDayOfMonth
      : undefined,
    graceDays: Math.max(0, s.graceDays || 0),
    sessionsPerMonth: s.sessionsPerMonth && s.sessionsPerMonth > 0 ? s.sessionsPerMonth : 8,
    receiptPrefix: s.receiptPrefix?.trim() || undefined,
  };
}
