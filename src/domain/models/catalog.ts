import type { GroupStatus } from './common';
import type { SubjectId } from '../subject';

export interface Course {
  id: string;
  name: string;
  category: string;
  description?: string;
  /**
   * المادة التي يتبعها الكورس (لأغراض التصنيف والفلاتر والتقارير).
   * المادة لم تعد تحدد السعر، فلكل كورس سعره المستقل.
   */
  subjectId?: SubjectId;
  /** السعر الشهري للكورس (مستقل ولا يُشتق من المادة) */
  price: number;
  durationMonths: number;
  icon: string;
  color: string;
  levels: CourseLevel[];
  /**
   * عدد الحصص في الشهر للكورس ده.
   * لو مش محدد بيتحسب من جدول المجموعة (عدد الأيام × 4)، ولو مفيش جدول
   * بيستخدم الإعداد العام `settings.sessionsPerMonth` (الافتراضي 8).
   */
  sessionsPerMonth?: number;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface CourseLevel {
  id: string;
  name: string;
  order: number;
}

export interface Group {
  id: string;
  name: string;
  courseId: string;
  levelId?: string;
  /**
   * مادة المجموعة — بتتورّث من الكورس افتراضياً، وبتتخزن هنا عشان
   * الفلترة والتقارير (والحالات النادرة اللي مجموعة فيها مادة مختلفة).
   */
  subjectId?: SubjectId;
  teacherId: string;
  schedule: ScheduleItem[];
  maxStudents: number;
  status: GroupStatus;
  studentIds: string[];
  /**
   * السعر الشهري الخاص بالمجموعة (اختياري).
   * إذا لم يُحدد (undefined/null)، ترث المجموعة سعر الكورس المرتبطة به.
   * السعر 0 مسموح به تماماً ويُفرّق عن غير المحدد.
   */
  price?: number;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface ScheduleItem {
  days: string[];
  startTime: string;
  endTime: string;
  room?: string;
}
