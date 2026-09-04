/**
 * ترقيم الإيصالات التسلسلي
 *
 * المشكلة القديمة: رقم الإيصال كان أول 6 حروف من UUID عشوائي
 * (`#${payment.id.substring(0,6)}`) — يعني مفيش تسلسل، مفيش طريقة تعرف بيها
 * إن إيصال اتلغى/ضاع، ومفيش مطابقة مع دفتر الإيصالات الورقي.
 *
 * الحل: عدّاد في IndexedDB (store: counters) + صيغة `PREFIX-YYYY-NNNN`.
 * - العدّاد بيبدأ من جديد كل سنة (prefix افتراضي = السنة الحالية).
 * - الترقيم ذرّي بقدر الإمكان في بيئة المتصفح (ترانزاكشن واحدة readwrite).
 */
import { getDB, generateId } from './db';
import type { Counter, Payment } from './db';
import { dayjs } from './utils';

const RECEIPT_COUNTER_PREFIX = 'receipt:';

export interface ReceiptNumberParts {
  prefix: string;
  year: number;
  seq: number;
}

/** صياغة رقم الإيصال: 2026-0007 أو KZ-2026-0007 لو فيه بادئة مخصصة */
export function formatReceiptNo(parts: ReceiptNumberParts): string {
  const seq = String(Math.max(0, Math.floor(parts.seq))).padStart(4, '0');
  const prefix = parts.prefix && parts.prefix.trim() ? `${parts.prefix.trim()}-` : '';
  return `${prefix}${parts.year}-${seq}`;
}

/** قراءة رقم إيصال لقطع غياره (للبحث/الفرز) */
export function parseReceiptNo(no: string): ReceiptNumberParts | null {
  const m = /^(?:(.+)-)?(\d{4})-(\d+)$/.exec(String(no || '').trim());
  if (!m) return null;
  return {
    prefix: m[1] || '',
    year: parseInt(m[2], 10),
    seq: parseInt(m[3], 10),
  };
}

function counterId(date: string, prefix?: string): string {
  const year = dayjs(date).year();
  const p = (prefix || '').trim();
  return `${RECEIPT_COUNTER_PREFIX}${p ? `${p}-` : ''}${year}`;
}

/**
 * حجز رقم الإيصال التالي لتاريخ معيّن.
 * @param date   تاريخ الدفعة (السنة بتحدد العدّاد)
 * @param prefix بادئة اختيارية من الإعدادات
 */
export async function nextReceiptNo(date: string, prefix?: string): Promise<string> {
  const db = await getDB();
  const id = counterId(date, prefix);
  const year = dayjs(date).year();

  // ترانزاكشن واحدة: قراية + زيادة + كتابة (من غير ما نسيب العدّاد يتسابق)
  const tx = db.transaction('counters', 'readwrite');
  const store = tx.objectStore('counters');
  const existing = (await store.get(id)) as Counter | undefined;
  const value = (existing?.value || 0) + 1;
  await store.put({
    id,
    value,
    updatedAt: new Date().toISOString(),
  } satisfies Counter);
  await tx.done;

  return formatReceiptNo({ prefix: prefix || '', year, seq: value });
}

/** آخر رقم إيصال مستخدم (للعرض في الإعدادات/التقارير) */
export async function peekReceiptNo(date: string, prefix?: string): Promise<string> {
  const db = await getDB();
  const existing = (await db.get('counters', counterId(date, prefix))) as Counter | undefined;
  return formatReceiptNo({
    prefix: prefix || '',
    year: dayjs(date).year(),
    seq: existing?.value || 0,
  });
}

/** تصحيح/تظبيط العدّاد يدوياً (لو الدفتر الورقي بدأ من رقم مختلف) */
export async function setReceiptCounter(date: string, value: number, prefix?: string): Promise<void> {
  const db = await getDB();
  await db.put('counters', {
    id: counterId(date, prefix),
    value: Math.max(0, Math.floor(value)),
    updatedAt: new Date().toISOString(),
  } satisfies Counter);
}

/**
 * ترقيم رجعي للدفعات القديمة اللي مفيهاش رقم إيصال.
 * بيرتّبهم بالتاريخ ثم وقت الإنشاء، ويديهم أرقام متسلسلة.
 */
export async function backfillReceiptNumbers(prefix?: string): Promise<number> {
  const db = await getDB();
  const payments = (await db.getAll('payments')) as Payment[];
  const missing = payments
    .filter(p => !p.deleted && !p.receiptNo)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));

  if (missing.length === 0) return 0;

  // نبدأ من أعلى رقم مستخدم فعلاً — من مصدرين:
  //  1) الأرقام المكتوبة على الدفعات
  //  2) العدّادات المخزّنة (مثلاً لو المسؤول ظبط العدّاد على 500 عشان يطابق الدفتر الورقي)
  // من غير المصدر التاني، الترقيم الرجعي كان ممكن يعيد أرقام اتحجزت قبل كده.
  const byYear = new Map<number, number>();
  for (const p of payments) {
    const parsed = p.receiptNo ? parseReceiptNo(p.receiptNo) : null;
    if (!parsed) continue;
    byYear.set(parsed.year, Math.max(byYear.get(parsed.year) || 0, parsed.seq));
  }
  const counters = (await db.getAll('counters')) as Counter[];
  const wantedPrefix = (prefix || '').trim();
  for (const c of counters) {
    if (!c.id.startsWith(RECEIPT_COUNTER_PREFIX)) continue;
    // شكل المعرّف: `receipt:2026` أو `receipt:KZ-2026`
    const tail = String(c.id).slice(RECEIPT_COUNTER_PREFIX.length);
    const sep = tail.lastIndexOf('-');
    const counterPrefix = sep === -1 ? '' : tail.slice(0, sep);
    const year = Number(sep === -1 ? tail : tail.slice(sep + 1));
    if (!Number.isFinite(year) || year < 1900 || year > 9999) continue;
    if (counterPrefix !== wantedPrefix) continue;   // عدّاد بادئة تانية ما يخصناش
    byYear.set(year, Math.max(byYear.get(year) || 0, c.value || 0));
  }

  let updated = 0;
  for (const p of missing) {
    const year = dayjs(p.date || p.createdAt).year();
    const seq = (byYear.get(year) || 0) + 1;
    byYear.set(year, seq);

    const receiptNo = formatReceiptNo({ prefix: prefix || '', year, seq });
    await db.put('payments', {
      ...p,
      receiptNo,
      method: p.method || 'cash',
      updatedAt: new Date().toISOString(),
    });
    await db.put('counters', {
      id: counterId(p.date || p.createdAt, prefix),
      value: seq,
      updatedAt: new Date().toISOString(),
    } satisfies Counter);
    updated++;
  }

  return updated;
}

export { generateId };
