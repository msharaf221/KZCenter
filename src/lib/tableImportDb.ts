/**
 * كتابة الداتا الجدولية في قاعدة البيانات — الربط الكامل
 * =========================================================
 *
 * بياخد سجلات `TableRecord` (صف لكل طالب) ويبني منها الشجرة كاملة ومترابطة:
 *
 *      مادة (من الكاتالوج + سعرها)
 *        └── كورس  (كورس لكل مادة — أو الكورس المكتوب في الداتا)
 *              └── مجموعة (مربوطة بالكورس + المدرس + الجدول)
 *                    └── تسجيل الطالب (بالسعر الصح + أقساطه)
 *
 * قواعد الربط (بالترتيب):
 *  1. **المدرس**: من عمود المدرس؛ لو مش موجود بيتعمل. الموجود بيتطابق بالاسم
 *     الموحّد أو بالتليفون، وبياخد مواده من مجموعاته.
 *  2. **المادة**: من عمود المادة، وإلا من اسم المجموعة/الكورس/تخصص المدرس.
 *  3. **الكورس**: كورس المادة (الموجود أو بيتعمل). لو الداتا فيها اسم كورس صريح
 *     بيتستخدم هو وبيتربط بالمادة.
 *  4. **السعر**: السعر المكتوب في الصف → سعر المادة → السعر الافتراضي للاستيراد.
 *     لو السعر في الصف مختلف عن سعر المادة، بيتسجّل كـ `priceOverride` على
 *     التسجيل بدل ما يغيّر سعر الكورس على كل الطلاب.
 *  5. **المجموعة**: بتتطابق بـ(مدرس + اسم)؛ ولو الداتا مفيهاش اسم مجموعة
 *     بيتولّد اسم من (المادة + المدرس + الميعاد) عشان ما تتكررش.
 *  6. **الطالب**: بيتطابق بالتليفون الأول وبعدين بالاسم الموحّد (نفس منطق
 *     `sheetImport` — مش بنعمل نسخ مكررة ومش بندمج ناس مختلفة).
 *
 * الاستيراد **idempotent**: اللي موجود مش بيتكرر، وتشغيله تاني ما بيضفش حاجة.
 */
import {
  dbAdd, dbGetAll, dbGetById, dbPut, enrollStudent, generateId,
  type Course, type Group, type Student, type Teacher, type ScheduleItem,
} from './db';
import { foldArabic, guessGender } from './sheetImport';
import {
  SUBJECTS, getSubject, matchSubjectId, subjectPrice,
  type Subject, type SubjectId, type SubjectPrices,
} from './subjects';
import type { TableRecord } from './tableImport';

const norm = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();
const fold = (s: unknown): string => foldArabic(norm(s).toLowerCase());

/** توحيد رقم الموبايل المصري (01xxxxxxxxx) */
export function normalizePhone(p?: string): string {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) return d;
  if (d.length === 12 && d.startsWith('20')) return `0${d.slice(2)}`;
  if (d.length === 10 && d.startsWith('1')) return `0${d}`;
  return d || '';
}

export interface TableImportOptions {
  /** استخدام أسعار المواد من الكاتالوج/الإعدادات */
  useSubjectPrices: boolean;
  /** أسعار مخصّصة للمواد */
  subjectPrices?: SubjectPrices | null;
  /** سعر السجلات اللي مش معروفة مادتها ومفيهاش سعر */
  fallbackPrice: number;
  /** بداية أرقام التليفونات الـ placeholder */
  phonePrefix: string;
  /** أقصى عدد طلاب في المجموعة */
  maxStudents: number;
  /**
   * السعر المكتوب في الصف لو خالف سعر المادة يتسجّل كسعر خاص للتسجيل
   * (بدل ما يغيّر سعر الكورس على الكل).
   */
  rowPriceAsOverride: boolean;
}

export const DEFAULT_TABLE_IMPORT_OPTIONS: TableImportOptions = {
  useSubjectPrices: true,
  subjectPrices: null,
  fallbackPrice: 0,
  phonePrefix: '0100000',
  maxStudents: 40,
  rowPriceAsOverride: true,
};

export interface TableImportReport {
  teachersCreated: number;
  teachersExisting: number;
  coursesCreated: number;
  coursesExisting: number;
  groupsCreated: number;
  groupsExisting: number;
  studentsCreated: number;
  studentsExisting: number;
  studentsMatchedByPhone: number;
  enrollmentsCreated: number;
  enrollmentsSkipped: number;
  /** تسجيلات اتعملها سعر خاص لأن الصف كان فيه سعر مختلف */
  priceOverrides: number;
  /** سجلات مش معروفة مادتها */
  rowsWithoutSubject: number;
  subjectsUsed: { id: SubjectId; name: string; price: number; groups: number; students: number }[];
  errors: string[];
}

/** اسم مجموعة متولّد لما الداتا مفيهاش عمود مجموعة */
function buildGroupName(record: TableRecord, subject: Subject | null): string {
  const parts = [
    subject?.name || record.courseName || 'مجموعة',
    record.teacherName,
    [record.dayLabels.join(' و '), record.timeLabel].filter(Boolean).join(' '),
  ].filter(Boolean);
  return parts.join(' - ');
}

/**
 * كتابة السجلات في القاعدة مع الربط الكامل.
 * `onProgress` بيتنادى للتقدّم في الواجهة.
 */
export async function importTableIntoDb(
  records: TableRecord[],
  options: Partial<TableImportOptions> = {},
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<TableImportReport> {
  const opts: TableImportOptions = { ...DEFAULT_TABLE_IMPORT_OPTIONS, ...options };

  const report: TableImportReport = {
    teachersCreated: 0, teachersExisting: 0,
    coursesCreated: 0, coursesExisting: 0,
    groupsCreated: 0, groupsExisting: 0,
    studentsCreated: 0, studentsExisting: 0, studentsMatchedByPhone: 0,
    enrollmentsCreated: 0, enrollmentsSkipped: 0,
    priceOverrides: 0, rowsWithoutSubject: 0,
    subjectsUsed: [], errors: [],
  };

  const now = new Date().toISOString();
  const [existingTeachers, existingCourses, existingGroups, existingStudents] = await Promise.all([
    dbGetAll<Teacher>('teachers'),
    dbGetAll<Course>('courses'),
    dbGetAll<Group>('groups'),
    dbGetAll<Student>('students'),
  ]);

  // ---------- فهارس المطابقة ----------
  const teacherByName = new Map(existingTeachers.map(t => [fold(t.name), t]));
  const teacherByPhone = new Map(
    existingTeachers
      .map(t => [normalizePhone(t.phone), t] as const)
      .filter(([p]) => !!p)
  );
  const courseById = new Map(existingCourses.map(c => [c.id, c]));
  const courseByName = new Map(existingCourses.map(c => [fold(c.name), c]));
  const courseBySubject = new Map<SubjectId, Course>();
  for (const c of existingCourses) {
    if (c.subjectId && !courseBySubject.has(c.subjectId)) courseBySubject.set(c.subjectId, c);
  }
  const groupByKey = new Map(existingGroups.map(g => [`${g.teacherId}::${fold(g.name)}`, g]));

  const studentsByName = new Map<string, Student[]>();
  for (const s of existingStudents) {
    const k = fold(s.name);
    studentsByName.set(k, [...(studentsByName.get(k) || []), s]);
  }
  const studentByPhone = new Map<string, Student>();
  for (const s of existingStudents) {
    const p = normalizePhone(s.phone) || normalizePhone(s.parentPhone);
    if (p && !studentByPhone.has(p)) studentByPhone.set(p, s);
  }

  const priceOfSubject = (id: SubjectId): number =>
    subjectPrice(id, opts.subjectPrices);

  const total = records.length * 2;   // كيانات + تسجيلات
  let step = 0;
  const tick = (label: string) => { step++; onProgress?.(step, total, label); };

  // ============ 1) المدرسين ============
  /** اسم المدرس الموحّد ← الكيان */
  const resolvedTeacher = new Map<string, Teacher>();
  /** المدرس ← مواده */
  const teacherSubjects = new Map<string, Set<SubjectId>>();

  const teacherRows = new Map<string, TableRecord>();
  for (const r of records) {
    const key = fold(r.teacherName || 'غير محدد');
    if (!teacherRows.has(key)) teacherRows.set(key, r);
  }

  for (const [key, record] of teacherRows) {
    const name = norm(record.teacherName) || 'غير محدد';
    const phone = normalizePhone(record.teacherPhone);

    const found = (phone && teacherByPhone.get(phone)) || teacherByName.get(key);
    if (found) {
      resolvedTeacher.set(key, found);
      report.teachersExisting++;
      continue;
    }

    const teacher: Teacher = {
      id: generateId(),
      name,
      specialization: record.subject?.name || 'غير محدد',
      subjectIds: record.subject ? [record.subject.id] : [],
      phone: phone || `${opts.phonePrefix}0000`,
      salary: 0,
      status: 'active',
      notes: 'مضاف من استيراد داتا',
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('teachers', teacher);
    teacherByName.set(key, teacher);
    if (phone) teacherByPhone.set(phone, teacher);
    resolvedTeacher.set(key, teacher);
    report.teachersCreated++;
  }

  // ============ 2) الكورسات (كورس لكل مادة / أو الاسم الصريح) ============
  /** مفتاح الكورس في الداتا ← الكيان */
  const resolvedCourse = new Map<string, Course>();

  const courseKeyOf = (r: TableRecord): string =>
    r.courseName ? `name:${fold(r.courseName)}` : (r.subject ? `subject:${r.subject.id}` : 'name:عام');

  for (const record of records) {
    const key = courseKeyOf(record);
    if (resolvedCourse.has(key)) continue;

    const subject = record.subject;
    const price = subject && opts.useSubjectPrices
      ? priceOfSubject(subject.id)
      : Math.max(0, record.price ?? opts.fallbackPrice);

    // كورس موجود بالاسم أو بالمادة؟
    const existing = record.courseName
      ? courseByName.get(fold(record.courseName))
      : (subject ? courseBySubject.get(subject.id) : undefined);

    if (existing) {
      // نكمّل الناقص من غير ما نلمس سعر متحدد يدوياً
      const patch: Partial<Course> = {};
      if (subject && !existing.subjectId) patch.subjectId = subject.id;
      if (subject && opts.useSubjectPrices && !existing.price) patch.price = price;
      if (Object.keys(patch).length > 0) {
        const updated = { ...existing, ...patch, updatedAt: now };
        await dbPut('courses', updated);
        courseById.set(updated.id, updated);
        courseByName.set(fold(updated.name), updated);
        if (updated.subjectId) courseBySubject.set(updated.subjectId, updated);
        resolvedCourse.set(key, updated);
      } else {
        resolvedCourse.set(key, existing);
      }
      report.coursesExisting++;
      continue;
    }

    const course: Course = {
      id: generateId(),
      name: norm(record.courseName) || subject?.name || 'كورس عام',
      category: subject?.category || 'أخرى',
      description: subject?.description || 'كورس مُنشأ تلقائياً من استيراد داتا',
      subjectId: subject?.id,
      price,
      durationMonths: 1,
      icon: subject?.icon || '📘',
      color: subject?.color || '#6366f1',
      levels: [],
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('courses', course);
    courseById.set(course.id, course);
    courseByName.set(fold(course.name), course);
    if (subject) courseBySubject.set(subject.id, course);
    resolvedCourse.set(key, course);
    report.coursesCreated++;
  }

  // ============ 3) المجموعات ============
  /** مفتاح المجموعة في الداتا ← id */
  const resolvedGroupId = new Map<string, string>();
  const groupSubject = new Map<string, SubjectId>();
  const subjectStudentCount = new Map<SubjectId, Set<string>>();
  const subjectGroupCount = new Map<SubjectId, Set<string>>();

  const groupKeyOf = (r: TableRecord): string => {
    const teacherKey = fold(r.teacherName || 'غير محدد');
    const name = r.groupName ? fold(r.groupName) : fold(buildGroupName(r, r.subject));
    return `${teacherKey}::${name}`;
  };

  for (const record of records) {
    const key = groupKeyOf(record);
    if (resolvedGroupId.has(key)) continue;

    const teacher = resolvedTeacher.get(fold(record.teacherName || 'غير محدد'));
    if (!teacher) {
      report.errors.push(`صف ${record.rowNumber}: مدرس غير معروف`);
      continue;
    }
    const course = resolvedCourse.get(courseKeyOf(record));
    if (!course) {
      report.errors.push(`صف ${record.rowNumber}: كورس غير معروف`);
      continue;
    }

    const subjectId = record.subject?.id ?? course.subjectId;
    const name = norm(record.groupName) || buildGroupName(record, record.subject);
    const dbKey = `${teacher.id}::${fold(name)}`;

    const existing = groupByKey.get(dbKey);
    if (existing) {
      // نربط المادة لو ناقصة من غير ما نغيّر أي حاجة تانية
      if (subjectId && !existing.subjectId) {
        const updated = { ...existing, subjectId, updatedAt: now };
        await dbPut('groups', updated);
        groupByKey.set(dbKey, updated);
      }
      resolvedGroupId.set(key, existing.id);
      if (subjectId) groupSubject.set(existing.id, subjectId);
      report.groupsExisting++;
      continue;
    }

    const schedule: ScheduleItem[] = [{
      days: record.days,
      startTime: record.startTime || '',
      endTime: record.endTime || '',
      room: record.room || '',
    }];

    const group: Group = {
      id: generateId(),
      name,
      courseId: course.id,
      subjectId,
      teacherId: teacher.id,
      schedule,
      maxStudents: Math.max(1, record.maxStudents ?? opts.maxStudents),
      status: 'open',
      studentIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('groups', group);
    groupByKey.set(dbKey, group);
    resolvedGroupId.set(key, group.id);
    if (subjectId) {
      groupSubject.set(group.id, subjectId);
      const set = teacherSubjects.get(teacher.id) || new Set<SubjectId>();
      set.add(subjectId);
      teacherSubjects.set(teacher.id, set);
    }
    report.groupsCreated++;
  }

  // مواد المدرسين من مجموعاتهم (بما فيها المجموعات الموجودة)
  for (const record of records) {
    const teacher = resolvedTeacher.get(fold(record.teacherName || 'غير محدد'));
    const groupId = resolvedGroupId.get(groupKeyOf(record));
    if (!teacher || !groupId) continue;
    const subjectId = groupSubject.get(groupId);
    if (!subjectId) continue;
    const set = teacherSubjects.get(teacher.id) || new Set<SubjectId>();
    set.add(subjectId);
    teacherSubjects.set(teacher.id, set);
  }

  // ============ 4) الطلاب ============
  /** مفتاح الطالب ← الكيان */
  const resolvedStudent = new Map<string, Student>();
  let phoneSeq = 1;

  const studentKeyOf = (r: TableRecord): string => {
    const phone = normalizePhone(r.studentPhone) || normalizePhone(r.parentPhone);
    return phone ? `phone:${phone}` : `name:${fold(r.studentName)}`;
  };

  for (const record of records) {
    const key = studentKeyOf(record);
    if (resolvedStudent.has(key)) { tick(`طالب: ${record.studentName}`); continue; }

    const phone = normalizePhone(record.studentPhone);
    const parentPhone = normalizePhone(record.parentPhone);
    const anyPhone = phone || parentPhone;

    // 1) مطابقة بالتليفون
    if (anyPhone && studentByPhone.has(anyPhone)) {
      const found = studentByPhone.get(anyPhone)!;
      resolvedStudent.set(key, found);
      report.studentsExisting++;
      report.studentsMatchedByPhone++;
      tick(`طالب: ${record.studentName}`);
      continue;
    }

    // 2) مطابقة بالاسم الموحّد (واحد بس — الغموض بيتسجّل)
    const sameName = studentsByName.get(fold(record.studentName)) || [];
    if (sameName.length === 1) {
      resolvedStudent.set(key, sameName[0]);
      report.studentsExisting++;
      tick(`طالب: ${record.studentName}`);
      continue;
    }
    if (sameName.length > 1) {
      resolvedStudent.set(key, sameName[0]);
      report.studentsExisting++;
      report.errors.push(
        `«${record.studentName}» (صف ${record.rowNumber}): موجود ${sameName.length} مرات — اتعمد الأول، راجعه`
      );
      tick(`طالب: ${record.studentName}`);
      continue;
    }

    // 3) طالب جديد
    const finalPhone = phone || parentPhone || `${opts.phonePrefix}${String(phoneSeq).padStart(4, '0')}`;
    if (!phone && !parentPhone) phoneSeq++;

    const student: Student = {
      id: generateId(),
      name: record.studentName,
      age: record.age && record.age > 0 ? record.age : 10,
      gender: record.gender || guessGender(record.studentName),
      phone: finalPhone,
      parentPhone: parentPhone || finalPhone,
      notes: record.notes || (anyPhone ? 'مضاف من استيراد داتا' : 'مضاف من استيراد داتا (التليفون placeholder — عدّله)'),
      status: 'active',
      totalPaid: 0,
      enrolledGroups: [],
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('students', student);
    resolvedStudent.set(key, student);
    studentsByName.set(fold(student.name), [student]);
    if (anyPhone) studentByPhone.set(anyPhone, student);
    report.studentsCreated++;
    tick(`طالب: ${record.studentName}`);
  }

  // ============ 5) التسجيلات (بالسعر الصح) ============
  for (const record of records) {
    const student = resolvedStudent.get(studentKeyOf(record));
    const groupId = resolvedGroupId.get(groupKeyOf(record));
    if (!student || !groupId) {
      report.enrollmentsSkipped++;
      tick('تسجيل');
      continue;
    }

    const subjectId = groupSubject.get(groupId);
    if (subjectId) {
      const students = subjectStudentCount.get(subjectId) || new Set<string>();
      students.add(student.id);
      subjectStudentCount.set(subjectId, students);
      const groups = subjectGroupCount.get(subjectId) || new Set<string>();
      groups.add(groupId);
      subjectGroupCount.set(subjectId, groups);
    } else {
      report.rowsWithoutSubject++;
    }

    // السعر: لو الصف فيه سعر مختلف عن سعر الكورس → سعر خاص للتسجيل ده بس
    const group = await dbGetById<Group>('groups', groupId);
    const course = group ? courseById.get(group.courseId) : undefined;
    const coursePrice = course?.price ?? 0;
    const rowPrice = record.price;
    const needsOverride = opts.rowPriceAsOverride
      && rowPrice !== undefined
      && rowPrice >= 0
      && Math.abs(rowPrice - coursePrice) > 0.009;

    const result = await enrollStudent(student.id, groupId, undefined, {
      priceOverride: needsOverride ? rowPrice : undefined,
    });

    if (result.success) {
      report.enrollmentsCreated++;
      if (needsOverride) report.priceOverrides++;
    } else {
      report.enrollmentsSkipped++;
      if (!result.error?.includes('بالفعل')) {
        report.errors.push(`${record.studentName} ← ${group?.name || groupId}: ${result.error}`);
      }
    }
    tick(`تسجيل: ${record.studentName}`);
  }

  // ============ 6) مواد المدرسين + الملخص ============
  for (const [teacherId, subjects] of teacherSubjects) {
    const teacher = await dbGetById<Teacher>('teachers', teacherId);
    if (!teacher) continue;
    const merged = [...new Set([...(teacher.subjectIds || []), ...subjects])];
    if (merged.length === (teacher.subjectIds || []).length) continue;
    const names = merged.map(id => getSubject(id)?.name).filter(Boolean).join(' · ');
    await dbPut('teachers', {
      ...teacher,
      subjectIds: merged,
      specialization: teacher.specialization && teacher.specialization !== 'غير محدد'
        ? teacher.specialization
        : names,
      updatedAt: new Date().toISOString(),
    });
  }

  report.subjectsUsed = SUBJECTS
    .filter(s => subjectGroupCount.has(s.id))
    .map(s => ({
      id: s.id,
      name: s.name,
      price: priceOfSubject(s.id),
      groups: subjectGroupCount.get(s.id)?.size || 0,
      students: subjectStudentCount.get(s.id)?.size || 0,
    }));

  // حالة المجموعات بعد التسجيلات
  for (const groupId of new Set(resolvedGroupId.values())) {
    const fresh = await dbGetById<Group>('groups', groupId);
    if (!fresh || fresh.status === 'ended') continue;
    const next = fresh.studentIds.length >= fresh.maxStudents ? 'full' : 'open';
    if (fresh.status !== next) {
      await dbPut('groups', { ...fresh, status: next, updatedAt: new Date().toISOString() });
    }
  }

  return report;
}

/**
 * ربط الكيانات القديمة اللي اتعملت قبل الاستيراد ده:
 * أي مجموعة من غير مادة بتاخد مادة كورسها، وأي كورس من غير مادة بيتخمّن من اسمه.
 * (نسخة خفيفة من `syncSubjects` بتشتغل بعد الاستيراد مباشرةً.)
 */
export async function linkOrphans(): Promise<{ courses: number; groups: number }> {
  const [courses, groups] = await Promise.all([
    dbGetAll<Course>('courses'),
    dbGetAll<Group>('groups'),
  ]);
  const now = new Date().toISOString();
  let linkedCourses = 0;
  let linkedGroups = 0;

  const courseSubject = new Map<string, SubjectId>();
  for (const c of courses) {
    let subjectId = c.subjectId;
    if (!subjectId) {
      subjectId = matchSubjectId(c.name, c.description, c.category) ?? undefined;
      if (subjectId) {
        await dbPut('courses', { ...c, subjectId, updatedAt: now });
        linkedCourses++;
      }
    }
    if (subjectId) courseSubject.set(c.id, subjectId);
  }

  for (const g of groups) {
    if (g.subjectId) continue;
    const subjectId = courseSubject.get(g.courseId) ?? matchSubjectId(g.name) ?? undefined;
    if (!subjectId) continue;
    await dbPut('groups', { ...g, subjectId, updatedAt: now });
    linkedGroups++;
  }

  return { courses: linkedCourses, groups: linkedGroups };
}
