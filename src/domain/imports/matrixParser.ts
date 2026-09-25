import type { Subject } from '../../lib/subjects';
import { matchSubject } from '../../lib/subjects';
import { extractGroupName, isPlaceholderHeader, parseDays, parseTimeRange } from './matrixHeaders';
import { extractPhone, foldArabic, normalize } from './normalization';
import type { ParsedGroup, SheetParseResult, StudentMeta } from './types';

/**
 * فضّ الاشتباك لو مدرس عنده مجموعتين بنفس الاسم بعد التنظيف
 * (مثال: «level 3 السبت من 4/5» و«level 3 السبت من5/6» عند ايمان عبدالرحيم).
 */
export function disambiguateGroups(groups: ParsedGroup[]): void {
  const counts = new Map<string, number>();
  for (const g of groups) {
    const k = `${g.teacherName}::${g.name}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const g of groups) {
    if ((counts.get(`${g.teacherName}::${g.name}`) || 0) > 1) {
      const extra = [g.dayLabels.join(' و '), g.timeLabel].filter(Boolean).join(' ');
      if (extra) g.name = `${g.name} (${extra})`;
    }
  }
}

// ==================== COURSE FAMILY ====================

/**
 * «عائلة» المجموعة = اسم المجموعة من غير الأرقام/الميعاد،
 * وتُستخدم لو استراتيجية الكورسات «كورس لكل نوع مجموعة».
 */
export function courseFamily(group: Pick<ParsedGroup, 'name' | 'teacherName'>): string {
  if (group.name.includes(group.teacherName)) return group.teacherName;
  const cleaned = normalize(
    group.name
      .replace(/\([^)]*\)/g, ' ') // «level 3 (السبت 4/5)» → «level 3»
      .replace(/\d+(\s*\/\s*\d+)?/g, ' '),
  )
    .replace(/^[-–—/\s]+|[-–—/\s]+$/g, '')
    .replace(/\s+/g, ' ');
  return cleaned || group.teacherName;
}

// ==================== PARSER ====================

export function parseSheetRows(sheets: { name: string; rows: string[][] }[]): SheetParseResult {
  const warnings: string[] = [];
  const groups: ParsedGroup[] = [];
  const teachers: string[] = [];
  const seenStudents = new Map<string, number>();
  /** الاسم الموحّد ← بيانات الطالب (اسم + تليفون) */
  const studentMeta = new Map<string, StudentMeta>();
  /** أسماء ظهرت بأكتر من تليفون → محتمل أشخاص مختلفين */
  const conflictingPhones = new Set<string>();
  let totalSlots = 0;
  let skippedColumns = 0;

  for (const sheet of sheets) {
    const rows = sheet.rows;
    if (rows.length === 0) {
      skippedColumns++;
      continue;
    }

    const teacherName = normalize(sheet.name);
    const header = (rows[0] || []).map(normalize);
    let teacherHasStudents = false;

    for (let c = 0; c < header.length; c++) {
      const students: string[] = [];
      for (let r = 1; r < rows.length; r++) {
        const v = normalize((rows[r] || [])[c]);
        if (!v) continue;
        const { phone, name } = extractPhone(v);
        // القائمة بتعرض الاسم بس (من غير رقم التليفون) — الرقم بيتستخدم في المطابقة
        students.push(name);

        const key = foldArabic(normalize(name));
        const prev = studentMeta.get(key);
        if (prev && phone && prev.phone && prev.phone !== phone) {
          conflictingPhones.add(name);
        } else if (!prev) {
          studentMeta.set(key, { name, phone, raw: v });
        } else if (prev && !prev.phone && phone) {
          studentMeta.set(key, { name, phone, raw: v });
        }
      }

      // عمود من غير طلاب = placeholder أو مجموعة لسه فاضية → نتخطاه
      if (students.length === 0) {
        skippedColumns++;
        continue;
      }
      if (isPlaceholderHeader(header[c])) {
        skippedColumns++;
        warnings.push(`«${teacherName}»: العمود «${header[c]}» شكله placeholder وفيه ${students.length} طالب — اتخطى`);
        continue;
      }

      const days = parseDays(header[c]);
      const time = parseTimeRange(header[c]);
      if (days.keys.length === 0) warnings.push(`«${teacherName}»: مفيش يوم واضح في «${header[c]}»`);
      if (!time) warnings.push(`«${teacherName}»: مفيش ميعاد واضح في «${header[c]}»`);

      groups.push({
        teacherName,
        rawHeader: header[c],
        name: extractGroupName({ rawHeader: header[c], teacherName, days, time }),
        days: days.keys,
        dayLabels: days.labels,
        startTime: time?.start || '',
        endTime: time?.end || '',
        timeLabel: time?.label || '',
        students,
      });

      totalSlots += students.length;
      for (const s of students) seenStudents.set(s, (seenStudents.get(s) || 0) + 1);
      teacherHasStudents = true;
    }

    if (teacherHasStudents && !teachers.includes(teacherName)) teachers.push(teacherName);
  }

  disambiguateGroups(groups);

  return {
    teachers,
    groups,
    uniqueStudents: [...seenStudents.keys()],
    studentMeta: [...studentMeta.values()],
    duplicateNames: [...conflictingPhones],
    totalSlots,
    multiGroupStudents: [...seenStudents.values()].filter(n => n > 1).length,
    skippedColumns,
    looksLikeCenterSheet: groups.some(g => g.days.length > 0 || !!g.timeLabel),
    warnings,
  };
}

export function subjectOfParsedGroup(g: ParsedGroup): Subject | null {
  return matchSubject(g.name) ?? matchSubject(g.rawHeader) ?? matchSubject(g.teacherName);
}
