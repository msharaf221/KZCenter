import { generateId } from '../../lib/ids';
import { round2 } from '../../lib/money';
import type { TeacherAdvance } from '../models';

// ==================== ADVANCES ====================

/** خطة تسوية قابلة للتكرار، مع حفظ الجزء المخصوم من السلفة الجزئية كسجل مستقل. */
export function planAdvanceSettlement(
  all: TeacherAdvance[],
  teacherId: string,
  period: string,
  cap: number,
  now: string,
) {
  const own = all.filter(a => a.teacherId === teacherId && !a.deleted);
  const settledBefore = round2(own.filter(a => a.settledInPeriod === period).reduce((sum, a) => sum + a.amount, 0));
  const open = own
    .filter(a => !a.settledInPeriod && a.date?.slice(0, 7) <= period)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let left = round2(Math.max(0, cap - settledBefore));
  const needed = left;
  const updates: TeacherAdvance[] = [];
  for (const advance of open) {
    if (left <= 0) break;
    const amount = round2(advance.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const used = Math.min(amount, left);
    if (used === amount) {
      updates.push({ ...advance, settledInPeriod: period, updatedAt: now });
    } else {
      updates.push({ ...advance, amount: round2(amount - used), updatedAt: now });
      updates.push({
        ...advance,
        id: generateId(),
        amount: used,
        settledInPeriod: period,
        notes: `خصم جزئي من السلفة ${advance.id} — راتب ${period}`,
        createdAt: now,
        updatedAt: now,
      });
    }
    left = round2(left - used);
  }
  const settled = round2(needed - left);
  const carried = round2(own.filter(a => !a.settledInPeriod).reduce((sum, a) => sum + a.amount, 0) - settled);
  return { updates, settled, carried, uncovered: left };
}
