import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { dbBulkAdd, dbClearStore } from '../data/records';
import type { Attendance, Course, Enrollment, Exam, Grade, Group, Payment, Student } from '../domain/models';
import type { Installment } from '../lib/billing';
import { lookupStudentPortal } from '../services/queries/portal';

describe('Student & Parent Portal Queries', () => {
  const dummyStudent1: Student = {
    id: 'stu-portal-1',
    name: 'كريم هاني',
    code: 'STU-KAREEM',
    age: 15,
    gender: 'male',
    phone: '01011112222',
    parentPhone: '01099998888',
    gradeLevel: 'أولى ثانوي',
    status: 'active',
    totalPaid: 400,
    enrolledGroups: ['grp-1'],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const dummyStudent2: Student = {
    id: 'stu-portal-2',
    name: 'مريم هاني', // أخت كريم بنفس هاتف ولي الأمر
    code: 'STU-MARYAM',
    age: 13,
    gender: 'female',
    phone: '01033334444',
    parentPhone: '01099998888',
    gradeLevel: 'ثانية إعدادي',
    status: 'active',
    totalPaid: 200,
    enrolledGroups: ['grp-2'],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const dummyCourse: Course = {
    id: 'course-1',
    name: 'رياضيات',
    price: 300,
    subjectId: 'math',
    category: 'school',
    durationMonths: 3,
    levels: [],
    icon: '📐',
    color: '#6366f1',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const dummyGroup: Group = {
    id: 'grp-1',
    name: 'مجموعة النخبة',
    courseId: 'course-1',
    teacherId: 'tch-1',
    schedule: [{ days: ['السبت', 'الثلاثاء'], startTime: '16:00', endTime: '18:00' }],
    maxStudents: 25,
    status: 'open',
    studentIds: ['stu-portal-1'],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const dummyEnrollment: Enrollment = {
    id: 'enr-1',
    studentId: 'stu-portal-1',
    groupId: 'grp-1',
    status: 'active',
    enrolledAt: '2026-09-01',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const dummyAttendance: Attendance[] = [
    { id: 'att-1', studentId: 'stu-portal-1', groupId: 'grp-1', date: '2026-09-10', status: 'present', createdAt: '2026-09-10', updatedAt: '2026-09-10' },
    { id: 'att-2', studentId: 'stu-portal-1', groupId: 'grp-1', date: '2026-09-13', status: 'present', createdAt: '2026-09-13', updatedAt: '2026-09-13' },
    { id: 'att-3', studentId: 'stu-portal-1', groupId: 'grp-1', date: '2026-09-17', status: 'absent', createdAt: '2026-09-17', updatedAt: '2026-09-17' },
    { id: 'att-4', studentId: 'stu-portal-1', groupId: 'grp-1', date: '2026-09-20', status: 'late', createdAt: '2026-09-20', updatedAt: '2026-09-20' },
  ];

  const dummyExam: Exam = {
    id: 'exam-1',
    name: 'امتحان الجبر الشهري',
    groupId: 'grp-1',
    date: '2026-09-18',
    maxGrade: 50,
    createdAt: '2026-09-18',
    updatedAt: '2026-09-18',
  };

  const dummyGrade: Grade = {
    id: 'grd-1',
    examId: 'exam-1',
    studentId: 'stu-portal-1',
    grade: 46,
    notes: 'ممتاز',
    createdAt: '2026-09-19',
    updatedAt: '2026-09-19',
  };

  const dummyPayment: Payment = {
    id: 'pay-1',
    studentId: 'stu-portal-1',
    groupId: 'grp-1',
    amount: 300,
    status: 'paid',
    type: 'subscription',
    method: 'cash',
    receiptNo: 'REC-1001',
    date: '2026-09-02',
    createdAt: '2026-09-02',
    updatedAt: '2026-09-02',
  };

  const dummyInstallment: Installment = {
    id: 'ins-1',
    studentId: 'stu-portal-1',
    groupId: 'grp-1',
    periodIndex: 1,
    periodLabel: 'شهر أكتوبر',
    amount: 300,
    paidAmount: 0,
    dueDate: '2026-10-01',
    status: 'pending',
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  };

  beforeEach(async () => {
    for (const s of ['students', 'courses', 'groups', 'enrollments', 'attendance', 'exams', 'grades', 'payments', 'installments', 'settings']) {
      await dbClearStore(s as never);
    }

    await dbBulkAdd('students', [dummyStudent1, dummyStudent2]);
    await dbBulkAdd('courses', [dummyCourse]);
    await dbBulkAdd('groups', [dummyGroup]);
    await dbBulkAdd('enrollments', [dummyEnrollment]);
    await dbBulkAdd('attendance', dummyAttendance);
    await dbBulkAdd('exams', [dummyExam]);
    await dbBulkAdd('grades', [dummyGrade]);
    await dbBulkAdd('payments', [dummyPayment]);
    await dbBulkAdd('installments', [dummyInstallment]);
  });

  it('looks up student by unique student code STU-KAREEM and returns full report', async () => {
    const res = await lookupStudentPortal('STU-KAREEM');
    expect(res.matches).toHaveLength(1);
    expect(res.selectedData).toBeDefined();

    const data = res.selectedData!;
    expect(data.student.name).toBe('كريم هاني');
    expect(data.code).toBe('STU-KAREEM');

    // Attendance stats: 4 total, 2 present, 1 late, 1 absent => (2+1)/4 = 75%
    expect(data.attendance.total).toBe(4);
    expect(data.attendance.present).toBe(2);
    expect(data.attendance.late).toBe(1);
    expect(data.attendance.absent).toBe(1);
    expect(data.attendance.rate).toBe(75);

    // Exam results
    expect(data.exams).toHaveLength(1);
    expect(data.exams[0].examName).toBe('امتحان الجبر الشهري');
    expect(data.exams[0].grade).toBe(46);
    expect(data.exams[0].maxGrade).toBe(50);
    expect(data.exams[0].percentage).toBe(92);

    // Finance & Installments
    expect(data.finance.totalPaid).toBe(300);
    expect(data.finance.remaining).toBe(300);
    expect(data.finance.upcomingInstallments).toHaveLength(1);
    expect(data.finance.recentPayments).toHaveLength(1);
  });

  it('detects multiple siblings when searching by parent phone', async () => {
    const res = await lookupStudentPortal('01099998888');
    expect(res.matches).toHaveLength(2);
    expect(res.selectedData).toBeUndefined(); // User must choose which child

    // Now selecting one sibling by ID:
    const childRes = await lookupStudentPortal('', 'stu-portal-2');
    expect(childRes.selectedData).toBeDefined();
    expect(childRes.selectedData?.student.name).toBe('مريم هاني');
  });

  it('returns empty matches when query does not match any record', async () => {
    const res = await lookupStudentPortal('01200000000');
    expect(res.matches).toHaveLength(0);
    expect(res.selectedData).toBeUndefined();
  });
});
