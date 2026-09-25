import type { Course, Enrollment, Group, Student, Teacher } from '../models';
import { renewalInfo, summarize, type Installment, type RenewalInfo } from '../../lib/billing';

export interface RenewalCandidate {
  studentId: string;
  studentName: string;
  parentPhone: string;
  phone?: string;
  groupId: string;
  groupName: string;
  courseName: string;
  teacherName: string;
  info: RenewalInfo;
  /** المتبقي على المجموعة دي */
  remaining: number;
}

export function renewalCandidates({ enrollments, students, groups, courses, teachers, installments }: { enrollments: Enrollment[]; students: Student[]; groups: Group[]; courses: Course[]; teachers: Teacher[]; installments: Installment[] }, today: string, daysAhead: number): RenewalCandidate[] {
  const byPair = new Map<string, Installment[]>();
  for (const i of installments) {
    const k = JSON.stringify([i.studentId, i.groupId]);
    const l = byPair.get(k);
    if (l) l.push(i);
    else byPair.set(k, [i]);
  }

  const out: RenewalCandidate[] = [];
  for (const e of enrollments) {
    if (e.status !== 'active') continue;
    const student = students.find(s => s.id === e.studentId);
    const group = groups.find(g => g.id === e.groupId);
    if (!student || !group || group.status === 'ended') continue;
    if (student.status === 'ended') continue;
    const list = byPair.get(JSON.stringify([e.studentId, e.groupId])) || [];
    if (list.length === 0) continue; // من غير أقساط ما نقدرش نحكم
    const info = renewalInfo(list, today, daysAhead);
    if (info.state === 'active') continue;
    const s = summarize(list, today);
    out.push({
      studentId: student.id,
      studentName: student.name,
      parentPhone: student.parentPhone,
      phone: student.phone,
      groupId: group.id,
      groupName: group.name,
      courseName: courses.find(c => c.id === group.courseId)?.name || '—',
      teacherName: teachers.find(t => t.id === group.teacherId)?.name || '—',
      info,
      remaining: s.remaining,
    });
  }
  // المنتهي الأقدم الأول، وبعده اللي قرب ينتهي
  return out.sort((a, b) => (a.info.daysLeft ?? 0) - (b.info.daysLeft ?? 0));
}
