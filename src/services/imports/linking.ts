import { readAll } from '../../data/readers';
import { dbPut } from '../../data/records';
import type { Course, Group } from '../../domain/models';
import type { SubjectId } from '../../lib/subjects';
import { matchSubjectId } from '../../lib/subjects';

/**
 * ربط الكيانات القديمة اللي اتعملت قبل الاستيراد ده:
 * أي مجموعة من غير مادة بتاخد مادة كورسها، وأي كورس من غير مادة بيتخمّن من اسمه.
 * (نسخة خفيفة من `syncSubjects` بتشتغل بعد الاستيراد مباشرةً.)
 */
export async function linkOrphans(): Promise<{ courses: number; groups: number }> {
  const [courses, groups] = await Promise.all([readAll<Course>('courses'), readAll<Group>('groups')]);
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
