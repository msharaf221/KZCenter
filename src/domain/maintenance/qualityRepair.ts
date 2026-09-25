import { getSubject, matchSubjectId, type SubjectId } from '../../lib/subjects';
import type { Course, Group, Teacher } from '../models';
import { requireMoney } from '../validation';
import { qualityReport, type QualityData } from './quality';
import type { AutoFixReport } from './qualityTypes';

export function planQualityRepair(data: QualityData, now: string, prices?: Partial<Record<SubjectId, number>>) {
  for (const price of Object.values(prices || {})) if (price !== undefined) requireMoney(price);
  const { courses, groups, teachers } = data;
  const coursePatches: Course[] = [], groupPatches: Group[] = [], teacherPatches: Teacher[] = [];
  const report: AutoFixReport = {
    coursesLinked: 0, coursesRepriced: 0, groupsLinked: 0, teachersLinked: 0, remaining: 0,
  };

  // 1) الكورسات
  const courseSubject = new Map<string, SubjectId>();
  for (const c of courses) {
    let subjectId = c.subjectId;
    const patch: Partial<Course> = {};

    if (!subjectId) {
      const guessed = matchSubjectId(c.name, c.description, c.category);
      if (guessed) {
        subjectId = guessed;
        patch.subjectId = guessed;
        report.coursesLinked++;
      }
    }
    if (subjectId && getSubject(subjectId) && (!c.price || c.price <= 0)) {
      patch.price = prices?.[subjectId] ?? getSubject(subjectId)!.monthlyPrice;
      report.coursesRepriced++;
    }
    if (Object.keys(patch).length > 0) {
      coursePatches.push({ ...c, ...patch, updatedAt: now });
    }
    if (subjectId) courseSubject.set(c.id, subjectId);
  }

  // 2) المجموعات
  const teacherSubjects = new Map<string, Set<SubjectId>>();
  for (const g of groups) {
    const subjectId = g.subjectId ?? courseSubject.get(g.courseId) ?? matchSubjectId(g.name) ?? undefined;
    if (!subjectId) continue;
    if (!g.subjectId) {
      groupPatches.push({ ...g, subjectId, updatedAt: now });
      report.groupsLinked++;
    }
    const set = teacherSubjects.get(g.teacherId) || new Set<SubjectId>();
    set.add(subjectId);
    teacherSubjects.set(g.teacherId, set);
  }

  // 3) المدرسين
  for (const t of teachers) {
    const fromGroups = teacherSubjects.get(t.id);
    if (!fromGroups?.size) continue;
    const merged = [...new Set([...(t.subjectIds || []), ...fromGroups])];
    if (merged.length === (t.subjectIds || []).length) continue;
    const names = merged.map(id => getSubject(id)?.name).filter(Boolean).join(' · ');
    teacherPatches.push({
      ...t,
      subjectIds: merged,
      specialization: t.specialization && t.specialization !== 'غير محدد' ? t.specialization : names,
      updatedAt: now,
    });
    report.teachersLinked++;
  }

  const apply = <T extends { id: string }>(rows: T[], patches: T[]) => {
    const byId = new Map(patches.map(row => [row.id, row]));
    return rows.map(row => byId.get(row.id) || row);
  };
  const after = qualityReport({ ...data, courses: apply(courses, coursePatches), groups: apply(groups, groupPatches), teachers: apply(teachers, teacherPatches) });
  report.remaining = after.issues.filter(i => i.autoFixable).length;
  return { coursePatches, groupPatches, teacherPatches, report, quality: after };
}
