import { useState, useEffect, useMemo } from 'react';
import Modal from './ui/Modal';
import { transferStudent, getStudentBalance, Group, Course, Teacher } from '../lib/db';
import { formatCurrency, getContrastColor } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { notify } from '../lib/notifications';

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
 * وبترحيل المدفوع كرصيد (افتراضي) أو بدء المجموعة الجديدة من الصفر.
 */
export default function TransferDialog({
  open, studentId, studentName, fromGroupId, groups, courses, teachers, onClose, onDone,
}: Props) {
  const { settings } = useApp();
  const primaryColor = settings?.primaryColor || '#6366f1';

  const fromGroup = groups.find(g => g.id === fromGroupId);
  const fromCourse = courses.find(c => c.id === fromGroup?.courseId);

  const [toGroupId, setToGroupId] = useState('');
  const [sameCourseOnly, setSameCourseOnly] = useState(true);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [paidInFromGroup, setPaidInFromGroup] = useState(0);

  // اللي مدفوع في المجموعة الحالية (الرصيد المرشّح للترحيل)
  useEffect(() => {
    if (!open || !studentId) return;
    let cancelled = false;
    getStudentBalance(studentId)
      .then(b => {
        if (cancelled) return;
        setPaidInFromGroup(b?.groups.find(g => g.groupId === fromGroupId)?.paid || 0);
      })
      .catch(() => { if (!cancelled) setPaidInFromGroup(0); });
    return () => { cancelled = true; };
  }, [open, studentId, fromGroupId]);

  // ملاحظة: المكوّن بيتعمله mount جديد مع كل فتح (الأب بيرسمه بشرط وجود هدف)،
  // فالحالة الابتدائية فوق كافية وما فيش حاجة تحتاج تصفير.

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
  const targetPrice = target?.course?.price || 0;

  async function handleTransfer() {
    if (!toGroupId) { notify.error('اختر المجموعة الجديدة'); return; }
    setSaving(true);
    try {
      const result = await transferStudent({
        studentId,
        fromGroupId,
        toGroupId,
        reason: reason.trim() || undefined,
      });
      if (!result.success) { notify.error(result.error || 'حدث خطأ أثناء التحويل'); return; }

      const targetName = target?.group.name || '';
      notify.success(
        `تم تحويل ${studentName} إلى ${targetName} — رصيد مرحّل ${formatCurrency(result.credit || 0, settings?.currency)}، المتبقي ${formatCurrency(result.remainingAfter || 0, settings?.currency)}`
      );
      onDone();
      onClose();
    } catch (e) {
      console.error('transfer error:', e);
      notify.error('حدث خطأ أثناء التحويل');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={`تحويل الطالب: ${studentName}`} size="md">
      <div className="space-y-4">
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

        {/* ترحيل الرصيد (سلوك ثابت) */}
        {target && (
          <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-gray-600 space-y-0.5">
            <p>سعر الشهر في المجموعة الجديدة: <strong className="text-gray-800">{formatCurrency(targetPrice, settings?.currency)}</strong></p>
            <p>
              <strong className="text-gray-800">المدفوع بيتّرحل.</strong>
              {' '}الـ {formatCurrency(paidInFromGroup, settings?.currency)} اللي اتدفعت هنا هتتحسب على المجموعة الجديدة،
              ولو فيه فرق يظهر كمتبقي (أو كفائض لصالح الطالب).
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">سبب التحويل</label>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="اختياري — مثال: تغيير المدرس"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
        </div>
      </div>

      <div className="flex gap-3 mt-5">
        <button onClick={handleTransfer} disabled={saving || !toGroupId}
          className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
          style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
          {saving ? 'جاري التحويل...' : 'تأكيد التحويل'}
        </button>
        <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200">
          إلغاء
        </button>
      </div>
    </Modal>
  );
}
