import { describe, expect, it } from 'vitest';
import { calcTeacherPayroll, describeTeacherPay, isPayrollPeriod, validateTeacherPaySettings } from '../lib/payroll';
import { payrollContext as ctx, payrollGroup as group, payrollInstallment as installment, payrollStudent as student, payrollTeacher as teacher, PAYROLL_PERIOD as period, PAYROLL_NOW as now } from './helpers/payroll';
import type { Installment, Payment, TeacherPayModel } from '../lib/db';
import { toCamelCase, toSnakeCase, transformKeys } from '../lib/storage';

describe('نسبة مستقلة لكل مدرس من كامل الاشتراك', () => {
  it.each([
    [0, 'pending'], [50, 'partial'], [200, 'paid'], [0, 'late'],
  ] as [number, Installment['status']][])('اشتراك 200 ونسبة 60 = 120 مهما كان المسدد (%s / %s)', (paidAmount, status) => {
    const calc = calcTeacherPayroll(teacher(), period, ctx({ installments: [installment({ paidAmount, status })] }));
    expect(calc.base).toBe(200);
    expect(calc.gross).toBe(120);
    expect(calc.net).toBe(120);
    expect(calc.lines[0].students?.[0]).toMatchObject({ studentName: 'طالب تجريبي أول', subscriptionAmount: 200, rate: 60, amount: 120 });
  });

  it('كل مدرس له نسبته واشتراكات مجموعاته فقط، حتى لو الطالب نفسه عند مدرسين', () => {
    const first = teacher();
    const second = teacher({ id: 'teacher-2', name: 'مدرس ثان', payRate: 40 });
    const context = ctx({
      teachers: [first, second], groups: [group(), group({ id: 'group-2', teacherId: second.id })],
      installments: [installment(), installment({ id: 'installment-2', groupId: 'group-2' })],
    });
    expect(calcTeacherPayroll(first, period, context).gross).toBe(120);
    expect(calcTeacherPayroll(second, period, context).gross).toBe(80);
    expect(calcTeacherPayroll(first, period, context).lines).toHaveLength(1);
  });

  it('المصدر قيمة القسط الفعلية بعد الخصم/منتصف الشهر، وليس الكتالوج أو المدفوع', () => {
    const calc = calcTeacherPayroll(teacher(), period, ctx({ installments: [installment({ amount: 150, paidAmount: 10 })] }));
    expect(calc.base).toBe(150);
    expect(calc.gross).toBe(90);
  });

  it('يستبعد شهر آخر والأقساط الملغاة والمحذوفة ومجموعات مدرس آخر', () => {
    const calc = calcTeacherPayroll(teacher(), period, ctx({ installments: [
      installment(),
      installment({ id: 'old', dueDate: '2026-08-01' }),
      installment({ id: 'future', dueDate: '2026-10-01' }),
      installment({ id: 'cancelled', status: 'cancelled' }),
      installment({ id: 'deleted', deleted: true }),
      installment({ id: 'orphan', groupId: 'missing-group' }),
    ] }));
    expect(calc.base).toBe(200);
    expect(calc.gross).toBe(120);
    expect(calc.lines[0].students?.[0].installmentIds).toEqual(['installment-1']);
  });

  it('اشتراك مجموعة انتهت لاحقاً يبقى في شهره، دون الاعتماد على العضوية الحالية', () => {
    const calc = calcTeacherPayroll(teacher(), period, ctx({
      groups: [group({ status: 'ended', studentIds: [] })],
      students: [student({ enrolledGroups: [], status: 'ended' })], enrollments: [],
    }));
    expect(calc.gross).toBe(120);
    expect(calc.lines[0].students).toHaveLength(1);
  });

  it('لا يحسب مجموعات محذوفة', () => {
    expect(calcTeacherPayroll(teacher(), period, ctx({ groups: [group({ deleted: true })] })).gross).toBe(0);
  });

  it('المدفوعات والكتب لا تدخل في أساس نسبة الاشتراك', () => {
    const payments: Payment[] = ['subscription', 'books', 'other'].map((type, index) => ({
      id: `payment-${index}`, studentId: 'student-1', groupId: 'group-1', amount: 999, status: 'paid',
      type: type as Payment['type'], date: '2026-09-02', createdAt: now, updatedAt: now,
    }));
    const result = calcTeacherPayroll(teacher(), period, ctx({ payments }));
    expect(result.base).toBe(200);
    expect(result.gross).toBe(120);
  });

  it('يجمع أقساط الطالب في المجموعة مرة واحدة ولا يكرر معرف القسط', () => {
    const calc = calcTeacherPayroll(teacher(), period, ctx({ installments: [
      installment(), installment(), installment({ id: 'installment-2', amount: 50 }),
    ] }));
    expect(calc.lines[0].students).toHaveLength(1);
    expect(calc.lines[0].students?.[0].subscriptionAmount).toBe(250);
    expect(calc.gross).toBe(150);
  });

  it('الإجمالي يساوي مجموع نصيب كل طالب ومجموعة بعد التقريب للقرش', () => {
    const calc = calcTeacherPayroll(teacher({ payRate: 33.33 }), period, ctx({
      groups: [group(), group({ id: 'group-2' })],
      installments: [
        installment({ amount: 10.01 }),
        installment({ id: 'i2', studentId: 'student-2', amount: 10.01 }),
        installment({ id: 'i3', groupId: 'group-2', amount: 10.01 }),
      ],
    }));
    const detailTotal = calc.lines.flatMap(l => l.students || []).reduce((sum, s) => sum + s.amount, 0);
    expect(calc.gross).toBe(10.02);
    expect(calc.gross).toBe(Math.round(detailTotal * 100) / 100);
    expect(calc.gross).toBe(Math.round(calc.lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100);
  });

  it('يقرب نصف القرش بشكل صحيح حتى عند حدود الكسور الثنائية', () => {
    const calc = calcTeacherPayroll(teacher({ payRate: 1 }), period, ctx({ installments: [installment({ amount: 100.5 })] }));
    expect(calc.gross).toBe(1.01);
    expect(calc.lines[0].students?.[0].amount).toBe(1.01);
  });

  it('بدون اشتراكات مسجلة لا يفترض رسوماً من عدد الطلاب', () => {
    const calc = calcTeacherPayroll(teacher(), period, ctx({ installments: [] }));
    expect(calc.gross).toBe(0);
    expect(calc.lines).toEqual([]);
  });

  it('قيم اشتراك فاسدة لا تنتج أرقاماً سالبة أو لا نهائية', () => {
    const calc = calcTeacherPayroll(teacher(), period, ctx({ installments: [
      installment({ amount: -200 }), installment({ id: 'inf', amount: Infinity }), installment({ id: 'nan', amount: NaN }),
    ] }));
    expect(calc.gross).toBe(0);
  });

  it.each([0, 100])('يقبل نسبة الحد %s', rate => {
    const calc = calcTeacherPayroll(teacher({ payRate: rate }), period, ctx());
    expect(calc.gross).toBe(200 * rate / 100);
  });

  it('الاستيراد والتصدير السحابي يحفظان تفاصيل الطلاب وموديل النسبة', () => {
    const local = { ...calcTeacherPayroll(teacher(), period, ctx()), period };
    expect(transformKeys(transformKeys(local, toSnakeCase), toCamelCase)).toEqual(local);
  });
});

describe('التحقق من إعدادات المستحقات والتوافق القديم', () => {
  it.each([undefined, NaN, Infinity, -1, 100.01, 60.123])('يرفض النسبة غير الصحيحة %s', rate => {
    expect(validateTeacherPaySettings(teacher({ payRate: rate }))).toBeTruthy();
  });

  it.each([0, 40, 60.25, 100])('يقبل نسبة %s', rate => {
    expect(validateTeacherPaySettings(teacher({ payRate: rate }))).toBeNull();
  });

  it('يصف النسبة دون عرض راتب ثابت مضلل', () => {
    expect(describeTeacherPay(teacher())).toBe('60% من اشتراك كل طالب');
    expect(describeTeacherPay(teacher({ payRate: undefined }))).toContain('حدد نسبة المدرس');
  });

  it('عدم وجود payModel يبقى راتباً ثابتاً ولا يحوّل البيانات القديمة لنسبة', () => {
    const legacy = teacher({ payModel: undefined, salary: 1500 });
    expect(calcTeacherPayroll(legacy, period, ctx()).gross).toBe(1500);
    expect(validateTeacherPaySettings(legacy)).toBeNull();
  });

  it('النسبة القديمة تظل من المحصّل ولا تتحول بصمت للاشتراكات', () => {
    const calc = calcTeacherPayroll(teacher({ payModel: 'percentage' }), period, ctx());
    expect(calc.gross).toBe(0);
  });

  it('يرفض موديل غير معروف', () => {
    expect(validateTeacherPaySettings(teacher({ payModel: 'invalid' as TeacherPayModel }))).toBeTruthy();
  });

  it.each(['', '2026-00', '2026-13', '2026-9', '2026', '2026-09-01'])('يرفض شهراً غير صالح %s', value => {
    expect(isPayrollPeriod(value)).toBe(false);
    expect(() => calcTeacherPayroll(teacher(), value, ctx())).toThrow('اختر شهراً صحيحاً');
  });
});
