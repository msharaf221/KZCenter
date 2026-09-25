import dayjs from 'dayjs';
import { readAll, readById, readByIndex } from '../../data/readers';
import type {
  Attendance,
  Course,
  Enrollment,
  Exam,
  Grade,
  Group,
  Payment,
  Student,
  Teacher, UserRole
} from '../../domain/models';
import type { RenewalInfo } from '../../lib/billing';
import { renewalInfo } from '../../lib/billing';
import { visibleGroupIds } from '../../lib/permissions';
import type { StudentBalance } from '../balanceService';
import { getStudentBalance } from '../balanceService';
import type { TransferRecord } from '../transferService';
import { getTransferHistory } from '../transferService';

export function emptyStudentProfile(requestedId = '') {
  return {
    requestedId,
    student: null as Student | null,
    allGroups: [] as Group[],
    allCourses: [] as Course[],
    allTeachers: [] as Teacher[],
    groups: [] as (Group & { courseName: string; teacherName: string })[],
    payments: [] as Payment[],
    balance: null as StudentBalance | null,
    renewalByGroup: {} as Record<string, RenewalInfo>,
    enrollmentByGroup: {} as Record<string, Enrollment>,
    transfers: [] as TransferRecord[],
    attendance: [] as Attendance[],
    examResults: [] as (Grade & { examName: string; maxGrade: number; examDate: string })[],
  };
}

export async function loadStudentProfile(id: string, upcomingDueDays?: number, viewer?: { role?: UserRole; teacherId?: string }) {
  const s = await readById<Student>('students', id);

  if (!s) return emptyStudentProfile(id);

  const everyGroup = await readAll<Group>('groups');
  const allowed = visibleGroupIds({ role: viewer?.role, teacherId: viewer?.teacherId, groups: everyGroup });
  if (allowed && !s.enrolledGroups?.some(id => allowed.has(id))) return emptyStudentProfile(id);
  const allGroups = allowed ? everyGroup.filter(group => allowed.has(group.id)) : everyGroup;

  const allCourses = await readAll<Course>('courses');

  const allTeachers = await readAll<Teacher>('teachers');

  const studentGroups = allGroups.filter(g => s.enrolledGroups?.includes(g.id));

  const enrichedGroups = studentGroups.map(g => ({
    ...g,
    courseName: allCourses.find(c => c.id === g.courseId)?.name || 'غير معروف',
    teacherName: allTeachers.find(t => t.id === g.teacherId)?.name || 'غير معروف',
  }));

  const studentPayments = await readByIndex<Payment>('payments', 'by-studentId', id);

  // الحساب (شهر بشهر)
  const b = await getStudentBalance(id);

  // حالة الاشتراك (ساري/قرب ينتهي/منتهي) لكل مجموعة
  const today = dayjs().format('YYYY-MM-DD');

  const ahead = upcomingDueDays ?? 7;

  const rmap: Record<string, RenewalInfo> = {};

  for (const g of studentGroups) {
    const gb = b?.groups.find(x => x.groupId === g.id);
    rmap[g.id] = renewalInfo(gb?.installments || [], today, ahead);
  }

  const ens = await readByIndex<Enrollment>('enrollments', 'by-studentId', id);

  const emap: Record<string, Enrollment> = {};

  for (const e of ens) if (e.status === 'active' && (!allowed || allowed.has(e.groupId))) emap[e.groupId] = e;

  // سجل الحضور (using index for efficiency)
  const studentAttendance = await readByIndex<Attendance>('attendance', 'by-studentId', id);

  // نتائج الامتحانات (امتحانات مجموعات الطالب + درجة الطالب فيها)
  const allExams = (await readAll<Exam>('exams')).filter(exam => !allowed || allowed.has(exam.groupId));

  const allGrades = await readAll<Grade>('grades');

  const studentGrades = allGrades.filter(g => g.studentId === id);

  const results = studentGrades
    .map(g => {
      const exam = allExams.find(e => e.id === g.examId);
      if (!exam) return null;
      return { ...g, examName: exam.name, maxGrade: exam.maxGrade, examDate: exam.date };
    })
    .filter((r): r is Grade & { examName: string; maxGrade: number; examDate: string } => r !== null)
    .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
  return {
    requestedId: id,
    student: s,
    allGroups: allGroups,
    allCourses: allCourses,
    allTeachers: allTeachers,
    groups: enrichedGroups,
    payments: studentPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    balance: b,
    renewalByGroup: rmap,
    enrollmentByGroup: emap,
    transfers: await getTransferHistory(id),
    attendance: studentAttendance.filter(record => !allowed || allowed.has(record.groupId)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    examResults: results,
  };
}
