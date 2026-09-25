import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  Printer,
  Search,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import type { AttendanceStatus } from '../../domain/models';
import { notify } from '../../lib/notifications';
import { formatCurrency, formatDate } from '../../lib/utils';
import {
  lookupStudentPortal,
  type PortalLookupResult,
  type StudentPortalData,
} from '../../services/queries/portal';

export default function StudentPortalView() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'attendance' | 'exams' | 'finance' | 'groups'>('summary');
  const [portalResult, setPortalResult] = useState<PortalLookupResult | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentPortalData | null>(null);

  async function handleSearch(studentId?: string) {
    const raw = query.trim();
    if (!raw && !studentId) {
      notify.error('يرجى إدخال كود الطالب أو رقم الهاتف للاستعلام');
      return;
    }

    setLoading(true);
    try {
      const res = await lookupStudentPortal(raw, studentId);
      setPortalResult(res);
      if (res.selectedData) {
        setSelectedStudent(res.selectedData);
      } else if (res.matches.length === 0) {
        setSelectedStudent(null);
        notify.error('لم يتم العثور على أي طالب مسجل بهذه البيانات');
      } else {
        setSelectedStudent(null);
      }
    } catch (err) {
      console.error('Portal lookup error:', err);
      notify.error('تعذّر الاستعلام حالياً. يرجى المحاولة لاحقاً');
    } finally {
      setLoading(false);
    }
  }

  function handleSelectStudent(id: string) {
    handleSearch(id);
  }

  function handlePrintReport() {
    window.print();
  }

  const statusLabel: Record<AttendanceStatus, { text: string; bg: string; textCol: string }> = {
    present: { text: 'حاضر', bg: 'bg-green-50', textCol: 'text-green-700' },
    absent: { text: 'غائب', bg: 'bg-red-50', textCol: 'text-red-700' },
    late: { text: 'متأخر', bg: 'bg-yellow-50', textCol: 'text-yellow-700' },
    excused: { text: 'مستأذن', bg: 'bg-blue-50', textCol: 'text-blue-700' },
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6" dir="rtl">
      {/* صندوق البحث الرئيسي */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-xl no-print">
        <div className="text-center max-w-xl mx-auto mb-6">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl font-bold shadow-inner">
            🎓
          </div>
          <h2 className="text-2xl font-black text-gray-900">بوابة الطالب وولي الأمر</h2>
          <p className="text-sm text-gray-500 mt-1">
            تابع الحضور والغياب، نتائج الامتحانات، والاشتراكات الشهرية فورياً
          </p>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto"
        >
          <div className="relative flex-1">
            <Search size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="اكتب كود الطالب (STU-...) أو رقم هاتف الطالب أو ولي الأمر..."
              className="w-full pr-11 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-7 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-all shadow-md shadow-indigo-100 disabled:opacity-50 shrink-0 cursor-pointer"
          >
            {loading ? 'جاري الاستعلام...' : 'استعلام'}
          </button>
        </form>

        {/* في حال وجود أكثر من ابن/طالب بنفس الرقم (الأشقاء) */}
        {portalResult && portalResult.matches.length > 1 && !selectedStudent && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-sm font-bold text-gray-800 mb-3">
              تم العثور على {portalResult.matches.length} طلاب مسجلين بنفس الرقم. اختر الطالب لعرض تقريره:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {portalResult.matches.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleSelectStudent(m.id)}
                  className="flex items-center justify-between p-4 bg-gray-50 hover:bg-indigo-50/70 border border-gray-200 rounded-2xl text-right transition-colors"
                >
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">{m.name}</h4>
                    <span className="text-xs text-indigo-600 font-mono">{m.code}</span>
                  </div>
                  <span className="text-xs bg-white px-2.5 py-1 rounded-xl border border-gray-200 text-gray-600">
                    عرض التقرير ←
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* تقرير الطالب الشامل عند العثور عليه */}
      {selectedStudent && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-xl space-y-6">
          {/* رأس البطاقة */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-gray-100">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center text-3xl shrink-0 shadow-inner">
                {selectedStudent.student.gender === 'female' ? '👧' : '👦'}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-black text-gray-900">{selectedStudent.student.name}</h3>
                  <span className="px-2.5 py-0.5 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-mono font-bold">
                    {selectedStudent.code}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedStudent.student.gradeLevel ? `${selectedStudent.student.gradeLevel} • ` : ''}
                  هاتف ولي الأمر: <span dir="ltr">{selectedStudent.student.parentPhone}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end no-print">
              <button
                onClick={handlePrintReport}
                className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer size={15} /> طباعة التقرير
              </button>
              {portalResult && portalResult.matches.length > 1 && (
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="px-3 py-2 text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-semibold transition-colors"
                >
                  اختيار طالب آخر
                </button>
              )}
            </div>
          </div>

          {/* مؤشرات سريعة (Stats Grid) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100/70 text-center">
              <span className="text-xs font-bold text-indigo-600 block mb-1">نسبة الحضور</span>
              <span className="text-2xl font-black text-indigo-900">{selectedStudent.attendance.rate}%</span>
              <span className="text-[10px] text-indigo-500 block mt-0.5">
                {selectedStudent.attendance.present} من {selectedStudent.attendance.total} حصة
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-green-50/60 border border-green-100/70 text-center">
              <span className="text-xs font-bold text-green-600 block mb-1">المسدد</span>
              <span className="text-2xl font-black text-green-900">
                {formatCurrency(selectedStudent.finance.totalPaid, selectedStudent.finance.currency)}
              </span>
              <span className="text-[10px] text-green-600 block mt-0.5">إجمالي المدفوعات</span>
            </div>

            <div
              className={`p-4 rounded-2xl border text-center ${
                selectedStudent.finance.remaining > 0
                  ? 'bg-amber-50/60 border-amber-100/70 text-amber-900'
                  : 'bg-gray-50 border-gray-100 text-gray-800'
              }`}
            >
              <span className="text-xs font-bold text-amber-700 block mb-1">المتبقي / الأقساط</span>
              <span className="text-2xl font-black">
                {formatCurrency(selectedStudent.finance.remaining, selectedStudent.finance.currency)}
              </span>
              <span className="text-[10px] text-gray-500 block mt-0.5">
                {selectedStudent.finance.remaining > 0 ? 'أقساط مستحقة' : 'خالص الاشتراكات ✓'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-100/70 text-center">
              <span className="text-xs font-bold text-purple-600 block mb-1">الامتحانات</span>
              <span className="text-2xl font-black text-purple-900">{selectedStudent.exams.length}</span>
              <span className="text-[10px] text-purple-500 block mt-0.5">امتحان مسجل</span>
            </div>
          </div>

          {/* تبويبات التقرير التفصيلي */}
          <div className="no-print">
            <div className="flex border-b border-gray-200 overflow-x-auto gap-2">
              {[
                { id: 'summary', label: 'نظرة عامة', icon: <User size={15} /> },
                { id: 'attendance', label: 'سجل الحضور', icon: <Calendar size={15} /> },
                { id: 'exams', label: 'الامتحانات والدرجات', icon: <Award size={15} /> },
                { id: 'finance', label: 'الاشتراكات والمدفوعات', icon: <CreditCard size={15} /> },
                { id: 'groups', label: 'المجموعات والمواعيد', icon: <Users size={15} /> },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* محتوى التبويبات */}
          <div className="space-y-4 pt-2">
            {/* التبويب 1: نظرة عامة */}
            {activeTab === 'summary' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* ملخص الحضور */}
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80">
                    <h4 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
                      <Clock size={16} className="text-indigo-600" /> ملخص الغياب والحضور
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-gray-200/60">
                        <span className="text-gray-600">حصص الحضور:</span>
                        <b className="text-green-700">{selectedStudent.attendance.present} حصة</b>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-200/60">
                        <span className="text-gray-600">حصص الغياب:</span>
                        <b className="text-red-600">{selectedStudent.attendance.absent} حصة</b>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-200/60">
                        <span className="text-gray-600">مرات التأخير:</span>
                        <b className="text-amber-600">{selectedStudent.attendance.late} مرة</b>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-gray-600">الاستئذان بعذر:</span>
                        <b className="text-blue-600">{selectedStudent.attendance.excused} مرة</b>
                      </div>
                    </div>
                  </div>

                  {/* آخر الامتحانات */}
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80">
                    <h4 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
                      <Award size={16} className="text-purple-600" /> آخر نتائج الامتحانات
                    </h4>
                    {selectedStudent.exams.length > 0 ? (
                      <div className="space-y-2">
                        {selectedStudent.exams.slice(0, 3).map((ex, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-white rounded-xl border border-gray-200 text-xs"
                          >
                            <div>
                              <p className="font-bold text-gray-900">{ex.examName}</p>
                              <span className="text-[10px] text-gray-400">{formatDate(ex.date)}</span>
                            </div>
                            <div className="text-left font-bold">
                              <span
                                className={`px-2 py-0.5 rounded-md ${
                                  ex.percentage >= 85
                                    ? 'bg-green-100 text-green-800'
                                    : ex.percentage >= 65
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {ex.grade} / {ex.maxGrade} ({ex.percentage}%)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 text-center py-4">لا توجد نتائج امتحانات مسجلة حتى الآن</p>
                    )}
                  </div>
                </div>

                {/* المجموعات الملتحق بها */}
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80">
                  <h4 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
                    <BookOpen size={16} className="text-indigo-600" /> المجموعات الدراسية
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedStudent.groups.map(g => (
                      <div key={g.groupId} className="p-3 bg-white rounded-xl border border-gray-200 text-xs space-y-1">
                        <p className="font-bold text-gray-900 text-sm">{g.groupName}</p>
                        <p className="text-gray-500">كورس: {g.courseName}</p>
                        {g.teacherName && <p className="text-gray-500">المدرس: {g.teacherName}</p>}
                        {g.schedule && <p className="text-indigo-600 font-medium">المواعيد: {g.schedule}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* التبويب 2: سجل الحضور والغياب */}
            {activeTab === 'attendance' && (
              <div className="overflow-hidden border border-gray-200 rounded-2xl">
                <table className="w-full text-xs text-right">
                  <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">المجموعة</th>
                      <th className="p-3 text-center">الحالة</th>
                      <th className="p-3 text-left">وقت التسجيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedStudent.attendance.records.length > 0 ? (
                      selectedStudent.attendance.records.map((r, i) => {
                        const st = statusLabel[r.status] || statusLabel.present;
                        return (
                          <tr key={i} className="hover:bg-gray-50/70">
                            <td className="p-3 font-medium text-gray-900">{formatDate(r.date)}</td>
                            <td className="p-3 text-gray-600">{r.groupName}</td>
                            <td className="p-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] ${st.bg} ${st.textCol}`}
                              >
                                {r.status === 'present' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                {st.text}
                              </span>
                            </td>
                            <td className="p-3 text-left text-gray-400 font-mono">{r.checkInTime || '—'}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-gray-400">
                          لا توجد حصص مسجلة
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* التبويب 3: الامتحانات والدرجات */}
            {activeTab === 'exams' && (
              <div className="overflow-hidden border border-gray-200 rounded-2xl">
                <table className="w-full text-xs text-right">
                  <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-3">الامتحان</th>
                      <th className="p-3">المجموعة</th>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3 text-center">الدرجة</th>
                      <th className="p-3 text-center">النسبة والتقدير</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedStudent.exams.length > 0 ? (
                      selectedStudent.exams.map((ex, i) => (
                        <tr key={i} className="hover:bg-gray-50/70">
                          <td className="p-3 font-bold text-gray-900">{ex.examName}</td>
                          <td className="p-3 text-gray-600">{ex.groupName || '—'}</td>
                          <td className="p-3 text-gray-500">{formatDate(ex.date)}</td>
                          <td className="p-3 text-center font-bold text-sm">
                            {ex.grade} <span className="text-gray-400 text-xs font-normal">/ {ex.maxGrade}</span>
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-lg font-bold text-xs ${
                                ex.percentage >= 85
                                  ? 'bg-green-100 text-green-800'
                                  : ex.percentage >= 65
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {ex.percentage}% ·{' '}
                              {ex.percentage >= 85
                                ? 'ممتاز'
                                : ex.percentage >= 75
                                  ? 'جيد جداً'
                                  : ex.percentage >= 65
                                    ? 'جيد'
                                    : 'يحتاج تركيز'}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-gray-400">
                          لا توجد نتائج امتحانات مسجلة
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* التبويب 4: الاشتراكات والمدفوعات */}
            {activeTab === 'finance' && (
              <div className="space-y-4">
                {/* الأقساط القادمة والمستحقة */}
                <div>
                  <h4 className="font-bold text-gray-900 text-xs mb-2">الأقساط المستحقة والقادمة:</h4>
                  {selectedStudent.finance.upcomingInstallments.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedStudent.finance.upcomingInstallments.map(ins => (
                        <div
                          key={ins.id}
                          className="flex items-center justify-between p-3 rounded-xl border bg-amber-50/50 border-amber-200 text-xs"
                        >
                          <div>
                            <span className="font-bold text-gray-900">
                              {formatCurrency(ins.amount, selectedStudent.finance.currency)}
                            </span>
                            <p className="text-[11px] text-gray-500">
                              تاريخ الاستحقاق: {formatDate(ins.dueDate)}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              ins.status === 'late'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {ins.status === 'late' ? 'متأخر' : 'مستحق قريباً'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-green-50 text-green-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                      <CheckCircle size={16} /> لا توجد أقساط متأخرة أو مستحقة حالياً. شكراً لالتزامكم!
                    </div>
                  )}
                </div>

                {/* سجل المدفوعات السابقة */}
                <div>
                  <h4 className="font-bold text-gray-900 text-xs mb-2">إيصالات الدفع السابقة:</h4>
                  <div className="overflow-hidden border border-gray-200 rounded-2xl">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                        <tr>
                          <th className="p-3">رقم الإيصال</th>
                          <th className="p-3">المبلغ</th>
                          <th className="p-3">التاريخ</th>
                          <th className="p-3">طريقة الدفع</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedStudent.finance.recentPayments.length > 0 ? (
                          selectedStudent.finance.recentPayments.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50/70">
                              <td className="p-3 font-mono text-indigo-700 font-bold">{p.receiptNo || '—'}</td>
                              <td className="p-3 font-bold text-gray-900">
                                {formatCurrency(p.amount, selectedStudent.finance.currency)}
                              </td>
                              <td className="p-3 text-gray-500">{formatDate(p.date)}</td>
                              <td className="p-3 text-gray-600">{p.method || 'نقدي'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-4 text-center text-gray-400">
                              لا توجد مدفوعات مسجلة
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* التبويب 5: المجموعات والمواعيد */}
            {activeTab === 'groups' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedStudent.groups.map(g => (
                  <div key={g.groupId} className="p-4 bg-gray-50 rounded-2xl border border-gray-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-gray-900 text-sm">{g.groupName}</h4>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                        نشط
                      </span>
                    </div>
                    <p className="text-gray-600">المادة / الكورس: <b>{g.courseName}</b></p>
                    {g.teacherName && <p className="text-gray-600">المعلم: <b>{g.teacherName}</b></p>}
                    {g.schedule && (
                      <div className="pt-2 border-t border-gray-200/60 text-indigo-700 font-semibold flex items-center gap-1.5">
                        <Clock size={14} /> {g.schedule}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
