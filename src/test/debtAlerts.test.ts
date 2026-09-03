/**
 * اختبارات تنبيهات المديونيات (الكاش المشترك بين السايدبار والداشبورد)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { refreshDebtAlert, subscribeDebtAlert, getDebtAlert } from '../lib/debtAlerts';
import {
  dbAdd, dbClearStore, dbPut, dbGetById, enrollStudent, recordInstallmentPayment,
  generateId, Student, Group, Course,
} from '../lib/db';

const NOW = '2026-03-10T10:00:00.000Z';

async function seedStudent(name: string, price: number, durationMonths = 1, initialPayment = 0) {
  const courseId = generateId();
  const groupId = generateId();
  const studentId = generateId();

  await dbAdd<Course>('courses', {
    id: courseId, name: `كورس ${name}`, category: 'علوم', price, durationMonths,
    icon: '📚', color: '#6366f1', levels: [], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Group>('groups', {
    id: groupId, name: `مجموعة ${name}`, courseId, teacherId: 't1', schedule: [],
    maxStudents: 20, status: 'open', studentIds: [], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Student>('students', {
    id: studentId, name, age: 12, gender: 'male', parentPhone: '01000000000',
    status: 'active', totalPaid: 0, enrolledGroups: [], createdAt: NOW, updatedAt: NOW,
  });
  await enrollStudent(studentId, groupId, initialPayment);

  return { studentId, groupId };
}

beforeEach(async () => {
  for (const store of ['students', 'groups', 'courses', 'payments', 'enrollments', 'installments'] as const) {
    await dbClearStore(store);
  }
});

describe('refreshDebtAlert', () => {
  it('يعدّ الطلاب عليهم مبالغ ويجمع المتبقي والمتأخرات', async () => {
    await seedStudent('أحمد', 800, 1, 300);   // عليه 500
    await seedStudent('منى', 1200, 1, 0);     // عليها 1200

    const alert = await refreshDebtAlert(true);
    expect(alert.debtorsCount).toBe(2);
    expect(alert.totalRemaining).toBe(1700);
    expect(getDebtAlert().debtorsCount).toBe(2);
  });

  it('الطالب اللي سدد بالكامل يخرج من العدّاد', async () => {
    const { studentId } = await seedStudent('سارة', 800, 1, 0);
    expect((await refreshDebtAlert(true)).debtorsCount).toBe(1);

    await recordInstallmentPayment({ studentId, amount: 800 });
    const alert = await refreshDebtAlert(true);
    expect(alert.debtorsCount).toBe(0);
    expect(alert.totalRemaining).toBe(0);
  });

  it('الطالب المنتهي ما يدخلش في المديونيات', async () => {
    const { studentId } = await seedStudent('خالد', 800, 1, 0);
    expect((await refreshDebtAlert(true)).debtorsCount).toBe(1);

    const student = await dbGetById<Student>('students', studentId);
    await dbPut('students', { ...student!, status: 'ended' });
    expect((await refreshDebtAlert(true)).debtorsCount).toBe(0);
  });

  it('المشترك بيتبلّغ بالقيمة الحالية فور الاشتراك وبالتحديثات بعدها', async () => {
    await seedStudent('ياسمين', 900, 1, 0);
    await refreshDebtAlert(true);

    const seen: number[] = [];
    const unsubscribe = subscribeDebtAlert(a => seen.push(a.debtorsCount));
    expect(seen[0]).toBe(1);   // القيمة الحالية بتتبعت فوراً

    await seedStudent('كريم', 400, 1, 0);
    await refreshDebtAlert(true);
    expect(seen[seen.length - 1]).toBe(2);

    unsubscribe();
    await seedStudent('ليلى', 500, 1, 0);
    await refreshDebtAlert(true);
    expect(seen[seen.length - 1]).toBe(2);   // ما وصلوش تحديث بعد إلغاء الاشتراك
  });
});
