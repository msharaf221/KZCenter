/**
 * تنبيهات المديونيات — كاش مشترك + اشتراك،
 * عشان السايدبار والداشبورد يوروا نفس الرقم من غير ما كل واحد يحسب من الصفر.
 */
import { getDebtors } from './db';

export interface DebtAlert {
  debtorsCount: number;
  totalRemaining: number;
  overdueCount: number;
  overdueAmount: number;
}

const EMPTY: DebtAlert = { debtorsCount: 0, totalRemaining: 0, overdueCount: 0, overdueAmount: 0 };

let cache: DebtAlert = EMPTY;
let lastRefreshAt = 0;
let inFlight: Promise<DebtAlert> | null = null;
const listeners = new Set<(a: DebtAlert) => void>();

/** أقل مدة بين حسبتين (السايدبار بيتعمله mount مع كل تنقّل بين الصفحات) */
const THROTTLE_MS = 60_000;

export function getDebtAlert(): DebtAlert {
  return cache;
}

export function subscribeDebtAlert(fn: (a: DebtAlert) => void): () => void {
  listeners.add(fn);
  fn(cache);
  return () => { listeners.delete(fn); };
}

function publish(next: DebtAlert) {
  cache = next;
  lastRefreshAt = Date.now();
  listeners.forEach(fn => fn(next));
}

/**
 * إعادة حساب تنبيهات المديونيات.
 * @param force تجاهل الـ throttle (بعد تحصيل دفعة مثلاً)
 */
export async function refreshDebtAlert(force = false): Promise<DebtAlert> {
  if (!force && Date.now() - lastRefreshAt < THROTTLE_MS) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const rows = await getDebtors();
      const next: DebtAlert = {
        debtorsCount: rows.length,
        totalRemaining: rows.reduce((s, d) => s + d.remaining, 0),
        overdueCount: rows.reduce((s, d) => s + d.overdueCount, 0),
        overdueAmount: rows.reduce((s, d) => s + d.overdueAmount, 0),
      };
      publish(next);
      return next;
    } catch (e) {
      console.error('refreshDebtAlert error:', e);
      return cache;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
