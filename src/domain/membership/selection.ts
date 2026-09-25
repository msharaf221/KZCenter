import { requireRule } from '../errors';

const sameIds = (a: readonly string[], b: readonly string[]) => new Set(a).size === new Set(b).size && a.every(id => b.includes(id));

/** A profile-only edit preserves newer memberships. Actual membership edits require the reviewed baseline. */
export function membershipSelection(current: string[], requested: string[], baseline?: string[]): string[] {
  requireRule(Array.isArray(requested) && requested.every(id => typeof id === 'string' && !!id.trim()), 'المجموعات غير صحيحة');
  if (baseline !== undefined) {
    requireRule(Array.isArray(baseline) && baseline.every(id => typeof id === 'string' && !!id.trim()), 'المجموعات الأصلية غير صحيحة');
    if (sameIds(requested, baseline)) return [...new Set(current)];
    requireRule(sameIds(current, baseline), 'تسجيلات الطالب اتغيرت أثناء التعديل. أعد تحميل القائمة وافتح النموذج من جديد');
  }
  return [...new Set(requested)];
}
