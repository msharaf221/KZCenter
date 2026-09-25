import dayjs from 'dayjs';
import { getDB } from '../../data/database';
import { readAll, readByIndex } from '../../data/readers';
import type { Expense, PayrollRecord, TeacherAdvance } from '../../domain/models';
import { planAdvanceSettlement } from '../../domain/payroll/advances';
import { isPayrollPeriod, isPercentageModel, PAY_MODEL_LABEL } from '../../domain/payroll/settings';
import type { TeacherPayrollCalc } from '../../domain/payroll/types';
import { generateId } from '../../lib/ids';
import { round2 } from '../../lib/money';

// ==================== RECORDS ====================

/**
 * اعتماد كشف الشهر كلقطة ثابتة. إعادة الاعتماد لا تغيّر كشفاً سابقاً ولا تكرر السلف.
 * القراءة والكتابة داخل معاملة واحدة، حتى لو اعتُمد الشهر من تبويبين معاً.
 */
export async function savePayrollRecord(opts: {
  teacherId: string;
  period: string;
  calc: TeacherPayrollCalc;
  deductions?: number;
  notes?: string;
}): Promise<PayrollRecord> {
  if (!isPayrollPeriod(opts.period)) throw new Error('اختر شهراً صحيحاً');
  if (!opts.teacherId || opts.calc.teacherId !== opts.teacherId) throw new Error('الحساب لا يخص هذا المدرس');
  const gross = opts.calc.gross;
  const deductions = opts.deductions ?? opts.calc.deductions;
  const advances = opts.calc.advances;
  if (
    [gross, deductions, advances, opts.calc.base, opts.calc.rate].some(n => !Number.isFinite(n) || n < 0) ||
    !Object.prototype.hasOwnProperty.call(PAY_MODEL_LABEL, opts.calc.model) ||
    [gross, deductions, advances].some(n => Math.abs(round2(n) - n) > 0.000001) ||
    deductions + advances > gross + 0.001 ||
    (isPercentageModel(opts.calc.model) && opts.calc.rate > 100)
  ) {
    throw new Error('قيم المستحقات أو الخصومات غير صحيحة');
  }
  const db = await getDB();
  const tx = db.transaction(['payroll', 'teacher_advances'], 'readwrite');
  try {
    const records: PayrollRecord[] = await tx
      .objectStore('payroll')
      .index('by-teacherPeriod')
      .getAll([opts.teacherId, opts.period]);
    const existing = records.find(r => !r.deleted);
    if (existing) {
      await tx.done;
      return existing;
    }
    const now = new Date().toISOString();
    const net = round2(gross - deductions - advances);
    const record: PayrollRecord = {
      // معرّف ثابت يمنع تكرار الكشف عند دمج النسخ السحابية أيضاً.
      id: `payroll:${encodeURIComponent(opts.teacherId)}:${opts.period}`,
      teacherId: opts.teacherId,
      teacherName: opts.calc.teacherName,
      period: opts.period,
      model: opts.calc.model,
      rate: opts.calc.rate,
      base: opts.calc.base,
      baseLabel: opts.calc.baseLabel,
      gross: round2(gross),
      deductions: round2(deductions),
      advances: round2(advances),
      net,
      paidAmount: 0,
      status: net === 0 ? 'paid' : 'pending',
      lines: opts.calc.lines,
      notes: opts.notes?.trim(),
      createdAt: now,
      updatedAt: now,
    };
    // السلف تخصم عند الاعتماد، فلا تُحجز لنفس المدرس في شهرين قبل الصرف.
    const allAdvances: TeacherAdvance[] = await tx.objectStore('teacher_advances').getAll();
    const settlement = planAdvanceSettlement(allAdvances, opts.teacherId, opts.period, record.advances, now);
    if (settlement.uncovered > 0) throw new Error('تغيّرت السلف؛ حدّث البيانات وراجع الحساب قبل الاعتماد');
    for (const advance of settlement.updates) await tx.objectStore('teacher_advances').put(advance);
    await tx.objectStore('payroll').put(record);
    await tx.done;
    return record;
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

export async function findPayrollRecord(teacherId: string, period: string): Promise<PayrollRecord | null> {
  try {
    const rows = await readByIndex<PayrollRecord>('payroll', 'by-teacherPeriod', [teacherId, period]);
    return rows.find(r => !r.deleted) || null;
  } catch {
    const all = await readAll<PayrollRecord>('payroll');
    return all.find(r => !r.deleted && r.teacherId === teacherId && r.period === period) || null;
  }
}

export async function getPayrollForPeriod(period: string): Promise<PayrollRecord[]> {
  if (!isPayrollPeriod(period)) throw new Error('اختر شهراً صحيحاً');
  const db = await getDB();
  const rows = (await db.getAllFromIndex('payroll', 'by-period', period)) as PayrollRecord[];
  return rows.filter(r => !r.deleted).sort((a, b) => b.net - a.net);
}

/**
 * صرف راتب (كلي أو جزئي) — بيسجّل سند صرف في المصروفات تلقائياً
 * عشان الأرباح والخسائر تبقى صحيحة من غير إدخال يدوي.
 */
export async function payPayroll(opts: {
  payrollId: string;
  amount?: number;
  date?: string;
  userId?: string;
  username?: string;
  autoExpense?: boolean;
}): Promise<{ success: boolean; error?: string; record?: PayrollRecord; expenseId?: string }> {
  const date = opts.date ?? dayjs().format('YYYY-MM-DD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !dayjs(date).isValid() || dayjs(date).format('YYYY-MM-DD') !== date) {
    return { success: false, error: 'تاريخ الصرف غير صحيح' };
  }
  if (
    opts.amount !== undefined &&
    (!Number.isFinite(opts.amount) ||
      opts.amount <= 0 ||
      round2(opts.amount) <= 0 ||
      Math.abs(round2(opts.amount) - opts.amount) > 0.000001)
  ) {
    return { success: false, error: 'أدخل مبلغ صرف صحيحاً أكبر من صفر بمنزلتين عشريتين بحد أقصى' };
  }
  const db = await getDB();
  const tx = db.transaction(['payroll', 'expenses', 'teacher_advances'], 'readwrite');
  try {
    const record: PayrollRecord | undefined = await tx.objectStore('payroll').get(opts.payrollId);
    if (!record || record.deleted) throw new Error('سجل الراتب غير موجود');
    const remaining = round2(record.net - record.paidAmount);
    if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('الراتب مدفوع بالكامل بالفعل');
    const amount = opts.amount === undefined ? remaining : round2(opts.amount);
    if (amount > remaining) throw new Error('مبلغ الصرف أكبر من المتبقي للمدرس');
    const now = new Date().toISOString();
    const paidAmount = round2(record.paidAmount + amount);
    const expenseId = opts.autoExpense === false ? undefined : generateId();
    const updated: PayrollRecord = {
      ...record,
      paidAmount,
      status: paidAmount >= record.net ? 'paid' : 'partial',
      expenseId: expenseId || record.expenseId,
      updatedAt: now,
    };
    if (expenseId) {
      await tx.objectStore('expenses').add({
        id: expenseId,
        category: 'salaries',
        amount,
        description: `راتب ${record.teacherName} — ${record.period}`,
        date,
        teacherId: record.teacherId,
        payrollId: record.id,
        userId: opts.userId,
        username: opts.username,
        method: 'cash',
        createdAt: now,
        updatedAt: now,
      } satisfies Expense);
    }
    // توافق مع كشوف قديمة كانت تسوّي السلف عند اكتمال الصرف.
    if (updated.status === 'paid' && record.advances > 0) {
      const all: TeacherAdvance[] = await tx.objectStore('teacher_advances').getAll();
      const settlement = planAdvanceSettlement(all, record.teacherId, record.period, record.advances, now);
      if (settlement.uncovered > 0) throw new Error('بيانات السلف غير مكتملة؛ راجعها قبل صرف الكشف');
      for (const advance of settlement.updates) await tx.objectStore('teacher_advances').put(advance);
    }
    await tx.objectStore('payroll').put(updated);
    await tx.done;
    return { success: true, record: updated, expenseId };
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* المعاملة قد تكون انتهت */
    }
    await tx.done.catch(() => {});
    return { success: false, error: error instanceof Error ? error.message : 'تعذّر صرف الراتب' };
  }
}
