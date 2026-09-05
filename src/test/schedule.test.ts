/**
 * اختبارات الجدول الأسبوعي وكشف التعارضات — دوال نقية في src/lib/schedule.ts
 *
 * التعارضات الثلاثة: مدرس في مكانين · قاعة محجوزة مرتين · طالب في مجموعتين متعارضتين.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeDay, toMinutes, groupSlots, slotsOverlap,
  findScheduleConflicts, buildTimetable, sessionsForDay, todayKey, DAY_KEYS, DAY_LABEL,
  type Slot,
} from '../lib/schedule';
import type { Group, Enrollment } from '../lib/db';

function group(o: Partial<Group> = {}): Group {
  return {
    id: o.id || 'g1',
    name: o.name || 'س.ر 1',
    courseId: o.courseId || 'c1',
    teacherId: o.teacherId || 't1',
    schedule: o.schedule || [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }],
    maxStudents: o.maxStudents ?? 20,
    status: o.status || 'open',
    studentIds: o.studentIds || ['s1'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deleted: o.deleted,
  };
}

function enrollment(studentId: string, groupId: string, o: Partial<Enrollment> = {}): Enrollment {
  return {
    id: `e-${studentId}-${groupId}`,
    studentId, groupId,
    status: o.status || 'active',
    enrolledAt: '2026-01-01T00:00:00.000Z',
    droppedAt: o.droppedAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deleted: o.deleted,
  };
}

const slot = (day: string, start: string, end: string, room?: string): Slot => ({
  day: day as Slot['day'], start, end, room,
});

describe('normalizeDay — توحيد كتابة الأيام', () => {
  it('المفاتيح الإنجليزية بتمر زي ما هي', () => {
    for (const d of DAY_KEYS) expect(normalizeDay(d)).toBe(d);
  });

  it('الكتابات العربية الشائعة', () => {
    expect(normalizeDay('السبت')).toBe('saturday');
    expect(normalizeDay('السيت')).toBe('saturday');
    expect(normalizeDay('الأحد')).toBe('sunday');
    expect(normalizeDay('الاحد')).toBe('sunday');
    expect(normalizeDay('الإثنين')).toBe('monday');
    expect(normalizeDay('الاتنين')).toBe('monday');
    expect(normalizeDay('الثلاثاء')).toBe('tuesday');
    expect(normalizeDay('التلات')).toBe('tuesday');
    expect(normalizeDay('الأربعاء')).toBe('wednesday');
    expect(normalizeDay('الخميس')).toBe('thursday');
    expect(normalizeDay('الجمعة')).toBe('friday');
    expect(normalizeDay('الجمعه')).toBe('friday');
  });

  it('الاختصارات الإنجليزية', () => {
    expect(normalizeDay('sat')).toBe('saturday');
    expect(normalizeDay('mon')).toBe('monday');
    expect(normalizeDay('fri')).toBe('friday');
  });

  it('المسافات وحالة الأحرف ما تأثرش', () => {
    expect(normalizeDay('  Saturday ')).toBe('saturday');
    expect(normalizeDay('SATURDAY')).toBe('saturday');
  });

  it('نص مش يوم = null', () => {
    expect(normalizeDay('')).toBeNull();
    expect(normalizeDay('مفيش')).toBeNull();
    expect(normalizeDay('holiday')).toBeNull();
  });
});

describe('toMinutes', () => {
  it('ساعة:دقيقة لدقائق', () => {
    expect(toMinutes('16:00')).toBe(960);
    expect(toMinutes('18:30')).toBe(1110);
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('9:05')).toBe(545);
  });

  it('نص فاسد = صفر', () => {
    expect(toMinutes('')).toBe(0);
    expect(toMinutes('مساءً')).toBe(0);
  });
});

describe('groupSlots — تفريد الجدول', () => {
  it('كل يوم في كل بند يبقى خانة مستقلة', () => {
    const g = group({
      schedule: [
        { days: ['saturday', 'tuesday'], startTime: '16:00', endTime: '18:00' },
        { days: ['monday'], startTime: '19:00', endTime: '20:00', room: 'قاعة 2' },
      ],
    });
    const slots = groupSlots(g);
    expect(slots).toHaveLength(3);
    expect(slots[0]).toEqual({ day: 'saturday', start: '16:00', end: '18:00', room: undefined });
    expect(slots[2]).toEqual({ day: 'monday', start: '19:00', end: '20:00', room: 'قاعة 2' });
  });

  it('يوم مكتوب غلط بيتخطى', () => {
    const slots = groupSlots(group({ schedule: [{ days: ['السبت', 'holiday'], startTime: '16:00', endTime: '18:00' }] }));
    expect(slots).toHaveLength(1);
    expect(slots[0].day).toBe('saturday');
  });

  it('جدول فاضي = مفيش خانات', () => {
    expect(groupSlots(group({ schedule: [] }))).toHaveLength(0);
  });

  it('القاعة الفاضية بتبقى undefined', () => {
    const slots = groupSlots(group({ schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00', room: '  ' }] }));
    expect(slots[0].room).toBeUndefined();
  });
});

describe('slotsOverlap', () => {
  it('تداخل جزئي', () => {
    expect(slotsOverlap(slot('saturday', '16:00', '18:00'), slot('saturday', '17:00', '19:00'))).toBe(true);
  });

  it('احتواء كامل', () => {
    expect(slotsOverlap(slot('saturday', '15:00', '20:00'), slot('saturday', '16:00', '18:00'))).toBe(true);
  });

  it('مفيش تداخل (واحدة بتخلص قبل ما التانية تبدأ)', () => {
    expect(slotsOverlap(slot('saturday', '16:00', '18:00'), slot('saturday', '18:00', '20:00'))).toBe(false);
    expect(slotsOverlap(slot('saturday', '18:00', '20:00'), slot('saturday', '16:00', '18:00'))).toBe(false);
  });

  it('يوم مختلف = مفيش تعارض', () => {
    expect(slotsOverlap(slot('saturday', '16:00', '18:00'), slot('sunday', '16:00', '18:00'))).toBe(false);
  });

  it('نفس الميعاد بالظبط = تداخل', () => {
    expect(slotsOverlap(slot('saturday', '16:00', '18:00'), slot('saturday', '16:00', '18:00'))).toBe(true);
  });

  it('ميعاد نهاية ناقص = ساعة افتراضية', () => {
    expect(slotsOverlap(slot('saturday', '16:00', ''), slot('saturday', '16:30', ''))).toBe(true);
    expect(slotsOverlap(slot('saturday', '16:00', ''), slot('saturday', '17:30', ''))).toBe(false);
  });
});

describe('findScheduleConflicts — مدرس في مكانين', () => {
  it('بيكشف نفس المدرس في مجموعتين متداخلتين', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', name: 'الأولى', teacherId: 't1', studentIds: ['s1'], schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g2', name: 'التانية', teacherId: 't1', studentIds: ['s2'], schedule: [{ days: ['saturday'], startTime: '17:00', endTime: '19:00' }] }),
      ],
      teacherNames: { t1: 'أستاذ أحمد' },
    });
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe('teacher');
    expect(c[0].subject).toBe('أستاذ أحمد');
    expect(c[0].severity).toBe('error');
    expect(c[0].groupIds).toEqual(['g1', 'g2']);
    expect(c[0].message).toContain('أستاذ أحمد');
    expect(c[0].message).toContain('الأولى');
  });

  it('مدرسين مختلفين = مفيش تعارض', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', teacherId: 't1', schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g2', teacherId: 't2', schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
      ],
    });
    expect(c.filter(x => x.kind === 'teacher')).toHaveLength(0);
  });

  it('نفس المدرس في ميعادين مختلفين = مفيش تعارض', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', teacherId: 't1', schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g2', teacherId: 't1', schedule: [{ days: ['saturday'], startTime: '18:00', endTime: '20:00' }] }),
      ],
    });
    expect(c).toHaveLength(0);
  });

  it('اسم المدرس غير معروف = «مدرس»', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', teacherId: 't1', studentIds: ['s1'], schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g2', teacherId: 't1', studentIds: ['s2'], schedule: [{ days: ['saturday'], startTime: '16:30', endTime: '18:30' }] }),
      ],
    });
    expect(c[0].subject).toBe('مدرس');
  });
});

describe('findScheduleConflicts — قاعة محجوزة مرتين', () => {
  it('بيكشف نفس القاعة في نفس الوقت لمدرسين مختلفين', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', teacherId: 't1', studentIds: ['s1'], schedule: [{ days: ['monday'], startTime: '16:00', endTime: '18:00', room: 'قاعة 1' }] }),
        group({ id: 'g2', teacherId: 't2', studentIds: ['s2'], schedule: [{ days: ['monday'], startTime: '17:00', endTime: '19:00', room: 'قاعة 1' }] }),
      ],
    });
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe('room');
    expect(c[0].subject).toBe('قاعة 1');
  });

  it('قاعات مختلفة = مفيش تعارض', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', teacherId: 't1', studentIds: ['s1'], schedule: [{ days: ['monday'], startTime: '16:00', endTime: '18:00', room: 'قاعة 1' }] }),
        group({ id: 'g2', teacherId: 't2', studentIds: ['s2'], schedule: [{ days: ['monday'], startTime: '16:00', endTime: '18:00', room: 'قاعة 2' }] }),
      ],
    });
    expect(c).toHaveLength(0);
  });

  it('من غير قاعة محددة مفيش تعارض قاعات', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', teacherId: 't1', schedule: [{ days: ['monday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g2', teacherId: 't2', schedule: [{ days: ['monday'], startTime: '16:00', endTime: '18:00' }] }),
      ],
    });
    expect(c.filter(x => x.kind === 'room')).toHaveLength(0);
  });
});

describe('findScheduleConflicts — طالب في مجموعتين', () => {
  it('بيكشف الطالب المشترك في وقت متداخل', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', teacherId: 't1', studentIds: ['s1'], schedule: [{ days: ['sunday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g2', teacherId: 't2', studentIds: ['s1'], schedule: [{ days: ['sunday'], startTime: '17:00', endTime: '19:00' }] }),
      ],
      studentNames: { s1: 'أحمد محمد' },
    });
    const studentConflicts = c.filter(x => x.kind === 'student');
    expect(studentConflicts).toHaveLength(1);
    expect(studentConflicts[0].subject).toBe('أحمد محمد');
  });

  it('طلاب مختلفين = مفيش تعارض', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', teacherId: 't1', studentIds: ['s1'], schedule: [{ days: ['sunday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g2', teacherId: 't2', studentIds: ['s2'], schedule: [{ days: ['sunday'], startTime: '16:00', endTime: '18:00' }] }),
      ],
    });
    expect(c.filter(x => x.kind === 'student')).toHaveLength(0);
  });

  it('بيستخدم التسجيلات النشطة (مش المصفوفة المخزنة) لما تكون متاحة', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', teacherId: 't1', studentIds: [], schedule: [{ days: ['sunday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g2', teacherId: 't2', studentIds: [], schedule: [{ days: ['sunday'], startTime: '16:30', endTime: '18:30' }] }),
      ],
      enrollments: [enrollment('s1', 'g1'), enrollment('s1', 'g2')],
      studentNames: { s1: 'منى' },
    });
    expect(c.filter(x => x.kind === 'student')).toHaveLength(1);
  });

  it('تسجيل منتهي/محذوف ما يعملش تعارض', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', teacherId: 't1', studentIds: [], schedule: [{ days: ['sunday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g2', teacherId: 't2', studentIds: [], schedule: [{ days: ['sunday'], startTime: '16:30', endTime: '18:30' }] }),
      ],
      enrollments: [enrollment('s1', 'g1'), enrollment('s1', 'g2', { status: 'dropped' })],
    });
    expect(c.filter(x => x.kind === 'student')).toHaveLength(0);
  });
});

describe('findScheduleConflicts — حالات عامة', () => {
  it('المجموعة المنتهية والمحذوفة خارج الفحص', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', teacherId: 't1', schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g2', teacherId: 't1', status: 'ended', schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g3', teacherId: 't1', deleted: true, schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
      ],
    });
    expect(c).toHaveLength(0);
  });

  it('مجموعة واحدة بميعادين متداخلين لنفس المدرس', () => {
    const c = findScheduleConflicts({
      groups: [group({
        id: 'g1', teacherId: 't1',
        schedule: [
          { days: ['saturday'], startTime: '16:00', endTime: '18:00' },
          { days: ['saturday'], startTime: '17:00', endTime: '19:00' },
        ],
      })],
    });
    // المقارنة بين المجموعات المختلفة بس — بندّين في نفس المجموعة مش تعارض مدرس
    expect(c.filter(x => x.kind === 'teacher')).toHaveLength(0);
  });

  it('التكرار ما بيتسجلش مرتين', () => {
    const groups = [
      group({ id: 'g1', teacherId: 't1', studentIds: ['s1'], schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
      group({ id: 'g2', teacherId: 't1', studentIds: ['s2'], schedule: [{ days: ['saturday'], startTime: '17:00', endTime: '19:00' }] }),
    ];
    const once = findScheduleConflicts({ groups });
    expect(once).toHaveLength(1);
    // نفس الإدخال تاني = نفس النتيجة (مفيش تراكم حالة بين النداءات)
    expect(findScheduleConflicts({ groups })).toHaveLength(1);
  });

  it('الترتيب: مدرس ← قاعة ← طالب', () => {
    const c = findScheduleConflicts({
      groups: [
        group({ id: 'g1', teacherId: 't1', studentIds: ['s1'], schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00', room: 'R1' }] }),
        group({ id: 'g2', teacherId: 't1', studentIds: ['s1'], schedule: [{ days: ['saturday'], startTime: '17:00', endTime: '19:00', room: 'R1' }] }),
      ],
    });
    expect(c.map(x => x.kind)).toEqual(['teacher', 'room', 'student']);
  });

  it('مفيش مجموعات = مفيش تعارضات', () => {
    expect(findScheduleConflicts({ groups: [] })).toHaveLength(0);
  });
});

describe('buildTimetable — شبكة الأسبوع', () => {
  it('بيجمع المجموعات في خانات (يوم + بداية)', () => {
    const { cells, slots, days } = buildTimetable({
      groups: [
        group({ id: 'g1', name: 'أ', schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g2', name: 'ب', schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g3', name: 'ج', schedule: [{ days: ['monday'], startTime: '18:00', endTime: '20:00' }] }),
      ],
    });
    expect(days).toEqual(['saturday', 'monday']);
    expect(slots).toEqual(['16:00', '18:00']);
    expect(cells).toHaveLength(2);
    expect(cells[0].day).toBe('saturday');
    expect(cells[0].groups.map(g => g.name)).toEqual(['أ', 'ب']);
    expect(cells[1].day).toBe('monday');
  });

  it('مفيش مجموعات = كل الأيام ظاهرة', () => {
    const { days, cells } = buildTimetable({ groups: [] });
    expect(days).toEqual([...DAY_KEYS]);
    expect(cells).toHaveLength(0);
  });

  it('بيحط أسماء المدرسين والكورسات', () => {
    const { cells } = buildTimetable({
      groups: [group({ id: 'g1', teacherId: 't1', courseId: 'c1' })],
      teacherNames: { t1: 'أستاذ أحمد' },
      courseNames: { c1: 'علوم' },
    });
    expect(cells[0].groups[0].teacherName).toBe('أستاذ أحمد');
    expect(cells[0].groups[0].courseName).toBe('علوم');
  });

  it('اسم مش معروف = «—»', () => {
    const { cells } = buildTimetable({ groups: [group({ id: 'g1', teacherId: 'tx', courseId: 'cx' })] });
    expect(cells[0].groups[0].teacherName).toBe('—');
    expect(cells[0].groups[0].courseName).toBe('—');
  });

  it('بيحسب عدد الطلاب من التسجيلات النشطة', () => {
    const { cells } = buildTimetable({
      groups: [group({ id: 'g1', studentIds: ['s1', 's2', 's3'], maxStudents: 10 })],
      enrollments: [enrollment('s1', 'g1'), enrollment('s2', 'g1'), enrollment('s3', 'g1', { status: 'dropped' })],
    });
    expect(cells[0].groups[0].students).toBe(2);
    expect(cells[0].groups[0].maxStudents).toBe(10);
  });

  it('المجموعة المنتهية/المحذوفة ما تظهرش', () => {
    const { cells } = buildTimetable({
      groups: [
        group({ id: 'g1', status: 'ended' }),
        group({ id: 'g2', deleted: true }),
      ],
    });
    expect(cells).toHaveLength(0);
  });

  it('الخانات مرتبة باليوم ثم الوقت', () => {
    const { cells } = buildTimetable({
      groups: [
        group({ id: 'g1', schedule: [{ days: ['monday'], startTime: '18:00', endTime: '20:00' }] }),
        group({ id: 'g2', schedule: [{ days: ['saturday'], startTime: '20:00', endTime: '22:00' }] }),
        group({ id: 'g3', schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
      ],
    });
    expect(cells.map(c => `${c.day}|${c.slot}`)).toEqual(['saturday|16:00', 'saturday|20:00', 'monday|18:00']);
  });

  it('DAY_LABEL بيغطي كل الأيام', () => {
    for (const d of DAY_KEYS) expect(DAY_LABEL[d]).toBeTruthy();
  });
});

describe('sessionsForDay — حصص يوم', () => {
  it('بيرجع حصص اليوم المطلوب بس', () => {
    const rows = sessionsForDay({
      groups: [
        group({ id: 'g1', schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g2', schedule: [{ days: ['sunday'], startTime: '16:00', endTime: '18:00' }] }),
        group({ id: 'g3', schedule: [{ days: ['saturday', 'monday'], startTime: '19:00', endTime: '21:00' }] }),
      ],
      day: 'saturday',
    });
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.id)).toEqual(['g1', 'g3']);
  });

  it('مرتّب حسب وقت البداية', () => {
    const rows = sessionsForDay({
      groups: [
        group({ id: 'g1', schedule: [{ days: ['saturday'], startTime: '20:00', endTime: '22:00' }] }),
        group({ id: 'g2', schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }] }),
      ],
      day: 'saturday',
    });
    expect(rows.map(r => r.id)).toEqual(['g2', 'g1']);
  });

  it('يوم مفيهوش حاجة = قائمة فاضية', () => {
    expect(sessionsForDay({ groups: [group({ id: 'g1' })], day: 'friday' })).toHaveLength(0);
  });
});

describe('todayKey', () => {
  it('بيرجع مفتاح يوم صالح', () => {
    expect(DAY_KEYS).toContain(todayKey());
  });

  it('مطابق لترقيم JS getDay', () => {
    const map = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    expect(todayKey()).toBe(map[new Date().getDay()]);
  });
});
