/**
 * الخزينة والصندوق (Cash Box) — التقفيل اليومي ومطابقة النقدية
 *
 * السؤال اللي صاحب المركز بيسأله كل يوم:
 *   «محصّل النهاردة كام؟ من مين؟ بأنهي طريقة؟ والمفروض في الدرج كام؟»
 *
 * الوحدة الأساسية هنا `CashSession` (وردية/يوم):
 *   رصيد أول المدة + محصّل نقدي − استردادات − مصروفات نقدية = **المفروض في الدرج**
 *   المستخدم يعدّ الدرج → **المعدود فعلياً** → الفرق (عجز/زيادة).
 */
import dayjs from 'dayjs';
import {
  dbAdd, dbGetAll, dbGetById, dbGetByIndex, dbPut, generateId,
  CashSession, Expense, Payment, PaymentMethod, Refund, isCountedPayment,
} from './db';

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'نقدي',
  wallet: 'محفظة (فودافون كاش وغيرها)',
  instapay: 'إنستاباي',
  card: 'فيزا / POS',
  bank: 'تحويل بنكي',
  other: 'أخرى',
};

export const METHOD_ORDER: PaymentMethod[] = ['cash', 'wallet', 'instapay', 'card', 'bank', 'other'];

export interface DayTotals {
  date: string;
  /** إجمالي المحصّل (كل الطرق) */
  collected: number;
  /** تفصيل بكل طريقة */
  byMethod: Record<PaymentMethod, number>;
  /** عدد الدفعات */
  paymentsCount: number;
  /** استردادات اليوم */
  refunds: number;
  /** مصروفات اليوم (كلها) */
  expenses: number;
  /** مصروفات اليوم النقدية (بتخرج من الدرج) */
  cashExpenses: number;
  /** المفروض في الدرج آخر اليوم */
  expectedCash: number;
  /** تحصيل كل موظف */
  byCollector: { userId?: string; name: string; amount: number; count: number }[];
}

const ZERO_METHODS = (): Record<PaymentMethod, number> => ({
  cash: 0, wallet: 0, instapay: 0, card: 0, bank: 0, other: 0,
});

/**
 * إجماليات يوم معيّن — دالة نقية (بتاخد الصفوف جاهزة) عشان تبقى قابلة للاختبار.
 */
export function computeDayTotals(opts: {
  date: string;
  payments: Payment[];
  refunds: Refund[];
  expenses: Expense[];
  openingBalance?: number;
}): DayTotals {
  const { date, payments, refunds, expenses } = opts;
  const byMethod = ZERO_METHODS();
  const byCollector = new Map<string, { userId?: string; name: string; amount: number; count: number }>();

  let collected = 0;
  let paymentsCount = 0;

  for (const p of payments) {
    if (!isCountedPayment(p)) continue;
    if ((p.date || '') !== date) continue;

    const amount = Number(p.amount) || 0;
    collected += amount;
    paymentsCount++;

    const method: PaymentMethod = (p.method || 'cash') as PaymentMethod;
    byMethod[method] = round2((byMethod[method] || 0) + amount);

    const key = p.collectedBy || 'unknown';
    const entry = byCollector.get(key) || {
      userId: p.collectedBy,
      name: p.collectedByName || (p.collectedBy ? 'مستخدم' : 'غير محدد'),
      amount: 0,
      count: 0,
    };
    entry.amount = round2(entry.amount + amount);
    entry.count += 1;
    byCollector.set(key, entry);
  }

  const refundsTotal = round2(refunds
    .filter(r => !r.deleted && (r.date || '') === date)
    .reduce((s, r) => s + (r.amount || 0), 0));

  const dayExpenses = expenses.filter(e => !e.deleted && (e.date || '') === date);
  const expensesTotal = round2(dayExpenses.reduce((s, e) => s + (e.amount || 0), 0));
  // المصروف النقدي = اللي دفعته كاش (غير النقدي بيعتبر كاش لو طريقة الدفع مش محددة)
  const cashExpenses = round2(dayExpenses
    .filter(e => !e.method || e.method === 'cash')
    .reduce((s, e) => s + (e.amount || 0), 0));

  const expectedCash = round2(
    (opts.openingBalance || 0) + byMethod.cash - refundsTotal - cashExpenses,
  );

  return {
    date,
    collected: round2(collected),
    byMethod,
    paymentsCount,
    refunds: refundsTotal,
    expenses: expensesTotal,
    cashExpenses,
    expectedCash,
    byCollector: Array.from(byCollector.values()).sort((a, b) => b.amount - a.amount),
  };
}

/** إجماليات يوم من القاعدة */
export async function getDayTotals(date: string, openingBalance = 0): Promise<DayTotals> {
  const [payments, refunds, expenses] = await Promise.all([
    dbGetAll<Payment>('payments'),
    dbGetAll<Refund>('refunds'),
    dbGetAll<Expense>('expenses'),
  ]);
  return computeDayTotals({ date, payments, refunds, expenses, openingBalance });
}

// ==================== SESSIONS ====================

export async function getCashSessionByDate(date: string): Promise<CashSession | null> {
  try {
    const rows = await dbGetByIndex<CashSession>('cashbox_sessions', 'by-date', date);
    return rows.find(s => !s.closedAt) || rows[rows.length - 1] || null;
  } catch {
    const all = await dbGetAll<CashSession>('cashbox_sessions');
    return all.find(s => s.date === date) || null;
  }
}

export async function openCashSession(opts: {
  date?: string;
  openingBalance: number;
  userId?: string;
  username?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string; session?: CashSession }> {
  const date = opts.date || dayjs().format('YYYY-MM-DD');
  const existing = await getCashSessionByDate(date);
  if (existing && existing.status === 'open') {
    return { success: false, error: 'فيه وردية مفتوحة بالفعل لليوم ده' };
  }

  const now = new Date().toISOString();
  const session: CashSession = {
    id: generateId(),
    date,
    status: 'open',
    openedAt: now,
    openedBy: opts.userId,
    openedByName: opts.username,
    openingBalance: round2(Math.max(0, opts.openingBalance || 0)),
    notes: opts.notes,
    createdAt: now,
    updatedAt: now,
  };
  await dbAdd('cashbox_sessions', session);
  return { success: true, session };
}

export interface CloseResult {
  success: boolean;
  error?: string;
  session?: CashSession;
  expectedCash?: number;
  countedCash?: number;
  difference?: number;
}

/** تقفيل وردية: يحسب المفروض، بياخد المعدود، ويسجّل الفرق */
export async function closeCashSession(opts: {
  sessionId: string;
  countedCash: number;
  userId?: string;
  username?: string;
  notes?: string;
}): Promise<CloseResult> {
  const session = await dbGetById<CashSession>('cashbox_sessions', opts.sessionId);
  if (!session) return { success: false, error: 'الوردية غير موجودة' };
  if (session.status === 'closed') return { success: false, error: 'الوردية متقفلة بالفعل' };

  const totals = await getDayTotals(session.date, session.openingBalance);
  const counted = round2(Math.max(0, opts.countedCash || 0));
  const difference = round2(counted - totals.expectedCash);
  const now = new Date().toISOString();

  const updated: CashSession = {
    ...session,
    status: 'closed',
    closedAt: now,
    closedBy: opts.userId,
    closedByName: opts.username,
    expectedCash: totals.expectedCash,
    countedCash: counted,
    difference,
    byMethod: totals.byMethod,
    notes: opts.notes ?? session.notes,
    updatedAt: now,
  };
  await dbPut('cashbox_sessions', updated);

  return {
    success: true,
    session: updated,
    expectedCash: totals.expectedCash,
    countedCash: counted,
    difference,
  };
}

/** سجل الورديات (للمتابعة والمراجعة) */
export async function getCashSessions(limit = 60): Promise<CashSession[]> {
  const rows = await dbGetAll<CashSession>('cashbox_sessions');
  return rows
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.openedAt || '').localeCompare(a.openedAt || ''))
    .slice(0, limit);
}

/** ملخص فترة (للتقارير) */
export async function summarizePeriod(from: string, to: string): Promise<{
  collected: number;
  byMethod: Record<PaymentMethod, number>;
  refunds: number;
  expenses: number;
  net: number;
  paymentsCount: number;
}> {
  const [payments, refunds, expenses] = await Promise.all([
    dbGetAll<Payment>('payments'),
    dbGetAll<Refund>('refunds'),
    dbGetAll<Expense>('expenses'),
  ]);

  const byMethod = ZERO_METHODS();
  let collected = 0;
  let paymentsCount = 0;

  for (const p of payments) {
    if (!isCountedPayment(p)) continue;
    if ((p.date || '') < from || (p.date || '') > to) continue;
    collected += Number(p.amount) || 0;
    paymentsCount++;
    const m = (p.method || 'cash') as PaymentMethod;
    byMethod[m] = round2((byMethod[m] || 0) + (Number(p.amount) || 0));
  }

  const refundsTotal = round2(refunds
    .filter(r => !r.deleted && (r.date || '') >= from && (r.date || '') <= to)
    .reduce((s, r) => s + (r.amount || 0), 0));
  const expensesTotal = round2(expenses
    .filter(e => !e.deleted && (e.date || '') >= from && (e.date || '') <= to)
    .reduce((s, e) => s + (e.amount || 0), 0));

  return {
    collected: round2(collected),
    byMethod,
    refunds: refundsTotal,
    expenses: expensesTotal,
    net: round2(collected - refundsTotal - expensesTotal),
    paymentsCount,
  };
}

function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}
