import { AlertTriangle, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SessionPicker from '../../components/SessionPicker';
import Modal from '../../components/ui/Modal';
import { useApp } from '../../contexts/AppContext';
import type { Course, Gender, Group, Student, StudentStatus } from '../../domain/models';
import { findStudentDuplicates } from '../../domain/studentIdentity';
import { effectiveMonthlyPrice, proratedFirstPeriod, resolveSessionsPerMonth } from '../../lib/billing';
import { notify } from '../../lib/notifications';
import { formatCurrency, getContrastColor } from '../../lib/utils';
import type { StudentEditor } from './useStudentEditor';

interface Props {
  editor: StudentEditor;
  students: Student[];
  groups: Group[];
  courses: Course[];
  onSave: () => Promise<void>;
  busy?: boolean;
}

export default function StudentFormDialog({ editor, students, groups, courses, onSave: handleSave, busy = false }: Props) {
  const { settings } = useApp();
  const navigate = useNavigate();
  const {
    showModal,
    setShowModal,
    editingStudent,
    form,
    setForm,
    initialPayments,
    setInitialPayments,
    startSessions,
    setStartSessions,
    enrollPricing,
    setEnrollPricing,
  } = editor;
  const duplicateWarning = showModal ? findStudentDuplicates(form, students, editingStudent?.id) : null;

  /** رفع صورة الطالب — بتتصغر وتتخزن data URL (من غير سيرفر ملفات) */
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify.error('الملف لازم يكون صورة');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      notify.error('حجم الصورة كبير (الحد 3 ميجا)');
      return;
    }
    const dataUrl = await new Promise<string>(resolve => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => resolve('');
      img.src = URL.createObjectURL(file);
    });
    if (!dataUrl) {
      notify.error('تعذّر قراءة الصورة');
      return;
    }
    setForm(f => ({ ...f, avatar: dataUrl }));
    notify.success('تم رفع الصورة — اضغط حفظ لتفعيلها');
  }

  return (
    <Modal
      isOpen={showModal}
      onClose={() => setShowModal(false)}
      title={editingStudent ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}
      size="lg"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* كشف التكرار */}
        {duplicateWarning && (
          <div className="sm:col-span-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1.5">
              <AlertTriangle size={14} />
              {duplicateWarning.kind === 'phone'
                ? 'فيه طالب بنفس رقم ولي الأمر — تأكد إن ده مش نفس الشخص'
                : 'فيه طالب بنفس الاسم — تأكد إن ده مش تسجيل مكرر'}
            </p>
            <div className="space-y-1">
              {duplicateWarning.matches.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    navigate(`/students/${m.id}`);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white/70 hover:bg-white text-right"
                >
                  <span className="text-xs font-semibold text-gray-800">{m.name}</span>
                  <span className="text-[11px] text-gray-500" dir="ltr">
                    {m.parentPhone}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* الصورة */}
        <div className="sm:col-span-2 flex items-center gap-3">
          <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
            {form.avatar ? (
              <img src={form.avatar} alt={form.name} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={20} className="text-gray-300" />
            )}
          </div>
          <div className="flex gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
              <Upload size={13} /> رفع صورة
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </label>
            {form.avatar && (
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, avatar: '' }))}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-red-200 rounded-xl text-xs text-red-600 hover:bg-red-50"
              >
                <Trash2 size={13} /> إزالة
              </button>
            )}
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1">الاسم الكامل *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="أدخل اسم الطالب"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">العمر *</label>
          <input
            type="number"
            min={3}
            max={18}
            value={form.age}
            onChange={e => setForm({ ...form, age: +e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">النوع *</label>
          <select
            value={form.gender}
            onChange={e => setForm({ ...form, gender: e.target.value as Gender })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="male">ولد</option>
            <option value="female">بنت</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">هاتف الطالب</label>
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="اختياري"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">هاتف ولي الأمر *</label>
          <input
            type="tel"
            value={form.parentPhone}
            onChange={e => setForm({ ...form, parentPhone: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="إلزامي"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">الحالة</label>
          <select
            value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value as StudentStatus })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="active">نشط</option>
            <option value="suspended">متوقف</option>
            <option value="ended">منتهي</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1">المجموعات المسجل بها</label>
          <div className="border border-gray-200 rounded-xl max-h-40 overflow-y-auto p-2 bg-white space-y-1">
            {groups.map(g => (
              <div
                key={g.id}
                className="flex flex-col gap-2 p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-200"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.enrolledGroups.includes(g.id)}
                    onChange={e => {
                      const checked = e.target.checked;
                      const newEnrolled = checked
                        ? [...form.enrolledGroups, g.id]
                        : form.enrolledGroups.filter(id => id !== g.id);
                      setForm({ ...form, enrolledGroups: newEnrolled });
                      if (!checked) {
                        const newPayments = { ...initialPayments };
                        delete newPayments[g.id];
                        setInitialPayments(newPayments);
                        const newSessions = { ...startSessions };
                        delete newSessions[g.id];
                        setStartSessions(newSessions);
                      }
                    }}
                    className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium">{g.name}</span>
                  <span className="text-xs text-gray-400">
                    ({g.studentIds.length}/{g.maxStudents})
                  </span>
                </label>
                {form.enrolledGroups.includes(g.id) &&
                  (!editingStudent || !editingStudent.enrolledGroups?.includes(g.id)) &&
                  (() => {
                    const course = courses.find(c => c.id === g.courseId);
                    const pr = enrollPricing[g.id] || {};
                    const monthly = course
                      ? effectiveMonthlyPrice({ coursePrice: course.price, priceOverride: pr.priceOverride })
                      : 0;
                    const sessions = resolveSessionsPerMonth({
                      courseSessionsPerMonth: course?.sessionsPerMonth,
                      settingSessionsPerMonth: settings?.sessionsPerMonth,
                    });
                    const fromSession = startSessions[g.id] || 1;
                    const firstMonth = fromSession > 1 ? proratedFirstPeriod(monthly, fromSession, sessions) : monthly;
                    const paid = initialPayments[g.id] || 0;
                    const left = Math.max(0, firstMonth - paid);
                    return (
                      <div className="pr-6 space-y-1.5">
                        <SessionPicker
                          size="sm"
                          sessions={sessions}
                          value={fromSession}
                          onChange={n => setStartSessions({ ...startSessions, [g.id]: n })}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="text-xs text-gray-500">سعر خاص</label>
                          <input
                            type="number"
                            min={0}
                            placeholder={course ? String(course.price) : ''}
                            value={pr.priceOverride ?? ''}
                            onChange={e =>
                              setEnrollPricing(p => ({
                                ...p,
                                [g.id]: {
                                  ...p[g.id],
                                  priceOverride: e.target.value === '' ? undefined : +e.target.value,
                                },
                              }))
                            }
                            className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="text-xs text-gray-500">دفع دلوقتي</label>
                          <input
                            type="number"
                            placeholder="0"
                            min="0"
                            value={initialPayments[g.id] || ''}
                            onChange={e => setInitialPayments({ ...initialPayments, [g.id]: +e.target.value })}
                            className="w-28 px-3 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                          />
                          {course && (
                            <button
                              type="button"
                              onClick={() => setInitialPayments({ ...initialPayments, [g.id]: firstMonth })}
                              className="px-2 py-1 text-[11px] rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                            >
                              المبلغ كله
                            </button>
                          )}
                        </div>
                        {course && (
                          <p className="text-xs text-gray-500">
                            {fromSession > 1 ? (
                              <>
                                المطلوب:{' '}
                                <strong className="text-gray-800">
                                  {formatCurrency(firstMonth, settings?.currency)}
                                </strong>{' '}
                                ({sessions - fromSession + 1} حصص من {sessions} ×{' '}
                                {formatCurrency(Math.round((monthly / sessions) * 100) / 100, settings?.currency)})
                              </>
                            ) : (
                              <>
                                المطلوب:{' '}
                                <strong className="text-gray-800">
                                  {formatCurrency(firstMonth, settings?.currency)}
                                </strong>{' '}
                                (شهر كامل)
                              </>
                            )}
                            {paid > 0 && (
                              <>
                                {' '}
                                — يدفع {formatCurrency(paid, settings?.currency)} و
                                {left > 0 ? (
                                  <strong className="text-red-600">
                                    {' '}
                                    باقي {formatCurrency(left, settings?.currency)}
                                  </strong>
                                ) : (
                                  <strong className="text-green-600"> خالص</strong>
                                )}
                              </>
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })()}
              </div>
            ))}
            {groups.length === 0 && <p className="text-sm text-gray-500 text-center py-2">لا توجد مجموعات متاحة</p>}
          </div>
        </div>
        {/* بيانات المتابعة (CRM) */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">اسم ولي الأمر</label>
          <input
            type="text"
            value={form.parentName || ''}
            onChange={e => setForm({ ...form, parentName: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
            placeholder="اختياري"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">المدرسة</label>
          <input
            type="text"
            value={form.school || ''}
            onChange={e => setForm({ ...form, school: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
            placeholder="اختياري"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">الصف الدراسي</label>
          <input
            type="text"
            value={form.gradeLevel || ''}
            onChange={e => setForm({ ...form, gradeLevel: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
            placeholder="مثال: تالتة ابتدائي"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">إزاي عرف المركز؟</label>
          <select
            value={form.source || ''}
            onChange={e => setForm({ ...form, source: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white"
          >
            <option value="">غير محدد</option>
            {[
              'إعلان فيسبوك',
              'توصية من ولي أمر',
              'لافتة المركز',
              'بحث جوجل',
              'إنستجرام',
              'أخ/أخت في المركز',
              'أخرى',
            ].map(o => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات</label>
          <textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="أي ملاحظات إضافية..."
          />
        </div>
      </div>
      <div className="flex gap-3 mt-5">
        <button
          onClick={handleSave} disabled={busy}
          className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm transition-colors"
          style={{
            backgroundColor: settings?.primaryColor || '#6366f1',
            color: getContrastColor(settings?.primaryColor || '#6366f1'),
          }}
        >
          {editingStudent ? 'تحديث' : 'إضافة'}
        </button>
        <button
          onClick={() => setShowModal(false)}
          className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors"
        >
          إلغاء
        </button>
      </div>
    </Modal>
  );
}
