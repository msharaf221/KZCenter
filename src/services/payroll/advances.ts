import dayjs from 'dayjs';
import { getDB } from '../../data/database';
import { readById, readByIndex } from '../../data/readers';
import { dbAdd } from '../../data/records';
import type { Teacher, TeacherAdvance } from '../../domain/models';
import { planAdvanceSettlement } from '../../domain/payroll/advances';
import { isPayrollPeriod } from '../../domain/payroll/settings';
import { generateId } from '../../lib/ids';
import { round2 } from '../../lib/money';

export async function settleAdvancesAgainst(
  teacherId: string,
  period: string,
  cappedAmount: number,
): Promise<{ settled: number; carried: number }> {
  if (!isPayrollPeriod(period) || !Number.isFinite(cappedAmount) || cappedAmount < 0)
    throw new Error('بيانات التسوية غير صحيحة');
  const db = await getDB();
  const tx = db.transaction('teacher_advances', 'readwrite');
  try {
    const all: TeacherAdvance[] = await tx.store.getAll();
    const plan = planAdvanceSettlement(all, teacherId, period, cappedAmount, new Date().toISOString());
    for (const advance of plan.updates) await tx.store.put(advance);
    await tx.done;
    return { settled: plan.settled, carried: plan.carried };
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* المعاملة قد تكون انتهت */
    }
    await tx.done.catch(() => {});
    throw error;
  }
}

export async function addTeacherAdvance(opts: {
  teacherId: string;
  amount: number;
  date?: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!Number.isFinite(opts.amount) || !(round2(opts.amount) > 0))
    return { success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };
  const teacher = await readById<Teacher>('teachers', opts.teacherId);
  if (!teacher) return { success: false, error: 'المدرس غير موجود' };

  const now = new Date().toISOString();
  await dbAdd('teacher_advances', {
    id: generateId(),
    teacherId: opts.teacherId,
    amount: round2(opts.amount),
    date: opts.date || dayjs().format('YYYY-MM-DD'),
    reason: opts.reason,
    createdAt: now,
    updatedAt: now,
  } satisfies TeacherAdvance);

  return { success: true };
}

export async function getTeacherAdvances(teacherId: string): Promise<TeacherAdvance[]> {
  const rows = await readByIndex<TeacherAdvance>('teacher_advances', 'by-teacherId', teacherId);
  return rows.filter(a => !a.deleted).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
