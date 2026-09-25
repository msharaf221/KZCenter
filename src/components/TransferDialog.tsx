import { useCallback, useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { carriedEnrollmentPricing } from '../domain/ledger/pricing';
import type { Course, Group, Teacher } from '../domain/models';
import { useAsyncResource } from '../hooks/useAsyncResource';
import { useCommandTask } from '../hooks/useCommandTask';
import { effectiveMonthlyPrice, proratedFirstPeriod, resolveSessionsPerMonth } from '../lib/billing';
import { notify } from '../lib/notifications';
import { formatCurrency, getContrastColor } from '../lib/utils';
import { getStudentBalance } from '../services/balanceService';
import { transferGroupStudent } from '../services/commands/studentFinance';
import { loadRenewalDialog } from '../services/queries/enrollmentDialogs';
import SessionPicker from './SessionPicker';
import Modal from './ui/Modal';
import ResourceError from './ui/ResourceError';

interface Props {
  open: boolean;
  studentId: string;
  studentName: string;
  fromGroupId: string;
  groups: Group[];
  courses: Course[];
  teachers: Teacher[];
  onClose: () => void;
  /** بيستدعي بعد نجاح التحويل (لتحديث القوائم) */
  onDone: () => void;
}

/**
 * نافذة تحويل طالب من مجموعة لمجموعة (أو من مدرس لمدرس).
 * بتعرض المدرس والسعة لكل مجموعة، وتسمح بالالتحاق من حصة معينة،
 * وبترحيل المدفوع حسب اتفاق التسجيل الحالي.
 */
export default function TransferDialog(props: Props) {
  return props.open ? <TransferForm key={JSON.stringify([props.studentId, props.fromGroupId])} {...props} /> : null;
}

function TransferForm({
  open, studentId, studentName, fromGroupId, groups, courses, teachers, onClose, onDone,
}: Props) {
  const { settings } = useApp();
  const { user } = useAuth();
  const task = useCommandTask();
  const primaryColor = settings?.primaryColor || '#6366f1';

  const fromGroup = groups.find(g => g.id === fromGroupId);
  const fromCourse = courses.find(c => c.id === fromGroup?.courseId);

  const [toGroupId, setToGroupId] = useState('');
  const [sameCourseOnly, setSameCourseOnly] = useState(true);
  const [reason, setReason] = useState('');
  const saving = task.pending;
  const [startSession, setStartSession] = useState(1);

  const query = useCallback(async () => ({ balance: await getStudentBalance(studentId), source: await loadRenewalDialog(studentId, fromGroupId) }), [studentId, fromGroupId]);
  const { data, loading, error, reload } = useAsyncResource(query, null);
  const paidInFromGroup = data?.balance?.groups.find(group => group.groupId === fromGroupId)?.paid || 0;

  const candidates = useMemo(() => {
    return groups
      .filter(g => g.id !== fromGroupId)
      .filter(g => g.status !== 'ended')
      .filter(g => !sameCourseOnly || !fromCourse || g.courseId === fromCourse.id)
      .map(g => ({
        group: g,
        course: courses.find(c => c.id === g.courseId),
        teacher: teachers.find(t => t.id === g.teacherId),
        full: g.studentIds.length >= g.maxStudents,
      }));
  }, [groups, fromGroupId, fromCourse, sameCourseOnly, courses, teachers]);

  const target = candidates.find(c => c.group.id === toGroupId);
  const agreement = data?.source.enrollment;
  const targetPrice = effectiveMonthlyPrice({ coursePrice: target?.course?.price || 0, ...carriedEnrollmentPricing(agreement, target?.group.courseId === fromGroup?.courseId) });
  const targetSessions = resolveSessionsPerMonth({
    courseSessionsPerMonth: target?.course?.sessionsPerMonth,
    settingSessionsPerMonth: settings?.sessionsPerMonth,
  });
  const firstMonth = startSession > 1 ? proratedFirstPeriod(targetPrice, startSession, targetSessions) : targetPrice;
  const previewLeft = Math.round((firstMonth - paidInFromGroup) * 100) / 100;

  async function handleTransfer() {
    if (loading || error || !data || !toGroupId) return;
    const result = await task.run(() => transferGroupStudent(user, { studentId, fromGroupId, toGroupId, reason: reason.trim() || undefined, startSession }));
    if (!result || !task.isActive()) return;
    notify.success(`تم تحويل ${studentName} إلى ${target?.group.name || ''} — رصيد مرحّل ${formatCurrency(result.credit || 0, settings?.currency)}، المتبقي ${formatCurrency(result.remainingAfter || 0, settings?.currency)}`);
    onDone(); onClose();
  }

  return (
    <Modal isOpen={open} onClose={saving ? () => { } : onClose} title={`تحويل الطالب: ${studentName}`} size="md">
      <div className="space-y-4">
        {error && <ResourceError onRetry={reload} />}
        {loading && <p role="status" className="text-center">جاري تحميل رصيد التحويل...</p>}
        {/* من فين */}
        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm">
          <p className="text-gray-500 text-xs mb-1">التحويل من</p>
          <p className="font-bold text-gray-900">
            {fromGroup?.name || '—'}
            {fromCourse && <span className="text-gray-500 font-normal"> • {fromCourse.name}</span>}
            {fromGroup && (
              <span className="text-gray-500 font-normal"> • {teachers.find(t => t.id === fromGroup.teacherId)?.name || 'غير محدد'}</span>
            )}
          </p>
          {paidInFromGroup > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              المدفوع في هذه المجموعة: <strong className="text-green-600">{formatCurrency(paidInFromGroup, settings?.currency)}</strong>
            </p>
          )}
        </div>

        {/* المجموعة الجديدة */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-semibold text-gray-700">المجموعة الجديدة *</label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={sameCourseOnly} onChange={e => setSameCourseOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300" />
              نفس الكورس فقط
            </label>
          </div>
          <select value={toGroupId} onChange={e => setToGroupId(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
            <option value="">اختر المجموعة...</option>
            {candidates.map(({ group, course, teacher, full }) => (
              <option key={group.id} value={group.id} disabled={full}>
                {group.name} — {course?.name || 'بدون كورس'} — {teacher?.name || 'بدون مدرس'} ({group.studentIds.length}/{group.maxStudents}){full ? ' — مكتملة' : ''}
              </option>
            ))}
          </select>
          {candidates.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">لا توجد مجموعات متاحة — جرّب إلغاء فلتر «نفس الكورس فقط»</p>
          )}
        </div>

        {target && data && !error && !loading && (
          <>
            <SessionPicker
              label="هيبدأ في المجموعة الجديدة من الحصة رقم"
              sessions={targetSessions}
              value={startSession}
              onChange={setStartSession}
            />

            <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-gray-600 space-y-0.5">
              <p>
                المطلوب في المجموعة الجديدة: <strong className="text-gray-800">{formatCurrency(firstMonth, settings?.currency)}</strong>
                {startSession > 1 && <> ({targetSessions - startSession + 1} حصص من {targetSessions})</>}
              </p>
              <p>المدفوع هنا وهيتّرحل: <strong className="text-green-600">{formatCurrency(paidInFromGroup, settings?.currency)}</strong></p>
              <p>
                {previewLeft > 0
                  ? <>هيفضل عليه: <strong className="text-red-600">{formatCurrency(previewLeft, settings?.currency)}</strong></>
                  : previewLeft < 0
                    ? <>ليه فائض: <strong className="text-green-600">{formatCurrency(-previewLeft, settings?.currency)}</strong></>
                    : <strong className="text-green-600">خالص ✓</strong>}
              </p>
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">سبب التحويل</label>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="اختياري — مثال: تغيير المدرس"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
        </div>
      </div>

      <div className="flex gap-3 mt-5">
        <button onClick={handleTransfer} disabled={saving || loading || !!error || !data || !toGroupId}
          className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
          style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
          {saving ? 'جاري التحويل...' : 'تأكيد التحويل'}
        </button>
        <button disabled={saving} onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200">
          إلغاء
        </button>
      </div>
    </Modal>
  );
}
