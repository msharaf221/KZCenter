import { readAll, readById } from '../../data/readers';
import { dbAdd, dbPut } from '../../data/records';
import { courseFamily, subjectOfParsedGroup } from '../../domain/imports/matrixParser';
import { foldArabic, guessGender, normalize, normalizePhone } from '../../domain/imports/normalization';
import { DEFAULT_IMPORT_OPTIONS } from '../../domain/imports/options';
import type {
  ParsedGroup,
  SheetImportOptions,
  SheetImportReport,
  SheetParseResult,
  StudentMeta,
} from '../../domain/imports/types';
import type { Course, Group, ScheduleItem, Student, Teacher } from '../../domain/models';
import { generateId } from '../../lib/ids';
import type { Subject, SubjectId } from '../../lib/subjects';
import { subjectPrice, SUBJECTS } from '../../lib/subjects';
import { enrollStudent } from '../enrollmentService';
import { syncGroupStatus } from '../groupService';

/**
 * مادة المجموعة من الشيت: اسم المجموعة أولاً (فيه نوع الحصة عادةً)،
 * وبعدين العنوان الخام، وآخر حاجة اسم المدرس/التبويب.
 */
/** المادة ← اسمها المعروض (لتقارير الاستيراد) */
export const SUBJECT_NAME = new Map<SubjectId, string>(SUBJECTS.map(s => [s.id, s.name] as const));

/** مفتاح فريد للمجموعة داخل الشيت (مدرس + العنوان الخام) */
export function groupRefKey(g: Pick<ParsedGroup, 'teacherName' | 'rawHeader'>): string {
  return `${g.teacherName}::${g.rawHeader}`;
}

/**
 * كتابة الشيت في قاعدة البيانات:
 * مدرسين ← كورسات ← مجموعات ← طلاب ← تسجيلات (عن طريق enrollStudent
 * عشان الأقساط والقوائم تتظبط بنفس منطق التطبيق).
 *
 * الاستيراد idempotent: اللي موجود مش بيتكرر.
 * المطابقة بالترتيب ده: **التليفون الأول** (أدق حاجة)، وبعدين الاسم الموحّد.
 * لو الاسم لوحده مطابق لأكتر من طالب موجود بنعتبره «غامض» وبنسجله للمراجعة
 * بدل ما ندمج طالبين مختلفين في واحد بالغلط.
 */
export async function importSheetIntoDb(
  parsed: SheetParseResult,
  opts: SheetImportOptions = DEFAULT_IMPORT_OPTIONS,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<SheetImportReport> {
  const report: SheetImportReport = {
    teachersCreated: 0,
    teachersExisting: 0,
    coursesCreated: 0,
    groupsCreated: 0,
    groupsExisting: 0,
    studentsCreated: 0,
    studentsExisting: 0,
    studentsMatchedByPhone: 0,
    ambiguousStudents: [],
    groupsWithSubject: 0,
    groupsWithoutSubject: [],
    subjectsUsed: [],
    enrollmentsCreated: 0,
    enrollmentsSkipped: 0,
    errors: [],
  };

  const now = new Date().toISOString();
  const [existingTeachers, existingCourses, existingGroups, existingStudents] = await Promise.all([
    readAll<Teacher>('teachers'),
    readAll<Course>('courses'),
    readAll<Group>('groups'),
    readAll<Student>('students'),
  ]);

  const teacherByName = new Map(existingTeachers.map(t => [normalize(t.name), t]));
  const courseByName = new Map(existingCourses.map(c => [normalize(c.name), c]));
  const groupByKey = new Map(existingGroups.map(g => [`${g.teacherId}::${normalize(g.name)}`, g]));

  /** الاسم الموحّد ← الطلاب الموجودين بنفس الاسم (أكتر من واحد = غموض) */
  const studentsByFoldedName = new Map<string, Student[]>();
  for (const st of existingStudents) {
    const k = foldArabic(normalize(st.name));
    const arr = studentsByFoldedName.get(k) || [];
    arr.push(st);
    studentsByFoldedName.set(k, arr);
  }
  const studentByPhone = new Map<string, Student>();
  for (const st of existingStudents) {
    const p = normalizePhone(st.phone) || normalizePhone(st.parentPhone);
    if (p && !studentByPhone.has(p)) studentByPhone.set(p, st);
  }
  /** الاسم الموحّد ← الطالب المعتمد للمطابقة (بيتبني أثناء الاستيراد) */
  const studentByName = new Map<string, Student>();

  const totalSteps = parsed.teachers.length + parsed.groups.length + parsed.uniqueStudents.length + parsed.totalSlots;
  let step = 0;
  const tick = (label: string) => {
    step++;
    onProgress?.(step, totalSteps, label);
  };

  // ---------- 1) المدرسين ----------
  for (const name of parsed.teachers) {
    const key = normalize(name);
    if (teacherByName.has(key)) {
      report.teachersExisting++;
      continue;
    }
    const teacher: Teacher = {
      id: generateId(),
      name,
      specialization: 'غير محدد',
      phone: `${opts.phonePrefix}0000`, // 01000000000 — placeholder
      salary: 0,
      status: 'active',
      notes: 'مضاف من شيت إكسيل',
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('teachers', teacher);
    teacherByName.set(key, teacher);
    report.teachersCreated++;
    tick(`مدرس: ${name}`);
  }

  // ---------- 2) الكورسات ----------
  // مادة كل مجموعة بتتحدد من اسمها/عنوانها الخام (بتُستخدم في التسعير والربط)
  const subjectOfGroup = new Map<string, Subject | null>();
  for (const g of parsed.groups) {
    subjectOfGroup.set(groupRefKey(g), subjectOfParsedGroup(g));
  }

  const useSubjectPrices = opts.useSubjectPrices !== false;
  /** سعر الكورس حسب مادته (أو السعر الافتراضي لو المادة مش معروفة) */
  const priceFor = (subject: Subject | null): number => {
    if (subject && useSubjectPrices) return subjectPrice(subject.id, opts.subjectPrices);
    return Math.max(0, opts.coursePrice);
  };

  /**
   * اسم الكورس حسب الاستراتيجية.
   * في وضع «كورس لكل مادة» المجموعة اللي مش متعرف مادتها بترجع لاسم نوعها
   * (courseFamily) بدل ما تتحط في كورس عشوائي.
   */
  const courseKeyFor = (group: ParsedGroup): string => {
    if (opts.courseStrategy === 'single') return 'Kids Zone';
    if (opts.courseStrategy === 'byTeacher') return group.teacherName;
    if (opts.courseStrategy === 'bySubject') {
      const subject = subjectOfGroup.get(groupRefKey(group)) || null;
      return subject ? subject.name : courseFamily(group);
    }
    return courseFamily(group);
  };

  for (const group of parsed.groups) {
    const courseName = courseKeyFor(group);
    const key = normalize(courseName);
    const subject = subjectOfGroup.get(groupRefKey(group)) || null;

    const existingCourse = courseByName.get(key);
    if (existingCourse) {
      // كورس موجود من غير مادة/بسعر صفر → نكمّله من الكاتالوج (من غير ما نلمس سعر متحدد يدوياً)
      if (subject && (!existingCourse.subjectId || (useSubjectPrices && !existingCourse.price))) {
        const patched: Course = {
          ...existingCourse,
          subjectId: existingCourse.subjectId ?? subject.id,
          price: existingCourse.price || priceFor(subject),
          category: existingCourse.category === 'مجموعات' ? subject.category : existingCourse.category,
          updatedAt: now,
        };
        await dbPut('courses', patched);
        courseByName.set(key, patched);
      }
      continue;
    }

    const course: Course = {
      id: generateId(),
      name: courseName,
      category: subject ? subject.category : opts.courseStrategy === 'byTeacher' ? 'مجموعات مدرس' : 'مجموعات',
      description: subject ? subject.description : 'كورس مُنشأ تلقائياً من شيت إكسيل',
      subjectId: subject?.id,
      price: priceFor(subject),
      durationMonths: Math.max(1, opts.durationMonths),
      icon: subject?.icon || '📘',
      color: subject?.color || '#6366f1',
      levels: [],
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('courses', course);
    courseByName.set(key, course);
    report.coursesCreated++;
  }

  // ---------- 3) المجموعات ----------
  const resolvedGroupId = new Map<string, string>();
  const groupRef = groupRefKey;
  /** المدرس ← المواد اللي بيدرّسها (من مجموعاته) */
  const teacherSubjects = new Map<string, Set<SubjectId>>();
  /** المادة ← عدد المجموعات (للتقرير) */
  const subjectGroupCount = new Map<SubjectId, number>();

  for (const g of parsed.groups) {
    const teacher = teacherByName.get(normalize(g.teacherName));
    if (!teacher) {
      report.errors.push(`مدرس مش موجود للمجموعة «${g.name}»`);
      continue;
    }
    const course = courseByName.get(normalize(courseKeyFor(g)));
    if (!course) {
      report.errors.push(`كورس مش موجود للمجموعة «${g.name}»`);
      continue;
    }

    const subject = subjectOfGroup.get(groupRefKey(g)) || null;
    if (subject) {
      report.groupsWithSubject++;
      subjectGroupCount.set(subject.id, (subjectGroupCount.get(subject.id) || 0) + 1);
      const set = teacherSubjects.get(teacher.id) || new Set<SubjectId>();
      set.add(subject.id);
      teacherSubjects.set(teacher.id, set);
    } else {
      report.groupsWithoutSubject.push(`${g.teacherName} — ${g.name}`);
    }

    const key = `${teacher.id}::${normalize(g.name)}`;
    const existing = groupByKey.get(key);
    if (existing) {
      // مجموعة موجودة من غير مادة → نربطها (من غير ما نغيّر أي حاجة تانية)
      if (subject && !existing.subjectId) {
        const patched = { ...existing, subjectId: subject.id, updatedAt: now };
        await dbPut('groups', patched);
        groupByKey.set(key, patched);
      }
      resolvedGroupId.set(groupRef(g), existing.id);
      report.groupsExisting++;
      tick(`مجموعة: ${g.name}`);
      continue;
    }

    const schedule: ScheduleItem[] = [
      {
        days: g.days,
        startTime: g.startTime,
        endTime: g.endTime,
        room: '',
      },
    ];

    const group: Group = {
      id: generateId(),
      name: g.name,
      courseId: course.id,
      subjectId: subject?.id ?? course.subjectId,
      teacherId: teacher.id,
      schedule,
      maxStudents: Math.max(opts.maxStudents, g.students.length),
      status: 'open',
      studentIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('groups', group);
    groupByKey.set(key, group);
    resolvedGroupId.set(groupRef(g), group.id);
    report.groupsCreated++;
    tick(`مجموعة: ${g.name}`);
  }

  // ---------- 4) الطلاب ----------
  // بنمشي على `studentMeta` (اسم + تليفون) مش على الأسماء الخام،
  // عشان المطابقة بالتليفون تمنع التكرار ودمج الأشخاص الغلط.
  const metaList: StudentMeta[] =
    parsed.studentMeta.length > 0 ? parsed.studentMeta : parsed.uniqueStudents.map(n => ({ name: n, raw: n }));

  let phoneSeq = 1;
  for (const meta of metaList) {
    const name = meta.name;
    const key = foldArabic(normalize(name));
    const sheetPhone = normalizePhone(meta.phone);

    // 1) مطابقة بالتليفون — أدق حاجة ومبتتأثرش بأخطاء كتابة الاسم
    if (sheetPhone && studentByPhone.has(sheetPhone)) {
      const found = studentByPhone.get(sheetPhone)!;
      studentByName.set(key, found);
      report.studentsExisting++;
      report.studentsMatchedByPhone++;
      continue;
    }

    // 2) مطابقة بالاسم الموحّد
    const sameName = studentsByFoldedName.get(key) || [];
    if (sameName.length === 1) {
      studentByName.set(key, sameName[0]);
      report.studentsExisting++;
      continue;
    }
    if (sameName.length > 1) {
      // اسم مكرر في القاعدة من غير تليفون يحدد → ما نخمنش
      studentByName.set(key, sameName[0]);
      if (!report.ambiguousStudents.includes(name)) report.ambiguousStudents.push(name);
      report.errors.push(`«${name}»: موجود ${sameName.length} مرات في النظام — تم اعتماد الأول، راجعهم يدوياً`);
      report.studentsExisting++;
      continue;
    }

    // 3) جديد — نستخدم تليفون الشيت لو موجود، وإلا placeholder
    const phone = sheetPhone || `${opts.phonePrefix}${String(phoneSeq).padStart(4, '0')}`;
    if (!sheetPhone) phoneSeq++;

    const student: Student = {
      id: generateId(),
      name,
      age: 5 + Math.floor(Math.random() * 11), // 5 – 15 (placeholder، المستخدم هيعدلها)
      gender: guessGender(name),
      phone,
      parentPhone: phone,
      notes: sheetPhone ? 'مضاف من شيت إكسيل' : 'مضاف من شيت إكسيل (التليفون placeholder — عدّله)',
      status: 'active',
      totalPaid: 0,
      enrolledGroups: [],
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('students', student);
    studentByName.set(key, student);
    studentsByFoldedName.set(key, [student]);
    if (sheetPhone) studentByPhone.set(sheetPhone, student);
    report.studentsCreated++;
    tick(`طالب: ${name}`);
  }

  // أسماء في الشيت نفسه appeared بأكتر من رقم → نبه المستخدم
  for (const dup of parsed.duplicateNames || []) {
    report.errors.push(`«${dup}»: الاسم ده ظهر بأكتر من رقم تليفون في الشيت — تأكد إنهم مش نفس الشخص`);
  }

  // ---------- 5) التسجيلات (عن طريق enrollStudent) ----------
  for (const g of parsed.groups) {
    const groupId = resolvedGroupId.get(groupRef(g));
    if (!groupId) continue;

    for (const studentName of g.students) {
      const student = studentByName.get(foldArabic(normalize(studentName)));
      if (!student) {
        report.errors.push(`طالب مش موجود: ${studentName}`);
        continue;
      }

      const result = await enrollStudent(student.id, groupId);
      if (result.success) {
        report.enrollmentsCreated++;
      } else {
        report.enrollmentsSkipped++;
        if (!result.error?.includes('بالفعل')) {
          report.errors.push(`${studentName} ← ${g.name}: ${result.error}`);
        }
      }
      tick(`تسجيل: ${studentName}`);
    }
  }

  // ---------- 5.5) مواد المدرسين + ملخص المواد ----------
  for (const [teacherId, subjects] of teacherSubjects) {
    const teacher = await readById<Teacher>('teachers', teacherId);
    if (!teacher) continue;
    const merged = [...new Set([...(teacher.subjectIds || []), ...subjects])];
    if (merged.length === (teacher.subjectIds || []).length) continue;
    const names = merged
      .map(id => SUBJECT_NAME.get(id))
      .filter((n): n is string => !!n)
      .join(' · ');
    await dbPut('teachers', {
      ...teacher,
      subjectIds: merged,
      specialization: teacher.specialization && teacher.specialization !== 'غير محدد' ? teacher.specialization : names,
      updatedAt: new Date().toISOString(),
    });
  }

  report.subjectsUsed = [...subjectGroupCount.entries()].map(([id, groups]) => ({
    id,
    name: SUBJECT_NAME.get(id) || id,
    price: subjectPrice(id, opts.subjectPrices),
    groups,
  }));

  // ---------- 6) تحديث حالة المجموعات ----------
  for (const groupId of new Set(resolvedGroupId.values())) await syncGroupStatus(groupId);

  return report;
}
