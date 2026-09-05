/**
 * الجدول الدراسي — الشبكة الأسبوعية وكشف التعارضات
 *
 * قبل كده الجدول كان نص جوّه كل مجموعة من غير أي فحص:
 * ممكن مدرس يتحط في مجموعتين في نفس الميعاد، أو قاعة تتحجز مرتين،
 * أو طالب يسجّل في مجموعتين متعارضتين — وكل ده يعدي من غير تنبيه.
 */
import { dbGetAll, Group, ScheduleItem, Student, Enrollment } from './db';

export const DAY_KEYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
export type DayKey = typeof DAY_KEYS[number];

export const DAY_LABEL: Record<DayKey, string> = {
  saturday: 'السبت',
  sunday: 'الأحد',
  monday: 'الاثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
  friday: 'الجمعة',
};

/** تحويل أي كتابة يوم عربية للمفتاح الإنجليزي (زي ما بيخزن في schedule.days) */
const DAY_ALIASES: Record<string, DayKey> = {
  'السبت': 'saturday', 'السيت': 'saturday', 'السب': 'saturday', 'saturday': 'saturday', 'sat': 'saturday',
  'الاحد': 'sunday', 'الأحد': 'sunday', 'sunday': 'sunday', 'sun': 'sunday',
  'الاثنين': 'monday', 'الإثنين': 'monday', 'الاتنين': 'monday', 'monday': 'monday', 'mon': 'monday',
  'الثلاثاء': 'tuesday', 'الثلاث': 'tuesday', 'التلات': 'tuesday', 'tuesday': 'tuesday', 'tue': 'tuesday',
  'الاربعاء': 'wednesday', 'الأربعاء': 'wednesday', 'الاربعا': 'wednesday', 'wednesday': 'wednesday', 'wed': 'wednesday',
  'الخميس': 'thursday', 'thursday': 'thursday', 'thu': 'thursday',
  'الجمعه': 'friday', 'الجمعة': 'friday', 'friday': 'friday', 'fri': 'friday',
};

export function normalizeDay(input: string): DayKey | null {
  const key = String(input || '').trim().toLowerCase();
  if (!key) return null;
  if ((DAY_KEYS as readonly string[]).includes(key)) return key as DayKey;
  return DAY_ALIASES[key] || DAY_ALIASES[String(input).trim()] || null;
}

/** دقائق من بداية اليوم (للترتيب والمقارنة) */
export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '').trim());
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export interface Slot {
  day: DayKey;
  start: string;
  end: string;
  room?: string;
}

/** تفريد جدول مجموعة لخانات (يوم + من/إلى) */
export function groupSlots(group: Pick<Group, 'schedule'>): Slot[] {
  const slots: Slot[] = [];
  for (const item of group.schedule || []) {
    for (const rawDay of item.days || []) {
      const day = normalizeDay(rawDay);
      if (!day) continue;
      slots.push({
        day,
        start: item.startTime,
        end: item.endTime,
        room: (item.room || '').trim() || undefined,
      });
    }
  }
  return slots;
}

/** هل خانتين متداخلين في نفس اليوم؟ */
export function slotsOverlap(a: Slot, b: Slot): boolean {
  if (a.day !== b.day) return false;
  const aStart = toMinutes(a.start);
  const aEnd = toMinutes(a.end) || aStart + 60;
  const bStart = toMinutes(b.start);
  const bEnd = toMinutes(b.end) || bStart + 60;
  return aStart < bEnd && bStart < aEnd;
}

export type ConflictKind = 'teacher' | 'room' | 'student';

export interface ScheduleConflict {
  kind: ConflictKind;
  /** رسالة عربية جاهزة للعرض */
  message: string;
  day: DayKey;
  dayLabel: string;
  time: string;
  groupIds: string[];
  groupNames: string[];
  /** اسم المدرس/القاعة/الطالب المتعارض */
  subject: string;
  severity: 'error' | 'warning';
}

export interface ConflictInput {
  groups: Group[];
  /** أسماء المدرسين (للعرض) */
  teacherNames?: Record<string, string>;
  /** تسجيلات الطلاب النشطة (لكشف تعارض الطالب) */
  enrollments?: Enrollment[];
  studentNames?: Record<string, string>;
}

/**
 * كشف كل التعارضات في الجدول:
 *  1) مدرس في مجموعتين في نفس الوقت (error)
 *  2) قاعة محجوزة مرتين في نفس الوقت (error)
 *  3) طالب مسجّل في مجموعتين متعارضتين (error)
 */
export function findScheduleConflicts(input: ConflictInput): ScheduleConflict[] {
  const { groups, teacherNames = {}, studentNames = {}, enrollments = [] } = input;
  const active = groups.filter(g => !g.deleted && g.status !== 'ended');
  const conflicts: ScheduleConflict[] = [];
  const seen = new Set<string>();

  const push = (c: ScheduleConflict) => {
    const key = `${c.kind}|${c.subject}|${c.day}|${c.time}|${c.groupIds.join('+')}`;
    if (seen.has(key)) return;
    seen.add(key);
    conflicts.push(c);
  };

  const withSlots = active.map(g => ({ group: g, slots: groupSlots(g) }));

  for (let i = 0; i < withSlots.length; i++) {
    for (let j = i + 1; j < withSlots.length; j++) {
      const A = withSlots[i];
      const B = withSlots[j];

      for (const a of A.slots) {
        for (const b of B.slots) {
          if (!slotsOverlap(a, b)) continue;
          const time = `${a.start}–${a.end}`;
          const dayLabel = DAY_LABEL[a.day];

          // 1) نفس المدرس
          if (A.group.teacherId && A.group.teacherId === B.group.teacherId) {
            const subject = teacherNames[A.group.teacherId] || 'مدرس';
            push({
              kind: 'teacher',
              subject,
              day: a.day,
              dayLabel,
              time,
              groupIds: [A.group.id, B.group.id],
              groupNames: [A.group.name, B.group.name],
              message: `${subject} عنده مجموعتين في نفس الوقت: «${A.group.name}» و«${B.group.name}» (${dayLabel} ${time})`,
              severity: 'error',
            });
          }

          // 2) نفس القاعة
          if (a.room && b.room && a.room === b.room) {
            push({
              kind: 'room',
              subject: a.room,
              day: a.day,
              dayLabel,
              time,
              groupIds: [A.group.id, B.group.id],
              groupNames: [A.group.name, B.group.name],
              message: `قاعة ${a.room} محجوزة لمجموعتين في نفس الوقت: «${A.group.name}» و«${B.group.name}» (${dayLabel} ${time})`,
              severity: 'error',
            });
          }

          // 3) نفس الطالب في المجموعتين
          const studentsA = new Set(activeStudentIds(A.group, enrollments));
          const overlapStudents = activeStudentIds(B.group, enrollments).filter(s => studentsA.has(s));
          for (const sid of overlapStudents) {
            const subject = studentNames[sid] || 'طالب';
            push({
              kind: 'student',
              subject,
              day: a.day,
              dayLabel,
              time,
              groupIds: [A.group.id, B.group.id],
              groupNames: [A.group.name, B.group.name],
              message: `${subject} مسجّل في مجموعتين متعارضتين: «${A.group.name}» و«${B.group.name}» (${dayLabel} ${time})`,
              severity: 'error',
            });
          }
        }
      }
    }
  }

  const order: Record<ConflictKind, number> = { teacher: 0, room: 1, student: 2 };
  return conflicts.sort((a, b) =>
    order[a.kind] - order[b.kind] || a.dayLabel.localeCompare(b.dayLabel) || a.time.localeCompare(b.time),
  );
}

/** طلاب المجموعة النشطين (من enrollments لو متاحة، وإلا من المصفوفة المخزنة) */
function activeStudentIds(group: Group, enrollments: Enrollment[]): string[] {
  const fromEnrollments = enrollments
    .filter(e => !e.deleted && e.status === 'active' && e.groupId === group.id)
    .map(e => e.studentId);
  return fromEnrollments.length > 0 ? fromEnrollments : (group.studentIds || []);
}

// ==================== WEEKLY GRID ====================

export interface TimetableCell {
  day: DayKey;
  slot: string;
  groups: {
    id: string;
    name: string;
    teacherName: string;
    courseName: string;
    room?: string;
    start: string;
    end: string;
    students: number;
    maxStudents: number;
  }[];
}

/**
 * شبكة الجدول الأسبوعي: كل يوم فيه الخانات الزمنية مرتبة، وكل خانة فيها مجموعاتها.
 */
export function buildTimetable(opts: {
  groups: Group[];
  teacherNames?: Record<string, string>;
  courseNames?: Record<string, string>;
  enrollments?: Enrollment[];
}): { days: DayKey[]; cells: TimetableCell[]; slots: string[] } {
  const { groups, teacherNames = {}, courseNames = {}, enrollments = [] } = opts;
  const active = groups.filter(g => !g.deleted && g.status !== 'ended');

  const byKey = new Map<string, TimetableCell>();
  const slotSet = new Set<string>();
  const usedDays = new Set<DayKey>();

  for (const g of active) {
    const studentCount = activeStudentIds(g, enrollments).length;
    for (const slot of groupSlots(g)) {
      usedDays.add(slot.day);
      const key = `${slot.day}|${slot.start}`;
      slotSet.add(slot.start);
      const cell = byKey.get(key) || { day: slot.day, slot: slot.start, groups: [] };
      cell.groups.push({
        id: g.id,
        name: g.name,
        teacherName: teacherNames[g.teacherId] || '—',
        courseName: courseNames[g.courseId] || '—',
        room: slot.room,
        start: slot.start,
        end: slot.end,
        students: studentCount,
        maxStudents: g.maxStudents,
      });
      byKey.set(key, cell);
    }
  }

  const days = (usedDays.size > 0
    ? DAY_KEYS.filter(d => usedDays.has(d))
    : [...DAY_KEYS]) as DayKey[];
  const slots = Array.from(slotSet).sort((a, b) => toMinutes(a) - toMinutes(b));

  for (const cell of byKey.values()) {
    cell.groups.sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || a.name.localeCompare(b.name));
  }

  const cells = Array.from(byKey.values()).sort((a, b) =>
    days.indexOf(a.day) - days.indexOf(b.day) || toMinutes(a.slot) - toMinutes(b.slot),
  );

  return { days, cells, slots };
}

/** حصص يوم معيّن (للداشبورد وشاشة الاستقبال) */
export function sessionsForDay(opts: {
  groups: Group[];
  day: DayKey;
  teacherNames?: Record<string, string>;
  courseNames?: Record<string, string>;
  enrollments?: Enrollment[];
}): TimetableCell['groups'] {
  const { groups, day, teacherNames = {}, courseNames = {}, enrollments = [] } = opts;
  const out: TimetableCell['groups'] = [];

  for (const g of groups) {
    if (g.deleted || g.status === 'ended') continue;
    for (const slot of groupSlots(g)) {
      if (slot.day !== day) continue;
      out.push({
        id: g.id,
        name: g.name,
        teacherName: teacherNames[g.teacherId] || '—',
        courseName: courseNames[g.courseId] || '—',
        room: slot.room,
        start: slot.start,
        end: slot.end,
        students: activeStudentIds(g, enrollments).length,
        maxStudents: g.maxStudents,
      });
    }
  }

  return out.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

/** مفتاح اليوم الحالي (بيستخدم نفس أسماء الأيام المخزنة) */
export function todayKey(): DayKey {
  const map: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return map[new Date().getDay()];
}

/** تحميل كل ما تحتاجه شاشة الجدول */
export async function loadTimetableData() {
  const [groups, teachers, courses, students, enrollments] = await Promise.all([
    dbGetAll<Group>('groups'),
    dbGetAll<{ id: string; name: string }>('teachers'),
    dbGetAll<{ id: string; name: string }>('courses'),
    dbGetAll<Student>('students'),
    dbGetAll<Enrollment>('enrollments'),
  ]);

  const teacherNames: Record<string, string> = {};
  teachers.forEach(t => { teacherNames[t.id] = t.name; });
  const courseNames: Record<string, string> = {};
  courses.forEach(c => { courseNames[c.id] = c.name; });
  const studentNames: Record<string, string> = {};
  students.forEach(s => { studentNames[s.id] = s.name; });

  return { groups, enrollments, teacherNames, courseNames, studentNames };
}

export type { ScheduleItem };
