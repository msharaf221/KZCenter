import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as ids from '../lib/ids';
import { dbAdd, dbClearStore, dbGetAll, dbGetById, dbPut, dbSoftDelete, exportAllData, type Expense, type PayrollRecord, type Teacher, type TeacherAdvance } from '../lib/db';
import { addTeacherAdvance, calcGroupProfitability, calcTeacherPayroll, getPayrollForPeriod, loadPayrollContext, payPayroll, savePayrollRecord, settleAdvancesAgainst, updateTeacherPaySettings } from '../lib/payroll';
import { seedPayroll, payrollInstallment, PAYROLL_PERIOD as period, PAYROLL_NOW as now } from './helpers/payroll';

beforeEach(async () => {
  vi.restoreAllMocks();
  for (const store of ['teachers', 'groups', 'students', 'installments', 'enrollments', 'payments', 'attendance', 'teacher_advances', 'payroll', 'expenses'] as const) {
    await dbClearStore(store);
  }
});

async function approve(teacher?: Teacher) {
  const context = await loadPayrollContext(period);
  const t = teacher || context.teachers[0];
  const calc = calcTeacherPayroll(t, period, context);
  return savePayrollRecord({ teacherId: t.id, period, calc });
}

describe('اعتماد كشف المرتبات وحفظ التاريخ', () => {
  it('يحفظ النسبة ونصيب كل طالب دون إضافة مصروف حتى الصرف', async () => {
    await seedPayroll();
    const record = await approve();
    expect(record.rate).toBe(60);
    expect(record.gross).toBe(120);
    expect(record.status).toBe('pending');
    expect(record.paidAmount).toBe(0);
    expect(record.lines?.[0].students?.[0]).toMatchObject({ subscriptionAmount: 200, rate: 60, amount: 120 });
    expect(await dbGetAll('expenses')).toEqual([]);
    expect(await getPayrollForPeriod('2026-08')).toEqual([]);
  });

  it('لا يعيد حساب الكشف المعتمد بعد تعديل النسبة أو سعر الاشتراك، ولا يفقد المصروف', async () => {
    const teacher = await seedPayroll();
    const first = await approve();
    await payPayroll({ payrollId: first.id, amount: 50 });
    await updateTeacherPaySettings(teacher.id, { payModel: 'subscription_percentage', salary: 0, payRate: 30 });
    const installments = await dbGetAll('installments');
    await dbPut('installments', { ...installments[0], amount: 999 });
    const again = await approve();
    expect(again.id).toBe(first.id);
    expect(again.rate).toBe(60);
    expect(again.gross).toBe(120);
    expect(again.paidAmount).toBe(50);
    expect(again.status).toBe('partial');
    expect(again.lines).toEqual(first.lines);
  });

  it('الاعتماد المتزامن ينتج كشفاً واحداً فقط', async () => {
    await seedPayroll();
    const context = await loadPayrollContext(period);
    const calc = calcTeacherPayroll(context.teachers[0], period, context);
    const options = { teacherId: calc.teacherId, period, calc };
    const records = await Promise.all([savePayrollRecord(options), savePayrollRecord(options)]);
    expect(records[0].id).toBe(records[1].id);
    expect(await getPayrollForPeriod(period)).toHaveLength(1);
  });

  it('حذف المدرس لا يحذف الكشف المعتمد أو بياناته من النسخة الاحتياطية', async () => {
    const teacher = await seedPayroll();
    const record = await approve();
    await dbSoftDelete('teachers', teacher.id);
    expect((await getPayrollForPeriod(period))[0].teacherName).toBe(teacher.name);
    const backup = await exportAllData() as { payroll: PayrollRecord[] };
    expect(backup.payroll).toContainEqual(record);
  });

  it('يرفض قيم حساب غير صالحة أو مدرساً لا يخص الحساب', async () => {
    await seedPayroll();
    const context = await loadPayrollContext(period);
    const calc = calcTeacherPayroll(context.teachers[0], period, context);
    await expect(savePayrollRecord({ teacherId: 'different', period, calc })).rejects.toThrow('الحساب لا يخص');
    await expect(savePayrollRecord({ teacherId: calc.teacherId, period, calc: { ...calc, gross: Infinity } })).rejects.toThrow();
    await expect(savePayrollRecord({ teacherId: calc.teacherId, period, calc, deductions: 121 })).rejects.toThrow();
    await expect(savePayrollRecord({ teacherId: calc.teacherId, period: '2026-13', calc })).rejects.toThrow();
    expect(await dbGetAll('payroll')).toHaveLength(0);
  });
});

describe('صرف الرواتب وسندات المصروفات', () => {
  it('صرف جزئي ثم الباقي، بسند مستقل لكل دفعة وبالمبلغ الفعلي فقط', async () => {
    await seedPayroll();
    const record = await approve();
    const first = await payPayroll({ payrollId: record.id, amount: 50, date: '2026-10-02', userId: 'accountant', username: 'محاسب' });
    expect(first.success).toBe(true);
    expect(first.record).toMatchObject({ paidAmount: 50, status: 'partial', net: 120 });
    const second = await payPayroll({ payrollId: record.id, amount: 70, date: '2026-10-03' });
    expect(second.record).toMatchObject({ paidAmount: 120, status: 'paid' });
    const expenses = await dbGetAll<Expense>('expenses');
    expect(expenses).toHaveLength(2);
    expect(expenses.reduce((sum, e) => sum + e.amount, 0)).toBe(120);
    expect(expenses.every(e => e.payrollId === record.id && e.category === 'salaries' && e.teacherId === record.teacherId)).toBe(true);
    expect(expenses.find(e => e.id === first.expenseId)).toMatchObject({ date: '2026-10-02', amount: 50, username: 'محاسب', method: 'cash' });
  });

  it.each([0, -1, NaN, Infinity, 121, 0.001, 1.001])('يرفض مبلغ %s دون تحويله لصرف كامل أو قصّه للمتبقي', async amount => {
    await seedPayroll();
    const record = await approve();
    expect((await payPayroll({ payrollId: record.id, amount })).success).toBe(false);
    expect((await dbGetById<PayrollRecord>('payroll', record.id))?.paidAmount).toBe(0);
    expect(await dbGetAll('expenses')).toHaveLength(0);
  });

  it('الصرف الكامل المتزامن لا يتكرر ولا يكرر المصروف', async () => {
    await seedPayroll();
    const record = await approve();
    const results = await Promise.all([payPayroll({ payrollId: record.id }), payPayroll({ payrollId: record.id })]);
    expect(results.filter(r => r.success)).toHaveLength(1);
    expect(await dbGetAll('expenses')).toHaveLength(1);
    expect((await dbGetById<PayrollRecord>('payroll', record.id))?.paidAmount).toBe(120);
  });

  it('صرفان جزئيان متزامنان لا يتجاوزان الرصيد', async () => {
    await seedPayroll();
    const record = await approve();
    const results = await Promise.all([
      payPayroll({ payrollId: record.id, amount: 80 }), payPayroll({ payrollId: record.id, amount: 80 }),
    ]);
    expect(results.filter(r => r.success)).toHaveLength(1);
    expect((await dbGetById<PayrollRecord>('payroll', record.id))?.paidAmount).toBe(80);
    expect(await dbGetAll('expenses')).toHaveLength(1);
  });

  it('فشل كتابة المصروف لا يترك الكشف مدفوعاً دون سند', async () => {
    await seedPayroll();
    const record = await approve();
    await dbAdd<Expense>('expenses', { id: 'existing-expense', category: 'other', amount: 1, description: 'تجريبي', date: '2026-09-01', createdAt: now, updatedAt: now });
    vi.spyOn(ids, 'generateId').mockReturnValue('existing-expense');
    expect((await payPayroll({ payrollId: record.id, amount: 50 })).success).toBe(false);
    expect((await dbGetById<PayrollRecord>('payroll', record.id))?.paidAmount).toBe(0);
    expect(await dbGetAll('expenses')).toHaveLength(1);
  });

  it.each(['', '2026-02-30', 'invalid'])('يرفض تاريخ صرف غير صالح %s', async date => {
    await seedPayroll();
    const record = await approve();
    expect((await payPayroll({ payrollId: record.id, date })).success).toBe(false);
    expect(await dbGetAll('expenses')).toHaveLength(0);
  });

  it('لا يصرف كشفاً محذوفاً أو غير موجود', async () => {
    await seedPayroll();
    const record = await approve();
    await dbSoftDelete('payroll', record.id);
    expect((await payPayroll({ payrollId: record.id })).success).toBe(false);
    expect((await payPayroll({ payrollId: 'missing' })).success).toBe(false);
  });
});

describe('السلف لا تتكرر عند الاعتماد أو الصرف', () => {
  it('يخصم السلفة عند الاعتماد ولا يكررها عند صرف الراتب', async () => {
    const teacher = await seedPayroll();
    await addTeacherAdvance({ teacherId: teacher.id, amount: 50, date: '2026-09-01' });
    const record = await approve();
    expect(record.net).toBe(70);
    const advances = await dbGetAll<TeacherAdvance>('teacher_advances');
    expect(advances[0].settledInPeriod).toBe(period);
    expect((await payPayroll({ payrollId: record.id })).success).toBe(true);
    expect(await dbGetAll('teacher_advances')).toEqual(advances);
    expect(calcTeacherPayroll(teacher, '2026-10', await loadPayrollContext('2026-10')).advances).toBe(0);
  });

  it('سلفة واحدة أكبر من الراتب: تحفظ الجزء المخصوم وترحّل المتبقي دون خصم مكرر', async () => {
    const teacher = await seedPayroll();
    await addTeacherAdvance({ teacherId: teacher.id, amount: 500, date: '2026-09-01' });
    const record = await approve();
    expect(record).toMatchObject({ advances: 120, net: 0, status: 'paid' });
    const before = await dbGetAll<TeacherAdvance>('teacher_advances');
    expect(before.filter(a => !a.settledInPeriod).reduce((s, a) => s + a.amount, 0)).toBe(380);
    expect(before.filter(a => a.settledInPeriod === period).reduce((s, a) => s + a.amount, 0)).toBe(120);
    expect(await settleAdvancesAgainst(teacher.id, period, 120)).toEqual({ settled: 0, carried: 380 });
    expect(await dbGetAll('teacher_advances')).toEqual(before);
  });
});

describe('تعديل النسبة فقط', () => {
  it('يحدّث الحقول المالية دون الكتابة فوق بيانات المدرس الحديثة', async () => {
    const teacher = await seedPayroll();
    await dbPut('teachers', { ...teacher, name: 'اسم أحدث', notes: 'ملاحظات أكاديمية' });
    await updateTeacherPaySettings(teacher.id, { ...teacher, payRate: 35.5 });
    expect(await dbGetById('teachers', teacher.id)).toMatchObject({ name: 'اسم أحدث', notes: 'ملاحظات أكاديمية', payRate: 35.5 });
  });

  it('يرفض نسبة غير صحيحة ويحافظ على النسبة السابقة', async () => {
    const teacher = await seedPayroll();
    await expect(updateTeacherPaySettings(teacher.id, { ...teacher, payRate: 101 })).rejects.toThrow();
    expect((await dbGetById<Teacher>('teachers', teacher.id))?.payRate).toBe(60);
  });
});


describe('ربحية المجموعات تتكامل مع نسبة الاشتراك', () => {
  it('مدى التقرير يشمل كل شهوره وليس أول شهر فقط', async () => {
    await seedPayroll();
    await dbAdd('installments', payrollInstallment({ id: 'october', dueDate: '2026-10-01' }));
    const rows = await calcGroupProfitability({ from: '2026-03-01', to: '2026-10-31' });
    expect(rows[0]).toMatchObject({ teacherCost: 240, owed: 400, collected: 0, profit: -240 });
  });

  it('تعديل النسبة بعد الاعتماد لا يغير تكلفة المدرس التاريخية', async () => {
    const teacher = await seedPayroll();
    await approve();
    await updateTeacherPaySettings(teacher.id, { ...teacher, payRate: 30 });
    const rows = await calcGroupProfitability({ from: '2026-09-01', to: '2026-09-30' });
    expect(rows[0].teacherCost).toBe(120);
  });

  it('الصرف لا يحتسب مرة ثانية فوق تكلفة المدرس', async () => {
    await seedPayroll();
    const record = await approve();
    await payPayroll({ payrollId: record.id, date: '2026-09-24' });
    const rows = await calcGroupProfitability({ from: '2026-09-01', to: '2026-09-30' });
    expect(rows[0].teacherCost).toBe(120);
    expect(rows[0].materialCost).toBe(0);
    expect(rows[0].profit).toBe(-120);
  });
});
