/**
 * اختبار الدورة الكاملة (E2E) على قاعدة البيانات الفعلية:
 * طالب → تسجيل بمجموعة → خطة أقساط → دفعات (جزئية/كاملة) → إلغاء دفعة →
 * استرداد → حضور وغياب → رواتب المدرسين → الخزينة → التحويل بين المجموعات →
 * الحذف والاسترجاع → سلامة البيانات النهائية.
 *
 * الهدف: كشف أي بَج تشغيلي حقيقي في مسار العمل اليومي.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  enrollStudent,
  unenrollStudent,
  getStudentBalance,
  getStudentInstallments,
  recordInstallmentPayment,
  voidPayment,
  recordRefund,
  transferStudent,
  getDebtors,
  dbAdd,
  dbPut,
  dbClearStore,
  dbGetAll,
  dbGetById,
  generateId,
  markOverdueInstallments,
  Student,
  Group,
  Course,
  Teacher,
  TeacherAdvance,
  Payment,
  Attendance,
  Enrollment,
  Refund,
} from '../lib/db';
import {
  calcTeacherPayroll,
  addTeacherAdvance,
  type PayrollContext,
} from '../lib/payroll';
import { computeDayTotals } from '../lib/cashbox';
import { isCountedPayment } from '../lib/billing';

const NOW = '2026-03-10T10:00:00.000Z';
const PERIOD = '2026-03';
const TODAY = '2026-03-10';

async function seedBase() {
  const courseId = generateId();
  const groupId = generateId();
  const group2Id = generateId();
  const studentId = generateId();
  const teacherId = generateId();

  await dbAdd<Course>('courses', {
    id: courseId, name: 'رياضيات', category: 'علوم', price: 800, durationMonths: 3,
    icon: '📚', color: '#6366f1', levels: [], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Teacher>('teachers', {
    id: teacherId, name: 'أستاذ محمد', specialization: 'رياضيات', phone: '010',
    salary: 2000, status: 'active', payModel: 'per_session', payRate: 100,
    createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Group>('groups', {
    id: groupId, name: 'مجموعة أ', courseId, teacherId, schedule: [],
    maxStudents: 20, status: 'open', studentIds: [], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Group>('groups', {
    id: group2Id, name: 'مجموعة ب', courseId, teacherId, schedule: [],
    maxStudents: 20, status: 'open', studentIds: [], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Student>('students', {
    id: studentId, name: 'أحمد محمد', age: 12, gender: 'male', parentPhone: '01000000000',
    status: 'active', totalPaid: 0, enrolledGroups: [], createdAt: NOW, updatedAt: NOW,
  });

  return { courseId, groupId, group2Id, studentId, teacherId };
}

beforeEach(async () => {
  for (const store of [
    'students', 'groups', 'courses', 'payments', 'enrollments', 'installments',
    'teachers', 'attendance', 'refunds', 'expenses', 'teacher_advances',
    'cashbox_sessions', 'payroll',
  ] as const) {
    await dbClearStore(store);
  }
});

describe('الدورة المالية الكاملة', () => {
  it('تسجيل → دفع جزئي → دفع المتبقي → رصيد صفر', async () => {
    const { groupId, studentId } = await seedBase();
    const enr = await enrollStudent(studentId, groupId);
    expect(enr.success).toBe(true);

    // مديونية ظاهرة في كشف المديونيات
    let debtors = await getDebtors();
    expect(debtors.find(d => d.studentId === studentId)).toBeTruthy();

    // دفعة جزئية 300
    let r = await recordInstallmentPayment({ studentId, groupId, amount: 300, date: TODAY });
    expect(r.success).toBe(true);
    let bal = await getStudentBalance(studentId);
    expect(bal?.paid).toBe(300);
    expect(bal?.remaining).toBe(500);

    // دفعة المتبقي 500
    r = await recordInstallmentPayment({ studentId, groupId, amount: 500, date: TODAY });
    expect(r.success).toBe(true);
    bal = await getStudentBalance(studentId);
    expect(bal?.remaining).toBe(0);

    // لم يعد مديوناً
    debtors = await getDebtors();
    expect(debtors.find(d => d.studentId === studentId)).toBeFalsy();
  });

  it('دفعة زيادة عن المستحق بتتحول رصيد دائن (فائض)', async () => {
    const { groupId, studentId } = await seedBase();
    await enrollStudent(studentId, groupId);
    await recordInstallmentPayment({ studentId, groupId, amount: 1000, date: TODAY });
    const bal = await getStudentBalance(studentId);
    expect(bal?.paid).toBe(1000);
    expect(bal?.owed).toBe(800);
    // الفائض يظهر كرصيد دائن (remaining سالب)
    expect(bal?.credit).toBe(200);
    expect(bal?.remaining).toBe(-200);
  });

  it('إلغاء دفعة بيعيد توزيع المبالغ على الأقساط بشكل صحيح', async () => {
    const { groupId, studentId } = await seedBase();
    await enrollStudent(studentId, groupId);
    const p1 = await recordInstallmentPayment({ studentId, groupId, amount: 800, date: TODAY });
    expect(p1.success).toBe(true);
    let bal = await getStudentBalance(studentId);
    expect(bal?.remaining).toBe(0);

    const v = await voidPayment({ paymentId: p1.payment!.id, reason: 'خطأ في الإيصال' });
    expect(v.success).toBe(true);
    bal = await getStudentBalance(studentId);
    expect(bal?.paid).toBe(0);
    expect(bal?.remaining).toBe(800);
  });

  it('الاسترداد لا يتجاوز المدفوع فعلاً', async () => {
    const { groupId, studentId } = await seedBase();
    await enrollStudent(studentId, groupId);
    await recordInstallmentPayment({ studentId, groupId, amount: 500, date: TODAY });

    const tooMuch = await recordRefund({ studentId, amount: 900, reason: 'خطأ' });
    expect(tooMuch.success).toBe(false);

    const ok = await recordRefund({ studentId, amount: 200, reason: 'استرجاع جزئي' });
    expect(ok.success).toBe(true);
    const bal = await getStudentBalance(studentId);
    expect(bal?.refunded).toBe(200);
    // مدفوع فعلي = 500 - 200 = 300
    expect(bal?.paid).toBe(300);
  });

  it('الخروج من المجموعة يلغي الأقساط غير المسددة ويسقط الدين', async () => {
    const { groupId, studentId } = await seedBase();
    await enrollStudent(studentId, groupId);
    await recordInstallmentPayment({ studentId, groupId, amount: 300, date: TODAY });

    const u = await unenrollStudent(studentId, groupId, 'انسحاب');
    expect(u.success).toBe(true);

    const bal = await getStudentBalance(studentId);
    // القسط غير المسدد (500) يُلغى مع الخروج، والمبلغ المدفوع (300) يبقى كرصيد دائن للطالب
    expect(bal?.owed).toBe(0);
    expect(bal?.paid).toBe(300);
    expect(bal?.credit).toBe(300);
    expect(bal?.remaining).toBe(-300);

    // الطالب لم يعد في مجموعة
    const s = await dbGetById<Student>('students', studentId);
    expect(s?.enrolledGroups).not.toContain(groupId);
    const g = await dbGetById<Group>('groups', groupId);
    expect(g?.studentIds).not.toContain(studentId);
  });

  it('التحويل يرحّل المدفوع فعلاً ليغطّي أقساط المجموعة الجديدة', async () => {
    const { groupId, group2Id, studentId } = await seedBase();
    await enrollStudent(studentId, groupId);
    // دفع 800 = الشهر الأول كامل في المجموعة القديمة
    await recordInstallmentPayment({ studentId, groupId, amount: 800, date: TODAY });

    // تحويل للمجموعة الثانية في نفس اليوم
    const t = await transferStudent({ studentId, fromGroupId: groupId, toGroupId: group2Id, reason: 'مستوى أفضل' });
    expect(t.success).toBe(true);
    // الرصيد المرحّل = 800 (المدفوع في القديمة)
    expect(t.credit).toBe(800);

    const bal = await getStudentBalance(studentId);
    // المفروض: المدفوع 800 يغطي شهر المجموعة الجديدة (800) → متبقي 0،
    // مش يتحوّل الطالب لمديون بـ 800 تاني
    expect(bal?.paid).toBe(800);
    const g2 = bal?.groups.find(g => g.groupId === group2Id);
    expect(g2?.remaining).toBe(0);
  });

  it('الدفعة المرتبطة بمجموعة لا تغطّي أقساط مجموعة أخرى', async () => {
    const { groupId, group2Id, studentId } = await seedBase();
    // سجّل في مجموعتين (شهر واحد لكل منهما = 1600 مستحق)
    await enrollStudent(studentId, groupId);
    await enrollStudent(studentId, group2Id);

    // دفعة 800 خاصة بالمجموعة الأولى فقط
    await recordInstallmentPayment({ studentId, groupId, amount: 800, date: TODAY });
    const bal = await getStudentBalance(studentId);
    const g1 = bal?.groups.find(g => g.groupId === groupId);
    const g2 = bal?.groups.find(g => g.groupId === group2Id);
    expect(g1?.remaining).toBe(0);     // الأولى اتسدّت
    expect(g2?.remaining).toBe(800);   // التانية لسه مديونة
    expect(bal?.remaining).toBe(800);
  });
});

describe('الحضور والغياب', () => {
  it('الحصص المسلّمة تُحسب من أيام الحضور الفعلية (لكل يوم حصة واحدة)', async () => {
    const { groupId, studentId, teacherId } = await seedBase();
    await enrollStudent(studentId, groupId);

    // يومان مختلفان سُجّل فيهما حضور
    const mk = (date: string, status: Attendance['status']) => dbAdd<Attendance>('attendance', {
      id: generateId(), studentId, groupId, date, status,
      createdAt: NOW, updatedAt: NOW,
    });
    await mk('2026-03-01', 'present');
    await mk('2026-03-08', 'absent');

    const teacher = (await dbGetById<Teacher>('teachers', teacherId))!;
    const ctx: PayrollContext = {
      teachers: [teacher],
      groups: await dbGetAll<Group>('groups'),
      enrollments: await dbGetAll<Enrollment>('enrollments'),
      attendance: await dbGetAll<Attendance>('attendance'),
      payments: await dbGetAll<Payment>('payments'),
      advances: [],
    };
    const calc = calcTeacherPayroll(teacher, PERIOD, ctx);
    // حصتان مسلّمتان (يومان) × 100 = 200
    expect(calc.gross).toBe(200);
  });

  it('تسجيلات حضور مكررة لنفس اليوم لا تضاعف عدد الحصص', async () => {
    const { groupId, studentId, teacherId } = await seedBase();
    await enrollStudent(studentId, groupId);

    // نفس اليوم سُجّل مرتين (خطأ إدخال محتمل)
    const mk = (date: string) => dbAdd<Attendance>('attendance', {
      id: generateId(), studentId, groupId, date, status: 'present',
      createdAt: NOW, updatedAt: NOW,
    });
    await mk('2026-03-01');
    await mk('2026-03-01');

    const teacher = (await dbGetById<Teacher>('teachers', teacherId))!;
    const ctx: PayrollContext = {
      teachers: [teacher],
      groups: await dbGetAll<Group>('groups'),
      enrollments: await dbGetAll<Enrollment>('enrollments'),
      attendance: await dbGetAll<Attendance>('attendance'),
      payments: await dbGetAll<Payment>('payments'),
      advances: [],
    };
    const calc = calcTeacherPayroll(teacher, PERIOD, ctx);
    // يوم واحد = حصة واحدة (ليس حصتين)
    expect(calc.gross).toBe(100);
  });
});

describe('الخزينة', () => {
  it('إجمالي اليوم النقدي = افتتاحي + المقبوض نقداً - مصروفات نقدية', async () => {
    const { groupId, studentId } = await seedBase();
    await enrollStudent(studentId, groupId);
    await recordInstallmentPayment({ studentId, groupId, amount: 800, date: TODAY, method: 'cash' });

    const payments = await dbGetAll<Payment>('payments');
    const totals = computeDayTotals({
      date: TODAY,
      payments,
      refunds: [],
      expenses: [{ id: 'e1', amount: 200, date: TODAY, category: 'bills', method: 'cash', description: 'كهرباء', createdAt: NOW, updatedAt: NOW } as never],
      openingBalance: 500,
    });
    expect(totals.collected).toBe(800);
    expect(totals.expenses).toBe(200);
    expect(totals.expectedCash).toBe(500 + 800 - 200);
  });

  it('الدفعة غير النقدية (محفظة) لا تُحتسب ضمن النقدية المتوقعة', async () => {
    const { groupId, studentId } = await seedBase();
    await enrollStudent(studentId, groupId);
    await recordInstallmentPayment({ studentId, groupId, amount: 800, date: TODAY, method: 'wallet' });

    const payments = await dbGetAll<Payment>('payments');
    const totals = computeDayTotals({ date: TODAY, payments, refunds: [], expenses: [], openingBalance: 0 });
    expect(totals.collected).toBe(800);          // إجمالي المحصّل
    expect(totals.byMethod.cash).toBe(0);        // لا شيء نقداً
    expect(totals.expectedCash).toBe(0);         // الخزينة النقدية لا تتأثر
  });
});

describe('سلف المدرسين والرواتب', () => {
  it('السلفة تُخصم من راتب الشهر ولا تتكرر في الشهور التالية', async () => {
    const { teacherId } = await seedBase();

    // سلفة 500 في مارس
    const adv = await addTeacherAdvance({
      teacherId, amount: 500, date: '2026-03-05', reason: 'سلفة',
    });
    expect(adv.success).toBe(true);

    const teacher = (await dbGetById<Teacher>('teachers', teacherId))!;
    const buildCtx = async (t: Teacher): Promise<PayrollContext> => ({
      teachers: [t],
      groups: await dbGetAll<Group>('groups'),
      enrollments: await dbGetAll<Enrollment>('enrollments'),
      attendance: await dbGetAll<Attendance>('attendance'),
      payments: await dbGetAll<Payment>('payments'),
      advances: await dbGetAll<TeacherAdvance>('teacher_advances'),
    });

    // راتب مارس (راتب ثابت 2000)
    const fixedTeacher = { ...teacher, payModel: 'fixed' as const, salary: 2000 };
    const marchCalc = calcTeacherPayroll(fixedTeacher, '2026-03', await buildCtx(fixedTeacher));
    expect(marchCalc.gross).toBe(2000);
    expect(marchCalc.advances).toBe(500);
    expect(marchCalc.net).toBe(1500);

    // نحسب وندفع راتب مارس → السلفة تتعلّم كمسوّاة على مارس
    const { savePayrollRecord, payPayroll } = await import('../lib/payroll');
    const rec = await savePayrollRecord({ teacherId, period: '2026-03', calc: marchCalc });
    const pay = await payPayroll({ payrollId: rec.id, userId: 'u1', username: 'admin' });
    expect(pay.success).toBe(true);

    // راتب أبريل بعد التسوية: السلفة المخصومة ما تتكرر
    const aprilAfter = calcTeacherPayroll(fixedTeacher, '2026-04', await buildCtx(fixedTeacher));
    expect(aprilAfter.advances).toBe(0);
    expect(aprilAfter.net).toBe(2000);
  });

  it('سلفتان: الصرف يُسوّي المغطى فقط ويترك الباقي للشهر التالي', async () => {
    const { teacherId } = await seedBase();
    // راتب ثابت 2000، سلفة أولى 300 (تُغطى) وسلفة تانية 3000 (يتبقى منها)
    const teacher = { ...(await dbGetById<Teacher>('teachers', teacherId))!, payModel: 'fixed' as const, salary: 2000 };
    await dbPut('teachers', teacher);
    await addTeacherAdvance({ teacherId, amount: 300, date: '2026-02-10', reason: 'سلفة صغيرة' });
    await addTeacherAdvance({ teacherId, amount: 3000, date: '2026-03-05', reason: 'سلفة كبيرة' });

    const buildCtx = async (): Promise<PayrollContext> => ({
      teachers: [teacher],
      groups: await dbGetAll<Group>('groups'),
      enrollments: await dbGetAll<Enrollment>('enrollments'),
      attendance: await dbGetAll<Attendance>('attendance'),
      payments: await dbGetAll<Payment>('payments'),
      advances: await dbGetAll<TeacherAdvance>('teacher_advances'),
    });

    const march = calcTeacherPayroll(teacher, '2026-03', await buildCtx());
    // إجمالي السلف 3300 حدّه الراتب عند 2000
    expect(march.gross).toBe(2000);
    expect(march.advances).toBe(2000);
    expect(march.net).toBe(0);

    const { savePayrollRecord } = await import('../lib/payroll');
    const rec = await savePayrollRecord({ teacherId, period: '2026-03', calc: march });
    // الراتب اتغطى كله بالسلف → الحالة paid تلقائياً وبتتسوّي السلف عند الاستحقاق
    expect(rec.status).toBe('paid');
    expect(rec.net).toBe(0);

    // التسوية: السلفة الصغيرة 300 اتسوّت بالكامل + 1700 من الكبيرة (300+1700=2000).
    // المتبقي غير المسوّى من السلفة الكبيرة = 3000 - 1700 = 1300 يترحّل لأبريل
    const open = (await dbGetAll<TeacherAdvance>('teacher_advances'))
      .filter(a => !a.deleted && !a.settledInPeriod);
    const openTotal = open.reduce((s, a) => s + a.amount, 0);
    expect(openTotal).toBe(1300);

    // أبريل: المترحّل 1300 يظهر كتقدم والراتب 2000 - 1300 = صافي 700
    const april = calcTeacherPayroll(teacher, '2026-04', await buildCtx());
    expect(april.advances).toBe(1300);
    expect(april.net).toBe(700);
  });
});

describe('دقة الإيراد والاسترداد', () => {
  it('إلغاء دفعة يُسقطها من الإيراد المحسوب (isCountedPayment)', async () => {
    const { groupId, studentId } = await seedBase();
    await enrollStudent(studentId, groupId);
    const p = await recordInstallmentPayment({ studentId, groupId, amount: 800, date: TODAY });
    expect(p.success).toBe(true);

    let payments = await dbGetAll<Payment>('payments');
    const grossValid = payments.filter(isCountedPayment).reduce((s, x) => s + x.amount, 0);
    expect(grossValid).toBe(800);

    await voidPayment({ paymentId: p.payment!.id, reason: 'خطأ' });
    payments = await dbGetAll<Payment>('payments');
    // الدفعة لسه موجودة في السجل لكن مش محسوبة
    expect(payments.length).toBe(1);
    const afterVoid = payments.filter(isCountedPayment).reduce((s, x) => s + x.amount, 0);
    expect(afterVoid).toBe(0);
  });

  it('الاسترداد يخصم من الإيراد الصافي', async () => {
    const { groupId, studentId } = await seedBase();
    await enrollStudent(studentId, groupId);
    await recordInstallmentPayment({ studentId, groupId, amount: 800, date: TODAY });
    await recordRefund({ studentId, amount: 200, reason: 'استرجاع', date: TODAY });

    const payments = await dbGetAll<Payment>('payments');
    const refunds = await dbGetAll<Refund>('refunds');
    const gross = payments.filter(isCountedPayment).reduce((s, x) => s + x.amount, 0);
    const refunded = refunds.filter(r => !r.deleted).reduce((s, r) => s + r.amount, 0);
    expect(gross - refunded).toBe(600); // صافي الإيراد
  });
});

describe('سلامة البيانات بعد العمليات', () => {
  it('ترحيل الدفعات يطابق إجمالي الطالب المخزّن', async () => {
    const { groupId, studentId } = await seedBase();
    await enrollStudent(studentId, groupId);
    await recordInstallmentPayment({ studentId, groupId, amount: 300, date: TODAY });
    await recordInstallmentPayment({ studentId, groupId, amount: 200, date: TODAY });

    const s = await dbGetById<Student>('students', studentId);
    const bal = await getStudentBalance(studentId);
    expect(s?.totalPaid).toBe(bal?.paid);
    expect(s?.totalPaid).toBe(500);
  });

  it('أقساط ملغاة لا تُحتسب في المستحق', async () => {
    const { groupId, studentId } = await seedBase();
    await enrollStudent(studentId, groupId);
    await unenrollStudent(studentId, groupId, 'انسحاب');

    const inst = await getStudentInstallments(studentId);
    const active = inst.filter(i => i.status !== 'cancelled');
    expect(active.length).toBe(0);
  });

  it('markOverdueInstallments يعلّم المتأخر فقط', async () => {
    const { groupId, studentId } = await seedBase();
    await enrollStudent(studentId, groupId);

    // قسط مستحق في الماضي غير مدفوع
    const insts = await getStudentInstallments(studentId);
    await dbPut('installments', { ...insts[0], dueDate: '2026-02-01', paidAmount: 0 });

    const count = await markOverdueInstallments();
    expect(count).toBeGreaterThan(0);
    const after = await getStudentInstallments(studentId);
    expect(after[0].status).toBe('late');
  });
});
