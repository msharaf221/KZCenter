/**
 * اختبارات «تصفير المديونيات» (writeOffDebts):
 *
 * - نطاق `all` يلغي كل الأقساط غير المسددة، ونطاق `due` يلغي المستحق/المتأخر بس
 * - الدفعات المحصّلة ما بتتمسش (لا حذف ولا void) — المدفوع يبقى رصيد دائن
 * - الأقساط المسددة والطلاب المنتهيين مش بيتأثروا
 * - المعاينة بتطابق التنفيذ، والسبب بيتسجّل على القسط
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import dayjs from 'dayjs';
import {
  writeOffDebts,
  previewWriteOff,
  getStudentBalance,
  getStudentInstallments,
  getDebtors,
  rebuildInstallmentsFromPayments,
  dbAdd,
  dbPut,
  dbGetById,
  dbClearStore,
  generateId,
  Student,
  Group,
  Course,
  Payment,
  Installment,
  Enrollment,
} from '../lib/db';

const NOW = '2026-03-10T10:00:00.000Z';
const TODAY = dayjs().format('YYYY-MM-DD');
/** استحقاق فات (متأخر) */
const PAST = dayjs().subtract(10, 'day').format('YYYY-MM-DD');
/** استحقاق جاي (لسه ما استحقش) */
const FUTURE = dayjs().add(20, 'day').format('YYYY-MM-DD');

async function seedStudent(name = 'أحمد محمد', status: Student['status'] = 'active') {
  const courseId = generateId();
  const groupId = generateId();
  const studentId = generateId();

  await dbAdd<Course>('courses', {
    id: courseId, name: 'رياضيات', category: 'علوم', price: 500, durationMonths: 3,
    icon: '📚', color: '#6366f1', levels: [], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Group>('groups', {
    id: groupId, name: 'مجموعة أ', courseId, teacherId: 't1', schedule: [],
    maxStudents: 20, status: 'open', studentIds: [studentId], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Student>('students', {
    id: studentId, name, age: 12, gender: 'male', parentPhone: '01000000000',
    status, totalPaid: 0, enrolledGroups: [groupId], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Enrollment>('enrollments', {
    id: generateId(), studentId, groupId, status: 'active',
    enrolledAt: NOW, initialPayment: 0, createdAt: NOW, updatedAt: NOW,
  });

  return { courseId, groupId, studentId };
}

/** قسط مباشرة في القاعدة (بدل ما نمرّ على enroll/renew اللي ليهم منطق تاني) */
async function addInstallment(opts: {
  studentId: string;
  groupId: string;
  amount: number;
  dueDate: string;
  paidAmount?: number;
  periodIndex?: number;
}) {
  const inst: Installment = {
    id: generateId(),
    studentId: opts.studentId,
    groupId: opts.groupId,
    periodIndex: opts.periodIndex ?? 1,
    periodLabel: `شهر ${opts.periodIndex ?? 1}`,
    amount: opts.amount,
    paidAmount: opts.paidAmount ?? 0,
    dueDate: opts.dueDate,
    status: 'pending',
    createdAt: NOW,
    updatedAt: NOW,
  };
  await dbAdd<Installment>('installments', inst);
  return inst;
}

async function addPayment(studentId: string, groupId: string, amount: number) {
  const payment: Payment = {
    id: generateId(),
    studentId,
    groupId,
    amount,
    type: 'subscription',
    status: 'paid',
    date: TODAY,
    method: 'cash',
    installmentIds: [],
    receiptNo: `2026-${generateId().slice(0, 4)}`,
    notes: 'دفعة اختبار',
    createdAt: NOW,
    updatedAt: NOW,
  };
  await dbAdd<Payment>('payments', payment);
  await rebuildInstallmentsFromPayments(studentId);
  return payment;
}

beforeEach(async () => {
  for (const store of [
    'students', 'groups', 'courses', 'payments', 'enrollments', 'installments', 'refunds',
  ] as const) {
    await dbClearStore(store);
  }
});

describe('تصفير المديونيات — نطاق all', () => {
  it('يلغي كل الأقساط غير المسددة ويصفّر متبقي الطالب', async () => {
    const { groupId, studentId } = await seedStudent();
    await addInstallment({ studentId, groupId, amount: 500, dueDate: PAST });
    await addInstallment({ studentId, groupId, amount: 500, dueDate: FUTURE, periodIndex: 2 });

    const before = await getStudentBalance(studentId);
    expect(before?.remaining).toBe(1000);

    const result = await writeOffDebts('all', 'إبراء ذمة قبل شهر جديد');
    expect(result.success).toBe(true);
    expect(result.preview?.installmentsCount).toBe(2);
    expect(result.preview?.studentsCount).toBe(1);
    expect(result.preview?.amount).toBe(1000);
    expect(result.remainingBefore).toBe(1000);
    expect(result.remainingAfter).toBe(0);

    const installments = await getStudentInstallments(studentId);
    expect(installments.every(i => i.status === 'cancelled')).toBe(true);

    const after = await getStudentBalance(studentId);
    expect(after?.owed).toBe(0);
    expect(after?.remaining).toBe(0);
    expect(await getDebtors()).toHaveLength(0);
  });

  it('المدفوعات المحصّلة ما بتتمسش وتبقى رصيد دائن للطالب', async () => {
    const { groupId, studentId } = await seedStudent();
    await addInstallment({ studentId, groupId, amount: 500, dueDate: PAST });
    await addInstallment({ studentId, groupId, amount: 500, dueDate: FUTURE, periodIndex: 2 });
    const payment = await addPayment(studentId, groupId, 300);

    const result = await writeOffDebts('all', 'إبراء ذمة');
    expect(result.success).toBe(true);
    // المتصـفَّر هو المتبقي بس (1000 - 300 مدفوع)
    expect(result.preview?.amount).toBe(700);

    // الدفعة نفسها سليمة: لا حذف ولا void ولا تغيير مبلغ
    const stored = await dbGetById<Payment>('payments', payment.id);
    expect(stored).toBeDefined();
    expect(stored?.deleted).toBeFalsy();
    expect(stored?.voided).toBeFalsy();
    expect(stored?.amount).toBe(300);
    expect(stored?.status).toBe('paid');

    // والمدفوع بقى رصيد دائن (المستحق صفر والمدفوع 300)
    const balance = await getStudentBalance(studentId);
    expect(balance?.owed).toBe(0);
    expect(balance?.paid).toBe(300);
    expect(balance?.remaining).toBe(-300);
    expect(balance?.credit).toBe(300);
  });

  it('ما يلغيش الأقساط المسددة بالكامل', async () => {
    const { groupId, studentId } = await seedStudent();
    const paid = await addInstallment({ studentId, groupId, amount: 500, dueDate: PAST, paidAmount: 500 });
    const unpaid = await addInstallment({ studentId, groupId, amount: 500, dueDate: FUTURE, periodIndex: 2 });
    await addPayment(studentId, groupId, 500);   // القسط الأول مسدد بدفعة حقيقية

    const result = await writeOffDebts('all', 'إبراء ذمة');
    expect(result.success).toBe(true);
    expect(result.preview?.installmentsCount).toBe(1);
    expect(result.preview?.amount).toBe(500);

    expect((await dbGetById<Installment>('installments', paid.id))?.status).not.toBe('cancelled');
    expect((await dbGetById<Installment>('installments', unpaid.id))?.status).toBe('cancelled');
    expect((await dbGetById<Installment>('installments', paid.id))?.paidAmount).toBe(500);
  });

  it('التصفير مرتين: التاني ملاقيش حاجة ويبلّغ المستخدم', async () => {
    const { groupId, studentId } = await seedStudent();
    await addInstallment({ studentId, groupId, amount: 500, dueDate: PAST });

    expect((await writeOffDebts('all', 'إبراء ذمة')).success).toBe(true);
    const second = await writeOffDebts('all', 'إبراء ذمة');
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/لا توجد مديونيات/);
  });
});

describe('تصفير المديونيات — نطاق due', () => {
  it('يلغي المستحق والمتأخر بس ويسيب الأقساط الجاية', async () => {
    const { groupId, studentId } = await seedStudent();
    const overdue = await addInstallment({ studentId, groupId, amount: 500, dueDate: PAST });
    const upcoming = await addInstallment({ studentId, groupId, amount: 500, dueDate: FUTURE, periodIndex: 2 });

    const result = await writeOffDebts('due', 'بداية شهر جديد');
    expect(result.success).toBe(true);
    expect(result.preview?.installmentsCount).toBe(1);
    expect(result.preview?.amount).toBe(500);
    expect(result.preview?.overdueAmount).toBe(500);

    expect((await dbGetById<Installment>('installments', overdue.id))?.status).toBe('cancelled');
    const kept = await dbGetById<Installment>('installments', upcoming.id);
    expect(kept?.status).not.toBe('cancelled');
    expect(kept?.amount).toBe(500);

    // الطالب لسه عليه شهر المستقبل
    const balance = await getStudentBalance(studentId);
    expect(balance?.owed).toBe(500);
    expect(balance?.remaining).toBe(500);
  });

  it('المدفوع بيتحط على القسط اللي فضل بدل ما يضيع على الملغي', async () => {
    const { groupId, studentId } = await seedStudent();
    await addInstallment({ studentId, groupId, amount: 500, dueDate: PAST });
    const upcoming = await addInstallment({ studentId, groupId, amount: 500, dueDate: FUTURE, periodIndex: 2 });
    await addPayment(studentId, groupId, 300);

    // قبل التصفير: 300 على القسط المتأخر (المتبقي 200 + 500 = 700)
    expect((await getStudentBalance(studentId))?.remaining).toBe(700);

    const result = await writeOffDebts('due', 'إبراء ذمة عن الشهر الفات');
    expect(result.success).toBe(true);
    expect(result.preview?.amount).toBe(200); // متبقي القسط المتأخر بس

    const kept = await dbGetById<Installment>('installments', upcoming.id);
    expect(kept?.paidAmount).toBe(300); // المدفوع اتاحسب على الشهر الجاي

    const balance = await getStudentBalance(studentId);
    expect(balance?.paid).toBe(300);
    expect(balance?.remaining).toBe(200);
  });

  it('قسط استحقاقه النهاردة بيتصفّر مع نطاق due', async () => {
    const { groupId, studentId } = await seedStudent();
    const dueToday = await addInstallment({ studentId, groupId, amount: 500, dueDate: TODAY });

    const result = await writeOffDebts('due', 'إبراء ذمة');
    expect(result.success).toBe(true);
    expect(result.preview?.installmentsCount).toBe(1);
    expect(result.preview?.overdueAmount).toBe(0); // مستحق النهاردة ≠ متأخر
    expect((await dbGetById<Installment>('installments', dueToday.id))?.status).toBe('cancelled');
  });
});

describe('تصفير المديونيات — ضوابط الأمان والبيانات', () => {
  it('السبب إلزامي وبيتحفظ على القسط الملغي', async () => {
    const { groupId, studentId } = await seedStudent();
    const inst = await addInstallment({ studentId, groupId, amount: 500, dueDate: PAST });

    const noReason = await writeOffDebts('all', '   ');
    expect(noReason.success).toBe(false);
    expect(noReason.error).toMatch(/سبب التصفير مطلوب/);

    const result = await writeOffDebts('all', 'إبراء ذمة شهر أغسطس');
    expect(result.success).toBe(true);
    const stored = await dbGetById<Installment>('installments', inst.id);
    expect(stored?.notes).toContain('تصفير مديونيات');
    expect(stored?.notes).toContain('إبراء ذمة شهر أغسطس');
  });

  it('نطاق غير معروف بيترفض من غير أي تعديل', async () => {
    const { groupId, studentId } = await seedStudent();
    const inst = await addInstallment({ studentId, groupId, amount: 500, dueDate: PAST });

    // @ts-expect-error -- اختبار متعمّد لنطاق مش موجود
    const result = await writeOffDebts('everything', 'إبراء ذمة');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/نطاق التصفير غير معروف/);
    expect((await dbGetById<Installment>('installments', inst.id))?.status).not.toBe('cancelled');
  });

  it('بيتجاهل الطالب المنتهي (مش ظاهر في المديونيات)', async () => {
    const { groupId, studentId } = await seedStudent('طالب منتهي', 'ended');
    const inst = await addInstallment({ studentId, groupId, amount: 500, dueDate: PAST });

    expect((await previewWriteOff('all')).installmentsCount).toBe(0);
    const result = await writeOffDebts('all', 'إبراء ذمة');
    expect(result.success).toBe(false);
    expect((await dbGetById<Installment>('installments', inst.id))?.status).not.toBe('cancelled');
  });

  it('بيتجاهل الأقساط المحذوفة والملغية سلفاً', async () => {
    const { groupId, studentId } = await seedStudent();
    await addInstallment({ studentId, groupId, amount: 500, dueDate: PAST, periodIndex: 1 });

    const cancelled = await addInstallment({ studentId, groupId, amount: 500, dueDate: PAST, periodIndex: 2 });
    await dbPut<Installment>('installments', { ...cancelled, status: 'cancelled' });

    await dbAdd<Installment>('installments', {
      id: generateId(), studentId, groupId, periodIndex: 3, periodLabel: 'شهر 3',
      amount: 400, paidAmount: 0, dueDate: PAST, status: 'pending', createdAt: NOW, updatedAt: NOW,
      deleted: true,
    });

    const preview = await previewWriteOff('all');
    expect(preview.installmentsCount).toBe(1);
    expect(preview.amount).toBe(500);
    expect(preview.studentsCount).toBe(1);
  });

  it('المعاينة بتطابق نتيجة التنفيذ', async () => {
    const { groupId, studentId } = await seedStudent();
    await addInstallment({ studentId, groupId, amount: 500, dueDate: PAST });
    await addInstallment({ studentId, groupId, amount: 500, dueDate: FUTURE, periodIndex: 2 });

    const duePreview = await previewWriteOff('due');
    const allPreview = await previewWriteOff('all');
    expect(duePreview.installmentsCount).toBe(1);
    expect(allPreview.installmentsCount).toBe(2);
    // المعاينة مفيهاش أي تعديل على البيانات
    const untouched = await getStudentInstallments(studentId);
    expect(untouched.some(i => i.status === 'cancelled')).toBe(false);
    expect(duePreview.amount + 500).toBe(allPreview.amount);

    const result = await writeOffDebts('due', 'إبراء ذمة');
    expect(result.preview).toEqual(duePreview);
  });

  it('تصفير مديونيات أكتر من طالب في عملية واحدة', async () => {
    const a = await seedStudent('طالب أ');
    const b = await seedStudent('طالب ب');
    await addInstallment({ studentId: a.studentId, groupId: a.groupId, amount: 300, dueDate: PAST });
    await addInstallment({ studentId: b.studentId, groupId: b.groupId, amount: 700, dueDate: PAST });
    await addInstallment({ studentId: b.studentId, groupId: b.groupId, amount: 700, dueDate: FUTURE, periodIndex: 2 });

    const result = await writeOffDebts('all', 'إبراء ذمة جماعي');
    expect(result.success).toBe(true);
    expect(result.preview?.studentsCount).toBe(2);
    expect(result.preview?.installmentsCount).toBe(3);
    expect(result.preview?.amount).toBe(1700);
    expect(await getDebtors()).toHaveLength(0);
  });
});
