import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, CreditCard, Phone, PhoneCall, ClipboardCheck, GraduationCap, Receipt, ArrowLeftRight, MessageCircle, RefreshCw, User, School, Megaphone, CalendarDays, StickyNote, Users } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import {
  dbGetById, dbGetAll, dbGetByIndex, getStudentBalance, recordInstallmentPayment, getTransferHistory,
  Student, Group, Course, Payment, Attendance, Exam, Grade, Teacher, StudentBalance, TransferRecord, Enrollment, RenewalInfo,
} from '../lib/db';
import { RENEWAL_STATE_LABEL, renewalInfo } from '../lib/billing';
import TransferDialog from '../components/TransferDialog';
import RenewDialog from '../components/RenewDialog';
import Badge from '../components/ui/Badge';
import { formatDate, formatCurrency, getWhatsAppLink, getContrastColor } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notifications';
import dayjs from 'dayjs';

const RENEWAL_STYLE: Record<RenewalInfo['state'], string> = {
  active: 'bg-green-50 text-green-700',
  expiring: 'bg-yellow-50 text-yellow-700',
  expired: 'bg-red-50 text-red-700',
};

/** عنصر بيانات مكتوب (اسم الحقل + القيمة) — القيمة الفاضية بتتعرض «—» */
function InfoItem({ icon, label, value, dir }: { icon: React.ReactNode; label: string; value?: string | number | null; dir?: 'ltr' | 'rtl' }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-400 leading-tight">{label}</p>
        <p className={`font-medium leading-snug break-words ${empty ? 'text-gray-300' : 'text-gray-900'}`} dir={dir}>
          {empty ? '—' : value}
        </p>
      </div>
    </div>
  );
}

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
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [transferFrom, setTransferFrom] = useState<{ groupId: string; groupName: string } | null>(null);
  const [renewTarget, setRenewTarget] = useState<{ groupId: string } | null>(null);
  const [renewalByGroup, setRenewalByGroup] = useState<Record<string, RenewalInfo>>({});
  const [enrollmentByGroup, setEnrollmentByGroup] = useState<Record<string, Enrollment>>({});
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
      setAllGroups(allGroups);
      setAllCourses(allCourses);
      setAllTeachers(allTeachers);
      
      const studentGroups = allGroups.filter(g => s.enrolledGroups?.includes(g.id));
      const enrichedGroups = studentGroups.map(g => ({
        ...g,
        courseName: allCourses.find(c => c.id === g.courseId)?.name || 'غير معروف',
        teacherName: allTeachers.find(t => t.id === g.teacherId)?.name || 'غير معروف'
      }));
      setGroups(enrichedGroups);

      const studentPayments = await dbGetByIndex<Payment>('payments', 'by-studentId', id);
      setPayments(studentPayments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

      // الحساب (شهر بشهر)
      const b = await getStudentBalance(id);
      setBalance(b);

      // حالة الاشتراك (ساري/قرب ينتهي/منتهي) لكل مجموعة
      const today = dayjs().format('YYYY-MM-DD');
      const ahead = settings?.upcomingDueDays ?? 7;
      const rmap: Record<string, RenewalInfo> = {};
      for (const g of studentGroups) {
        const gb = b?.groups.find(x => x.groupId === g.id);
        rmap[g.id] = renewalInfo(gb?.installments || [], today, ahead);
      }
      setRenewalByGroup(rmap);

      const ens = await dbGetByIndex<Enrollment>('enrollments', 'by-studentId', id);
      const emap: Record<string, Enrollment> = {};
      for (const e of ens) if (e.status === 'active') emap[e.groupId] = e;
      setEnrollmentByGroup(emap);

      // سجل التحويلات
      setTransfers(await getTransferHistory(id));

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
  }, [id, navigate, settings?.upcomingDueDays]);

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
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
              <Badge status={student.status} />
            </div>
            <p className="text-gray-500 mb-4">
              {student.age} سنة • {student.gender === 'male' ? 'ولد' : 'بنت'}
              {student.gradeLevel ? ` • ${student.gradeLevel}` : ''}
            </p>

            {/* البيانات مكتوبة (مش زراير بس) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 mb-4">
              <InfoItem icon={<Phone size={15} />} label="هاتف الطالب" value={student.phone} dir="ltr" />
              <InfoItem icon={<PhoneCall size={15} />} label="هاتف ولي الأمر" value={student.parentPhone} dir="ltr" />
              <InfoItem icon={<User size={15} />} label="اسم ولي الأمر" value={student.parentName} />
              <InfoItem icon={<School size={15} />} label="المدرسة" value={student.school} />
              <InfoItem icon={<Megaphone size={15} />} label="عرف المركز عن طريق" value={student.source} />
              <InfoItem icon={<CalendarDays size={15} />} label="تاريخ التسجيل" value={formatDate(student.createdAt)} />
              {student.notes && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <InfoItem icon={<StickyNote size={15} />} label="ملاحظات" value={student.notes} />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-sm font-medium">
              {student.phone && (
                <a href={getWhatsAppLink(student.phone)} target="_blank" rel="noreferrer" title={`واتساب الطالب ${student.phone}`}
                  className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 hover:bg-green-50 hover:text-green-600 transition-colors text-xs">
                  <MessageCircle size={14} /> واتساب الطالب
                </a>
              )}
              <a href={getWhatsAppLink(student.parentPhone)} target="_blank" rel="noreferrer" title={`واتساب ولي الأمر ${student.parentPhone}`}
                className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 hover:bg-green-50 hover:text-green-600 transition-colors text-xs">
                <MessageCircle size={14} /> واتساب ولي الأمر
              </a>
              <a href={`tel:${student.parentPhone}`} className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors text-xs">
                <PhoneCall size={14} /> اتصال بولي الأمر
              </a>
              <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 text-xs"><Users size={14} /> {groups.length} مجموعة</div>
              <div className={`px-3 py-1.5 rounded-xl font-bold border text-xs ${remaining > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                {remaining > 0 ? `المتبقي: ${formatCurrency(remaining, settings?.currency)}` : 'خالص الديون'}
              </div>
            </div>
          </div>
        </div>

        {/* تنبيه تجديد: اشتراك منتهي أو قرب ينتهي */}
        {groups.some(g => renewalByGroup[g.id]?.state !== 'active' && (balance?.groups.some(b => b.groupId === g.id) ?? false)) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <RefreshCw size={18} className="text-yellow-600" />
            <div className="flex-1 min-w-[200px] text-sm">
              <p className="font-bold text-yellow-800">الشهر خلص — محتاج يفتح شهر جديد</p>
              <p className="text-yellow-700 text-xs">
                {groups
                  .filter(g => renewalByGroup[g.id]?.state !== 'active' && balance?.groups.some(b => b.groupId === g.id))
                  .map(g => {
                    const r = renewalByGroup[g.id];
                    return `${g.name}: ${RENEWAL_STATE_LABEL[r.state]}${r.endDate ? ` (${formatDate(r.endDate)})` : ''}`;
                  })
                  .join(' • ')}
              </p>
            </div>
            {canCollect && (
              <button
                onClick={() => {
                  const g = groups.find(x => renewalByGroup[x.id]?.state !== 'active');
                  if (g) setRenewTarget({ groupId: g.id });
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-yellow-600 hover:bg-yellow-700 transition-colors">
                افتح شهر جديد
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><BookOpen className="text-indigo-500" /> المجموعات والمدرسين</h2>
            <div className="overflow-auto flex-1 max-h-[300px]">
              <table className="w-full text-right">
                <thead><tr className="border-b border-gray-100 text-sm text-gray-500"><th className="pb-3 font-semibold">المجموعة</th><th className="pb-3 font-semibold">الكورس</th><th className="pb-3 font-semibold text-center">المدرس</th><th className="pb-3 font-semibold text-center">الشهر الحالي</th>{canCollect && <th className="pb-3 font-semibold text-center">إجراءات</th>}</tr></thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {groups.length === 0 ? <tr><td colSpan={canCollect ? 5 : 4} className="py-4 text-center text-gray-400">لا توجد مجموعات</td></tr> :
                   groups.map(g => {
                    const r = renewalByGroup[g.id];
                    const en = enrollmentByGroup[g.id];
                    const hasPlan = !!r && r.periods > 0;
                    return (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="py-3 font-medium">
                        {g.name}
                        {en?.renewalCount ? <span className="block text-[10px] text-gray-400">اتجدد {en.renewalCount} مرة</span> : null}
                      </td>
                      <td className="py-3 text-gray-600">{g.courseName}</td>
                      <td className="py-3 text-center text-indigo-600 font-medium hover:underline cursor-pointer" onClick={() => navigate(`/teachers/${g.teacherId}`)}>{g.teacherName}</td>
                      <td className="py-3 text-center">
                        {hasPlan ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${RENEWAL_STYLE[r.state]}`}
                            title={r.endDate ? `ينتهي ${formatDate(r.endDate)}` : ''}>
                            {RENEWAL_STATE_LABEL[r.state]}
                            {r.endDate && <span className="block font-normal text-[10px] opacity-80">حتى {formatDate(r.endDate)}</span>}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      {canCollect && (
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <button onClick={() => setRenewTarget({ groupId: g.id })}
                              className={`text-xs px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${r?.state === 'expired' ? 'text-white bg-red-500 hover:bg-red-600' : r?.state === 'expiring' ? 'text-yellow-800 bg-yellow-100 hover:bg-yellow-200' : 'text-green-700 bg-green-50 hover:bg-green-100'}`}
                              title="فتح شهر جديد في نفس المجموعة">
                              <RefreshCw size={12} /> شهر جديد
                            </button>
                            <button onClick={() => setTransferFrom({ groupId: g.id, groupName: g.name })}
                              className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors">
                              تحويل
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    );
                  })}
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

        {/* الحساب — شهر بشهر */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="text-indigo-500" /> الحساب
            </h2>
            {balance && (
              <span className={`mr-auto text-sm font-bold px-3 py-1 rounded-full ${
                balance.remaining > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
              }`}>
                {balance.remaining > 0
                  ? `باقي عليه: ${formatCurrency(balance.remaining, settings?.currency)}`
                  : 'خالص'}
              </span>
            )}
          </div>

          {!balance || balance.groups.length === 0 ? (
            <p className="py-4 text-center text-gray-400 text-sm">الطالب مش مسجل في أي مجموعة لسه</p>
          ) : (
            <div className="space-y-4">
              {balance.groups.map(g => {
                const r = renewalByGroup[g.groupId];
                const months = g.installments
                  .slice()
                  .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || b.periodIndex - a.periodIndex);
                return (
                  <div key={g.groupId} className="rounded-2xl border border-gray-100 overflow-hidden">
                    {/* رأس المجموعة */}
                    <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50">
                      <div className="flex-1 min-w-[150px]">
                        <p className="text-sm font-bold text-gray-900">{g.groupName}</p>
                        <p className="text-xs text-gray-500">
                          {g.courseName}
                          {r && r.periods > 0 && r.endDate && (
                            <> • <span className={r.state === 'expired' ? 'text-red-600 font-semibold' : r.state === 'expiring' ? 'text-yellow-700 font-semibold' : ''}>
                              {r.state === 'expired' ? `انتهى ${formatDate(r.endDate)}` : `مدفوع حتى ${formatDate(r.endDate)}`}
                            </span></>
                          )}
                        </p>
                      </div>
                      <div className="text-xs text-center">
                        <p className="text-gray-400">مدفوع</p>
                        <p className="font-bold text-green-600">{formatCurrency(g.paid, settings?.currency)}</p>
                      </div>
                      <div className="text-xs text-center">
                        <p className="text-gray-400">باقي</p>
                        <p className={`font-bold ${g.remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {g.remaining > 0 ? formatCurrency(g.remaining, settings?.currency) : 'خالص'}
                        </p>
                      </div>
                      {canCollect && g.remaining > 0 && (
                        <button onClick={() => openPay(g.groupId, g.groupName, g.remaining)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
                          تحصيل
                        </button>
                      )}
                      {canCollect && groups.some(x => x.id === g.groupId) && (
                        <button onClick={() => setRenewTarget({ groupId: g.groupId })}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 flex items-center gap-1"
                          title="فتح شهر جديد">
                          <RefreshCw size={12} /> شهر جديد
                        </button>
                      )}
                    </div>
                    {/* الشهور */}
                    <table className="w-full text-right text-sm">
                      <tbody className="divide-y divide-gray-50">
                        {months.map(i => {
                          const left = Math.max(0, i.amount - i.paidAmount);
                          const label = i.status === 'paid' ? 'مدفوع'
                            : i.paidAmount > 0 ? `باقي ${formatCurrency(left, settings?.currency)}`
                            : 'لم يدفع';
                          const cls = i.status === 'paid' ? 'bg-green-50 text-green-700'
                            : i.paidAmount > 0 ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-red-50 text-red-600';
                          return (
                            <tr key={i.id} className="hover:bg-gray-50">
                              <td className="py-2.5 px-3 font-medium text-gray-800">{i.periodLabel}</td>
                              <td className="py-2.5 px-3 text-gray-500 text-xs">{formatDate(i.dueDate)}</td>
                              <td className="py-2.5 px-3 text-center text-gray-700">{formatCurrency(i.amount, settings?.currency)}</td>
                              <td className="py-2.5 px-3 text-center text-green-600">{formatCurrency(i.paidAmount, settings?.currency)}</td>
                              <td className="py-2.5 px-3 text-left">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* سجل التحويلات */}
        {transfers.length > 0 && (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <ArrowLeftRight className="text-indigo-500" /> سجل التحويلات
              <span className="text-xs font-normal text-gray-400">({transfers.length})</span>
            </h2>
            <div className="overflow-auto max-h-[220px]">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="pb-3 font-semibold">التاريخ</th>
                    <th className="pb-3 font-semibold">من</th>
                    <th className="pb-3 font-semibold">إلى</th>
                    <th className="pb-3 font-semibold">السبب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transfers.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="py-2.5 text-gray-500 text-xs">{formatDate(t.date)}</td>
                      <td className="py-2.5 text-gray-700">{t.fromGroupName}</td>
                      <td className="py-2.5 font-medium text-indigo-600">{t.toGroupName}</td>
                      <td className="py-2.5 text-gray-500 text-xs">{t.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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

      {/* تحويل لمجموعة/مدرس آخر */}
      {transferFrom && (
        <TransferDialog
          open={!!transferFrom}
          studentId={student.id}
          studentName={student.name}
          fromGroupId={transferFrom.groupId}
          groups={allGroups}
          courses={allCourses}
          teachers={allTeachers}
          onClose={() => setTransferFrom(null)}
          onDone={() => loadData()}
        />
      )}

      {/* تجديد / استكمال الاشتراك */}
      {renewTarget && (
        <RenewDialog
          open={!!renewTarget}
          studentId={student.id}
          studentName={student.name}
          groupId={renewTarget.groupId}
          onClose={() => setRenewTarget(null)}
          onDone={() => loadData()}
        />
      )}

      {/* نافذة تحصيل دفعة (كاملة أو جزئية) */}
      {payTarget && (
        <Modal isOpen={!!payTarget} onClose={() => setPayTarget(null)} title={`تحصيل دفعة — ${payTarget.label}`} size="md">
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">المتبقي على {payTarget.groupId ? 'المجموعة' : 'الطالب'}</span>
                <span className="font-bold text-red-600">{formatCurrency(payTarget.remaining, settings?.currency)}</span>
              </div>
              <p className="text-xs text-gray-400">تقدر تحصّل الباقي كله أو جزء منه — والباقي يفضل ظاهر لحد ما يجيبه.</p>
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
