import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import SessionPicker from '../../components/SessionPicker';
import StudentPicker from '../students/StudentPicker';
import type { Course, Group } from '../../domain/models/catalog';
import type { Settings } from '../../domain/models/settings';
import type { Student } from '../../domain/models/people';
import { proratedFirstPeriod, resolveSessionsPerMonth } from '../../lib/billing';
import { calculateEffectivePrice } from '../../services/pricingService';
import { formatCurrency, getContrastColor } from '../../lib/utils';

interface GroupStudentsDialogProps {
  group: Group;
  courses: Course[];
  students: Student[];
  settings: Settings | null;
  canEnroll: boolean;
  canRenew: boolean;
  canTransfer: boolean;
  pending: boolean;
  onClose: () => void;
  onEnroll: (groupId: string, studentIds: string[], startSession: number) => Promise<boolean>;
  onRenew: (student: Student, groupId: string) => void;
  onTransfer: (student: Student, groupId: string) => void;
  onRemove: (student: Student, groupId: string) => void;
}

/** Membership workflow stays isolated from the catalog page and keeps its draft scoped to one group. */
export default function GroupStudentsDialog({
  group,
  courses,
  students,
  settings,
  canEnroll,
  canRenew,
  canTransfer,
  pending,
  onClose,
  onEnroll,
  onRenew,
  onTransfer,
  onRemove,
}: GroupStudentsDialogProps) {
  const navigate = useNavigate();
  const mounted = useRef(true);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [startSession, setStartSession] = useState(1);
  const [showEnrollConfirm, setShowEnrollConfirm] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const course = courses.find(item => item.id === group.courseId);
  const openSeats = Math.max(0, group.maxStudents - group.studentIds.length);
  const canAddStudents = group.status !== 'ended' && group.status !== 'full' && openSeats > 0;
  const monthlyPrice = calculateEffectivePrice({ group, course });
  const sessionsPerMonth = resolveSessionsPerMonth({
    courseSessionsPerMonth: course?.sessionsPerMonth,
    settingSessionsPerMonth: settings?.sessionsPerMonth,
  });
  const firstPeriodPrice = startSession > 1
    ? proratedFirstPeriod(monthlyPrice, startSession, sessionsPerMonth)
    : monthlyPrice;
  const studentById = new Map(students.map(student => [student.id, student]));
  const selectedNames = selectedStudentIds
    .map(id => studentById.get(id)?.name)
    .filter((name): name is string => !!name);
  const enrollmentMessage = [
    `المجموعة: ${group.name}`,
    `عدد الطلاب: ${selectedStudentIds.length}`,
    `بداية التسجيل من الحصة: ${startSession}`,
    `الاشتراك الشهري لكل طالب: ${formatCurrency(monthlyPrice, settings?.currency)}`,
    `القسط الأول لكل طالب: ${formatCurrency(firstPeriodPrice, settings?.currency)}`,
    'سيُنشأ القسط تلقائيًا، ولن يتم تسجيل أي دفعة الآن.',
    '',
    `${selectedNames.slice(0, 5).join('، ')}${selectedNames.length > 5 ? ` و${selectedNames.length - 5} آخرين` : ''}`,
  ].join('\n');

  async function confirmEnrollment() {
    if (pending || selectedStudentIds.length === 0) return;
    const succeeded = await onEnroll(group.id, [...selectedStudentIds], startSession);
    if (!succeeded || !mounted.current) return;
    setShowEnrollConfirm(false);
    setSelectedStudentIds([]);
    setStartSession(1);
  }

  return (
    <>
      <Modal isOpen onClose={onClose} title={`طلاب مجموعة: ${group.name}`} size="lg">
        <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-gray-900">إضافة طلاب للمجموعة</h3>
              <p className="mt-1 text-xs text-gray-600">
                المتاح {openSeats} من {group.maxStudents} مكان · الاشتراك {formatCurrency(monthlyPrice, settings?.currency)} لكل طالب شهريًا
              </p>
            </div>
            {canEnroll && canAddStudents && (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-100">
                تم اختيار {selectedStudentIds.length}
              </span>
            )}
          </div>

          {!canEnroll ? (
            <p className="rounded-xl bg-white p-3 text-xs text-gray-600">ليس لديك صلاحية تسجيل طلاب في المجموعات.</p>
          ) : !canAddStudents ? (
            <p className="rounded-xl bg-white p-3 text-xs font-semibold text-amber-800">
              {group.status === 'ended' ? 'المجموعة منتهية ولا تقبل تسجيلات جديدة.' : group.status === 'full' || openSeats === 0 ? 'المجموعة مكتملة ولا توجد أماكن متاحة.' : 'لا يمكن التسجيل في هذه المجموعة الآن.'}
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-indigo-100 bg-white p-3 space-y-2">
                <SessionPicker
                  size="sm"
                  sessions={sessionsPerMonth}
                  value={startSession}
                  onChange={setStartSession}
                  label="يبدأ التسجيل من الحصة"
                />
                <p className="text-xs font-semibold text-indigo-800">
                  القسط الأول لكل طالب: {formatCurrency(firstPeriodPrice, settings?.currency)}
                </p>
              </div>
              <StudentPicker
                key={`group-student-picker-${group.id}`}
                students={students.filter(student => !group.studentIds.includes(student.id))}
                selectedIds={selectedStudentIds}
                onChange={setSelectedStudentIds}
                multiple
                maxSelections={openSeats}
                disabled={pending || showEnrollConfirm}
                emptyHint="ابدأ بكتابة اسم الطالب أو رقم هاتفه؛ لن نعرض قائمة طويلة قبل البحث."
              />
              {selectedStudentIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-white p-3">
                  <p className="text-xs leading-5 text-gray-600">
                    سيتم تسجيل {selectedStudentIds.length} طالب وإنشاء القسط الشهري لكل واحد. لا يوجد تحصيل تلقائي.
                  </p>
                  <button
                    type="button"
                    disabled={pending || showEnrollConfirm}
                    onClick={() => setShowEnrollConfirm(true)}
                    className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}
                  >
                    مراجعة الإضافة ({selectedStudentIds.length})
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-2">
          {group.studentIds.length === 0 ? (
            <p className="text-center text-gray-400 py-6">لا يوجد طلاب في هذه المجموعة</p>
          ) : group.studentIds.map(studentId => {
            const student = studentById.get(studentId);
            if (!student) return null;
            return (
              <div key={studentId} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl gap-2">
                <div className="flex items-center gap-2 cursor-pointer group min-w-0 flex-1" onClick={() => navigate(`/students/${studentId}`)} title="عرض ملف الطالب">
                  <span className="text-xl shrink-0">{student.gender === 'male' ? '👦' : '👧'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold group-hover:text-indigo-600 group-hover:underline transition-colors truncate">{student.name}</p>
                    <p className="text-xs text-gray-500 truncate">{student.parentPhone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button disabled={!canRenew || pending} onClick={() => onRenew(student, group.id)}
                    className="text-xs text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded-lg transition-colors whitespace-nowrap" title="تجديد / استكمال الاشتراك">
                    تجديد
                  </button>
                  <button disabled={!canTransfer || pending} onClick={() => onTransfer(student, group.id)}
                    className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors whitespace-nowrap">
                    تحويل
                  </button>
                  <button disabled={!canEnroll || pending} onClick={() => onRemove(student, group.id)}
                    className="text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors whitespace-nowrap">
                    إزالة
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showEnrollConfirm}
        title={`تأكيد تسجيل ${selectedStudentIds.length} طالب`}
        message={enrollmentMessage}
        confirmLabel={pending ? 'جاري التسجيل...' : 'تأكيد التسجيل'}
        onConfirm={() => { void confirmEnrollment(); }}
        onCancel={() => setShowEnrollConfirm(false)}
      />
    </>
  );
}
