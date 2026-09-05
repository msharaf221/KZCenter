/**
 * تنبيهات الغياب المتكرر.
 *
 * طالب يغيب 3 مرات متتالية (بدون عذر) = مؤشر انسحاب/تسرّب محتمل → تنبيه للإدارة
 * واتصال/رسالة لولي الأمر. المنطق نقي وقابل للاختبار، وطبقة قاعدة البيانات تجمّع
 * السجلات وتستدعيه.
 */
import type { Attendance, Student, Group } from './db';
import { dbGetAll, dbGetByIndex, dbGetById } from './db';

/** عدد الغيابات المتتالية الذي يبدأ عنده التنبيه */
export const ABSENCE_ALERT_THRESHOLD = 3;

type StreakRecord = Pick<Attendance, 'date' | 'status'>;

/**
 * أطول سلسلة غياب متتالية في سجلات (مفروض لمجموعة واحدة).
 * حاضر/متأخر/مستأذن يقطع السلسلة؛ الغياب بدون عذر فقط هو اللي يعدّ.
 */
export function longestAbsenceStreak(records: StreakRecord[]): number {
  const sorted = [...records].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let streak = 0;
  let max = 0;
  for (const r of sorted) {
    if (r.status === 'absent') {
      streak += 1;
      if (streak > max) max = streak;
    } else {
      streak = 0;
    }
  }
  return max;
}

/**
 * السلسلة الحالية: طول الغياب المتتالي في آخر التسجيلات.
 * لو آخر تسجيلة حضور/متأخر/مستأذن = 0 (السلسلة اتقطعت).
 */
export function currentAbsenceStreak(records: StreakRecord[]): number {
  const sorted = [...records].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].status === 'absent') streak += 1;
    else break;
  }
  return streak;
}

export interface AbsenceAlert {
  studentId: string;
  studentName: string;
  parentPhone?: string;
  groupId: string;
  groupName: string;
  streak: number;
  lastDate: string;
}

interface GroupedInput {
  studentId: string;
  studentName: string;
  parentPhone?: string;
  groupId: string;
  groupName: string;
  records: StreakRecord[];
}

/**
 * من سجلات مجمّعة (طالب × مجموعة) يطلّع اللي وصلوا للسلسلة الحالية للحدّ.
 * بيعتمد currentAbsenceStreak عشان التنبيه يخص الطلاب اللي لسه غايبين دلوقتي.
 */
export function findRepeatedAbsences(
  groups: GroupedInput[],
  threshold: number = ABSENCE_ALERT_THRESHOLD,
): AbsenceAlert[] {
  const alerts: AbsenceAlert[] = [];
  for (const g of groups) {
    const streak = currentAbsenceStreak(g.records);
    if (streak >= threshold) {
      const lastDate = [...g.records]
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]?.date || '';
      alerts.push({
        studentId: g.studentId,
        studentName: g.studentName,
        parentPhone: g.parentPhone,
        groupId: g.groupId,
        groupName: g.groupName,
        streak,
        lastDate,
      });
    }
  }
  // الأطول سلسلة أولاً
  return alerts.sort((a, b) => b.streak - a.streak || b.lastDate.localeCompare(a.lastDate));
}

/**
 * يجمّع سجلات الحضور من القاعدة ويطلّع تنبيهات الغياب المتكرر لكل الطلاب.
 * بيتجاهل الطلاب المحذوفين والمجموعات المنتهية.
 */
export async function getRepeatedAbsenceAlerts(
  threshold: number = ABSENCE_ALERT_THRESHOLD,
): Promise<AbsenceAlert[]> {
  const [attendance, students, groups] = await Promise.all([
    dbGetAll<Attendance>('attendance'),
    dbGetAll<Student>('students'),
    dbGetAll<Group>('groups'),
  ]);

  const studentMap = new Map(students.map(s => [s.id, s]));
  const groupMap = new Map(groups.map(g => [g.id, g]));

  // تجميع السجلات لكل (طالب × مجموعة)
  const byKey = new Map<string, GroupedInput>();
  for (const a of attendance) {
    const student = studentMap.get(a.studentId);
    const group = groupMap.get(a.groupId);
    if (!student || !group) continue;
    if (group.status === 'ended') continue;
    const key = `${a.studentId}::${a.groupId}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        studentId: a.studentId,
        studentName: student.name,
        parentPhone: student.parentPhone,
        groupId: a.groupId,
        groupName: group.name,
        records: [],
      };
      byKey.set(key, entry);
    }
    entry.records.push({ date: a.date, status: a.status });
  }

  return findRepeatedAbsences(Array.from(byKey.values()), threshold);
}

/**
 * هل وصل طالب في مجموعة لتوّه لحدّ التنبيه (سلسلة حالية = الحد بالظبط)؟
 * تُستخدم وقت حفظ الحضور لإطلاق التنبيه مرة واحدة عند عبور الحد.
 */
export async function checkAbsenceAlertForStudent(
  studentId: string,
  groupId: string,
  threshold: number = ABSENCE_ALERT_THRESHOLD,
): Promise<AbsenceAlert | null> {
  const records = await dbGetByIndex<Attendance>('attendance', 'by-studentGroup', [studentId, groupId]);
  const streak = currentAbsenceStreak(records);
  if (streak !== threshold) return null; // ننبّه عند عبور الحد بالظبط (مرة واحدة)

  const [student, group] = await Promise.all([
    dbGetById<Student>('students', studentId),
    dbGetById<Group>('groups', groupId),
  ]);
  if (!student || !group) return null;
  const lastDate = records.map(r => r.date).sort().pop() || '';
  return {
    studentId,
    studentName: student.name,
    parentPhone: student.parentPhone,
    groupId,
    groupName: group.name,
    streak,
    lastDate,
  };
}
