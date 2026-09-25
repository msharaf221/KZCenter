import dayjs from 'dayjs';

export const RECEIPT_COUNTER_PREFIX = 'receipt:';

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

export function counterId(date: string, prefix?: string): string {
  const year = dayjs(date).year();
  const p = (prefix || '').trim();
  return `${RECEIPT_COUNTER_PREFIX}${p ? `${p}-` : ''}${year}`;
}
