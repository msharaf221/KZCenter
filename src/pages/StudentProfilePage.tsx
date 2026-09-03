import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, CreditCard, Phone, PhoneCall, ClipboardCheck, GraduationCap, Receipt, AlertTriangle } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import {
  dbGetById, dbGetAll, dbGetByIndex, getStudentBalance, recordInstallmentPayment,
  Student, Group, Course, Payment, Attendance, Exam, Grade, Teacher, StudentBalance, Installment,
} from '../lib/db';
import { INSTALLMENT_STATUS_LABEL } from '../lib/billing';
import { formatDate, formatCurrency, getWhatsAppLink, getContrastColor } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notifications';
import dayjs from 'dayjs';

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-green-50 text-green-700',
  partial: 'bg-blue-50 text-blue-700',
  pending: 'bg-gray-100 text-gray-700',
  late: 'bg-red-50 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400 line-through',
};

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useApp();
  const { isAdmin } = useAuth();
  const canCollect = isAdmin();
  const primaryColor = settings?.primaryColor || '#6366f1';

  const [student, setStudent] = useState<Student | null>(null);
  const [groups, setGroups] = useState<(Group & { courseName: string, teacherName: string })[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [examResults, setExamResults] = useState<(Grade & { examName: string; maxGrade: number; examDate: string })[]>([]);
  const [balance, setBalance] = useState<StudentBalance | null>(null);
  const [loading, setLoading] = useState(true);

  // نافذة تحصيل دفعة (كاملة أو جزئية)
  const [payTarget, setPayTarget] = useState<{ groupId?: string; label: string; remaining: number } | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [payNotes, setPayNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const s = await dbGetById<Student>('students', id);
      if (!s) { navigate('/students'); return; }
      setStudent(s);

      const allGroups = await dbGetAll<Group>('groups');
      const allCourses = await dbGetAll<Course>('courses');
      const allTeachers = await dbGetAll<Teacher>('teachers');
      
      const studentGroups = allGroups.filter(g => s.enrolledGroups?.includes(g.id));
      const enrichedGroups = studentGroups.map(g => ({
        ...g,
        courseName: allCourses.find(c => c.id === g.courseId)?.name || 'غير معروف',
        teacherName: allTeachers.find(t => t.id === g.teacherId)?.name || 'غير معروف'
      }));
      setGroups(enrichedGroups);

      const studentPayments = await dbGetByIndex<Payment>('payments', 'by-studentId', id);
      setPayments(studentPayments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

      // المستحقات والأقساط
      setBalance(await getStudentBalance(id));

      // سجل الحضور (using index for efficiency)
      const studentAttendance = await dbGetByIndex<Attendance>('attendance', 'by-studentId', id);
      setAttendance(studentAttendance.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

      // نتائج الامتحانات (امتحانات مجموعات الطالب + درجة الطالب فيها)
      const allExams = await dbGetAll<Exam>('exams');
      const allGrades = await dbGetAll<Grade>('grades');
      const studentGrades = allGrades.filter(g => g.studentId === id);
      const results = studentGrades
        .map(g => {
          const exam = allExams.find(e => e.id === g.examId);
          if (!exam) return null;
          return { ...g, examName: exam.name, maxGrade: exam.maxGrade, examDate: exam.date };
        })
        .filter((r): r is Grade & { examName: string; maxGrade: number; examDate: string } => r !== null)
        .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
      setExamResults(results);

    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  function openPay(groupId: string | undefined, label: string, remainingAmount: number) {
    setPayTarget({ groupId, label, remaining: remainingAmount });
    setPayAmount(remainingAmount);
    setPayDate(dayjs().format('YYYY-MM-DD'));
    setPayNotes('');
  }

  /** تحصيل دفعة — كاملة (المتبقي) أو جزئية (مبلغ أقل) */
  async function handleCollect() {
    if (!id || !payTarget) return;
    if (!(payAmount > 0)) { notify.error('المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (payAmount > payTarget.remaining) {
      notify.error(`المبلغ أكبر من المتبقي (${formatCurrency(payTarget.remaining, settings?.currency)})`);
      return;
    }
    setSavingPayment(true);
    try {
      const result = await recordInstallmentPayment({
        studentId: id,
        groupId: payTarget.groupId,
        amount: payAmount,
        date: payDate,
        notes: payNotes.trim() || undefined,
      });
      if (!result.success) { notify.error(result.error || 'حدث خطأ'); return; }
      notify.success(
        `تم تحصيل ${formatCurrency(payAmount, settings?.currency)} — المتبقي ${formatCurrency(result.remainingAfter ?? 0, settings?.currency)}`
      );
      setPayTarget(null);
      await loadData();
    } catch {
      notify.error('حدث خطأ أثناء التحصيل');
    } finally {
      setSavingPayment(false);
    }
  }

  if (loading) return <Layout title="جاري التحميل..."><div className="p-8 text-center animate-pulse">جاري التحميل...</div></Layout>;
  if (!student) return null;

  const remaining = balance ? balance.remaining : (student.totalOwed || 0) - student.totalPaid;
  const allInstallments = (balance?.groups || [])
    .flatMap(g => g.installments.map(i => ({ ...i, groupName: g.groupName } as Installment & { groupName: string })))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.periodIndex - b.periodIndex);

  // إحصائيات الحضور
  const attStats = {
    present: attendance.filter(a => a.status === 'present').length,
    absent: attendance.filter(a => a.status === 'absent').length,
    late: attendance.filter(a => a.status === 'late').length,
    excused: attendance.filter(a => a.status === 'excused').length,
  };
  const attTotal = attendance.length;
  const attRate = attTotal > 0 ? Math.round(((attStats.present + attStats.late) / attTotal) * 100) : null;


  return (
    <Layout title={`ملف الطالب: ${student.name}`}>
      <div className="space-y-6 max-w-5xl mx-auto">
        <button onClick={() => navigate('/students')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowRight size={20} /> عودة للطلاب
        </button>

        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm flex flex-col md:flex-row gap-6 items-start md:items-center">
          <div className="w-24 h-24 rounded-2xl bg-indigo-50 text-indigo-600 flex flex-shrink-0 items-center justify-center text-4xl font-bold shadow-inner" style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}>
            {student.gender === 'male' ? '👦' : '👧'}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{student.name}</h1>
            <p className="text-gray-500 mb-4">{student.age} سنة</p>
            <div className="flex flex-wrap gap-4 text-sm font-medium">
              {student.phone && (
                <a href={getWhatsAppLink(student.phone)} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                  <Phone size={16} /> هاتف الطالب
                </a>
              )}
              <a href={getWhatsAppLink(student.parentPhone)} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100 hover:bg-green-50 hover:text-green-600 transition-colors">
                <PhoneCall size={16} /> ولي الأمر
              </a>
              <div className="bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">{groups.length} مجموعة</div>
              <div className={`px-4 py-2 rounded-xl font-bold border ${remaining > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                {remaining > 0 ? `المتبقي: ${formatCurrency(remaining, settings?.currency)}` : 'خالص الديون'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><BookOpen className="text-indigo-500" /> المجموعات والمدرسين</h2>
            <div className="overflow-auto flex-1 max-h-[300px]">
              <table className="w-full text-right">
                <thead><tr className="border-b border-gray-100 text-sm text-gray-500"><th className="pb-3 font-semibold">المجموعة</th><th className="pb-3 font-semibold">الكورس</th><th className="pb-3 font-semibold text-center">المدرس</th></tr></thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {groups.length === 0 ? <tr><td colSpan={3} className="py-4 text-center text-gray-400">لا توجد مجموعات</td></tr> :
                   groups.map(g => (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="py-3 font-medium">{g.name}</td>
                      <td className="py-3 text-gray-600">{g.courseName}</td>
                      <td className="py-3 text-center text-indigo-600 font-medium hover:underline cursor-pointer" onClick={() => navigate(`/teachers/${g.teacherId}`)}>{g.teacherName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><CreditCard className="text-indigo-500" /> سجل المدفوعات</h2>
            <div className="overflow-auto flex-1 max-h-[300px]">
              <table className="w-full text-right">
                <thead><tr className="border-b border-gray-100 text-sm text-gray-500"><th className="pb-3 font-semibold">المبلغ</th><th className="pb-3 font-semibold">النوع</th><th className="pb-3 font-semibold text-center">التاريخ</th></tr></thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {payments.length === 0 ? <tr><td colSpan={3} className="py-4 text-center text-gray-400">لا يوجد مدفوعات</td></tr> :
                   payments.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="py-3 font-bold text-green-600">{formatCurrency(p.amount, settings?.currency)}</td>
                      <td className="py-3 text-gray-600">{p.type === 'subscription' ? 'اشتراك' : p.type === 'books' ? 'كتب' : 'أخرى'}</td>
                      <td className="py-3 text-center">{formatDate(p.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* المستحقات والأقساط */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="text-indigo-500" /> المستحقات والأقساط
            </h2>
            {balance && (
              <span className={`mr-auto text-sm font-bold px-3 py-1 rounded-full ${
                balance.remaining > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
              }`}>
                {balance.remaining > 0
                  ? `المتبقي: ${formatCurrency(balance.remaining, settings?.currency)}`
                  : 'مسدد بالكامل'}
              </span>
            )}
          </div>

          {!balance || balance.groups.length === 0 ? (
            <p className="py-4 text-center text-gray-400 text-sm">لا توجد مستحقات مسجلة على هذا الطالب</p>
          ) : (
            <>
              {/* ملخص لكل مجموعة */}
              <div className="space-y-2 mb-5">
                {balance.groups.map(g => (
                  <div key={g.groupId} className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex-1 min-w-[150px]">
                      <p className="text-sm font-semibold text-gray-900">{g.groupName}</p>
                      <p className="text-xs text-gray-500">{g.courseName} • {g.installments.length} قسط</p>
                    </div>
                    <div className="text-xs text-center">
                      <p className="text-gray-400">المستحق</p>
                      <p className="font-bold text-gray-800">{formatCurrency(g.owed, settings?.currency)}</p>
                    </div>
                    <div className="text-xs text-center">
                      <p className="text-gray-400">المدفوع</p>
                      <p className="font-bold text-green-600">{formatCurrency(g.paid, settings?.currency)}</p>
                    </div>
                    <div className="text-xs text-center">
                      <p className="text-gray-400">المتبقي</p>
                      <p className={`font-bold ${g.remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {g.remaining > 0 ? formatCurrency(g.remaining, settings?.currency) : 'مسدد'}
                      </p>
                    </div>
                    {g.overdueCount > 0 && (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-50 text-red-600 flex items-center gap-1">
                        <AlertTriangle size={12} /> {g.overdueCount} قسط متأخر
                      </span>
                    )}
                    {canCollect && g.remaining > 0 && (
                      <button onClick={() => openPay(g.groupId, g.groupName, g.remaining)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                        style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
                        دفع المتبقي
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* جدول الأقساط */}
              <div className="overflow-auto max-h-[320px]">
                <table className="w-full text-right">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500">
                      <th className="pb-3 font-semibold">القسط</th>
                      <th className="pb-3 font-semibold">المجموعة</th>
                      <th className="pb-3 font-semibold text-center">المستحق</th>
                      <th className="pb-3 font-semibold text-center">المدفوع</th>
                      <th className="pb-3 font-semibold text-center">المتبقي</th>
                      <th className="pb-3 font-semibold text-center">الاستحقاق</th>
                      <th className="pb-3 font-semibold text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm">
                    {allInstallments.map(i => {
                      const left = Math.max(0, i.amount - i.paidAmount);
                      return (
                        <tr key={i.id} className="hover:bg-gray-50">
                          <td className="py-2.5 font-medium text-gray-800">{i.periodLabel}</td>
                          <td className="py-2.5 text-gray-600 text-xs">{i.groupName}</td>
                          <td className="py-2.5 text-center text-gray-700">{formatCurrency(i.amount, settings?.currency)}</td>
                          <td className="py-2.5 text-center text-green-600">{formatCurrency(i.paidAmount, settings?.currency)}</td>
                          <td className={`py-2.5 text-center font-bold ${left > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(left, settings?.currency)}
                          </td>
                          <td className="py-2.5 text-center text-gray-500 text-xs">{formatDate(i.dueDate)}</td>
                          <td className="py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[i.status] || STATUS_STYLE.pending}`}>
                              {INSTALLMENT_STATUS_LABEL[i.status] || i.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ملخص الحضور */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <ClipboardCheck className="text-indigo-500" /> سجل الحضور
              {attRate !== null && (
                <span className={`text-sm px-3 py-1 rounded-full mr-auto ${attRate >= 75 ? 'bg-green-50 text-green-600' : attRate >= 50 ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600'}`}>
                  نسبة الحضور {attRate}%
                </span>
              )}
            </h2>
            {attTotal === 0 ? (
              <p className="py-4 text-center text-gray-400 text-sm">لا يوجد سجل حضور بعد</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2 mb-4 text-center text-sm">
                  <div className="bg-green-50 rounded-xl p-3"><p className="font-bold text-green-600 text-lg">{attStats.present}</p><p className="text-gray-500 text-xs">حضور</p></div>
                  <div className="bg-red-50 rounded-xl p-3"><p className="font-bold text-red-600 text-lg">{attStats.absent}</p><p className="text-gray-500 text-xs">غياب</p></div>
                  <div className="bg-yellow-50 rounded-xl p-3"><p className="font-bold text-yellow-600 text-lg">{attStats.late}</p><p className="text-gray-500 text-xs">تأخير</p></div>
                  <div className="bg-blue-50 rounded-xl p-3"><p className="font-bold text-blue-600 text-lg">{attStats.excused}</p><p className="text-gray-500 text-xs">استئذان</p></div>
                </div>
                <div className="overflow-auto flex-1 max-h-[200px]">
                  <table className="w-full text-right">
                    <thead><tr className="border-b border-gray-100 text-sm text-gray-500"><th className="pb-2 font-semibold">التاريخ</th><th className="pb-2 font-semibold text-center">الحالة</th></tr></thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                      {attendance.slice(0, 15).map(a => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="py-2">{formatDate(a.date)}</td>
                          <td className="py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              a.status === 'present' ? 'bg-green-50 text-green-600' :
                              a.status === 'absent' ? 'bg-red-50 text-red-600' :
                              a.status === 'late' ? 'bg-yellow-50 text-yellow-600' : 'bg-blue-50 text-blue-600'
                            }`}>
                              {a.status === 'present' ? 'حاضر' : a.status === 'absent' ? 'غائب' : a.status === 'late' ? 'متأخر' : 'مستأذن'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* نتائج الامتحانات */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><GraduationCap className="text-indigo-500" /> نتائج الامتحانات</h2>
            <div className="overflow-auto flex-1 max-h-[300px]">
              <table className="w-full text-right">
                <thead><tr className="border-b border-gray-100 text-sm text-gray-500"><th className="pb-3 font-semibold">الامتحان</th><th className="pb-3 font-semibold text-center">الدرجة</th><th className="pb-3 font-semibold text-center">النسبة</th><th className="pb-3 font-semibold text-center">التاريخ</th></tr></thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {examResults.length === 0 ? <tr><td colSpan={4} className="py-4 text-center text-gray-400">لا توجد نتائج بعد</td></tr> :
                   examResults.map(r => {
                    const pct = r.maxGrade > 0 ? Math.round((r.grade / r.maxGrade) * 100) : 0;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="py-3 font-medium">{r.examName}</td>
                        <td className="py-3 text-center font-bold">{r.grade} / {r.maxGrade}</td>
                        <td className="py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pct >= 75 ? 'bg-green-50 text-green-600' : pct >= 50 ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600'}`}>{pct}%</span>
                        </td>
                        <td className="py-3 text-center text-gray-500">{formatDate(r.examDate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* نافذة تحصيل دفعة (كاملة أو جزئية) */}
      {payTarget && (
        <Modal isOpen={!!payTarget} onClose={() => setPayTarget(null)} title={`تحصيل دفعة — ${payTarget.label}`} size="md">
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">المتبقي على {payTarget.groupId ? 'المجموعة' : 'الطالب'}</span>
                <span className="font-bold text-red-600">{formatCurrency(payTarget.remaining, settings?.currency)}</span>
              </div>
              <p className="text-xs text-gray-400">تقدر تحصّل المتبقي كله أو جزء منه — هيتوزّع على الأقساط الأقدم استحقاقاً.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ المحصّل *</label>
              <input type="number" min={0} max={payTarget.remaining} value={payAmount || ''}
                onChange={e => setPayAmount(+e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => setPayAmount(payTarget.remaining)}
                  className="px-3 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">المتبقي كله</button>
                <button type="button" onClick={() => setPayAmount(Math.round(payTarget.remaining / 2))}
                  className="px-3 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">نص المتبقي</button>
                <button type="button" onClick={() => setPayAmount(0)}
                  className="px-3 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">تصفير</button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">التاريخ</label>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات</label>
              <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)}
                placeholder="اختياري"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>

            <p className="text-xs text-gray-500">
              المتبقي بعد التحصيل:{' '}
              <strong className="text-gray-800">
                {formatCurrency(Math.max(0, payTarget.remaining - (payAmount || 0)), settings?.currency)}
              </strong>
            </p>
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={handleCollect} disabled={savingPayment}
              className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm disabled:opacity-60"
              style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
              {savingPayment ? 'جاري الحفظ...' : 'تأكيد التحصيل'}
            </button>
            <button onClick={() => setPayTarget(null)}
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200">
              إلغاء
            </button>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
