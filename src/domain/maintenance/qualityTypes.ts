import type { SubjectId } from '../../lib/subjects';
export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueCode =
  | 'group_without_teacher'
  | 'group_without_course'
  | 'group_without_subject'
  | 'group_without_schedule'
  | 'course_without_subject'
  | 'course_zero_price'
  | 'teacher_without_subjects'
  | 'teacher_without_groups'
  | 'student_without_group'
  | 'student_placeholder_phone'
  | 'enrollment_without_installments'
  | 'orphan_enrollment';

export interface DataIssue {
  code: IssueCode;
  severity: IssueSeverity;
  /** وصف المشكلة بالعربي */
  message: string;
  /** الكيانات المتأثرة (أسماء للعرض) */
  entities: string[];
  count: number;
  /** هل فيه إصلاح تلقائي؟ */
  autoFixable: boolean;
}

export interface QualityReport {
  issues: DataIssue[];
  /** نسبة الجودة من 100 (بتقل مع كل مشكلة حسب خطورتها) */
  score: number;
  /** ملخص أعداد الكيانات */
  totals: {
    students: number;
    teachers: number;
    courses: number;
    groups: number;
    enrollments: number;
    linkedGroups: number;
    subjectCoverage: number;
  };
  /** توزيع المجموعات والطلاب على المواد */
  bySubject: { id: SubjectId; name: string; courses: number; groups: number; students: number; price: number }[];
}

export interface AutoFixReport {
  coursesLinked: number;
  coursesRepriced: number;
  groupsLinked: number;
  teachersLinked: number;
  remaining: number;
}
