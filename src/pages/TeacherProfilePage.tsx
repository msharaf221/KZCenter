import { ArrowRight, BookOpen, CalendarDays, GraduationCap, Mail, MessageCircle, Phone, PhoneCall, StickyNote, Users2, Wallet } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import PageReadError from '../components/layout/PageReadError';
import Badge from '../components/ui/Badge';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { describeTeacherPay } from '../domain/payroll/settings';
import { usePageResource } from '../hooks/usePageResource';
import { formatCurrency, formatDate, getWhatsAppLink } from '../lib/utils';
import { emptyTeacherProfile, loadTeacherProfile } from '../services/queries/teacherProfile';

/** عنصر بيانات مكتوب (اسم الحقل + القيمة) */
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

export default function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useApp();
  const { can } = useAuth();
  const showMoney = can('payroll', 'view');
  const primaryColor = settings?.primaryColor || '#6366f1';
  const query = useCallback(() => loadTeacherProfile(id || ''), [id]);
  const { data, loading, error, reload } = usePageResource(query, emptyTeacherProfile());
  const { teacher, groups, students } = data;
  useEffect(() => {
    if (!loading && !error && data.requestedId === id && !data.teacher) navigate('/teachers');
  }, [loading, error, data, id, navigate]);


  if (error) return <PageReadError title="ملف المدرس" onRetry={reload} />;

  if (loading || data.requestedId !== id) return <Layout title="جاري التحميل..."><div className="p-8 text-center animate-pulse">جاري التحميل...</div></Layout>;
  if (!teacher) return null;

  return (
    <Layout title={`ملف المدرس: ${teacher.name}`}>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header/Back */}
        <button onClick={() => navigate('/teachers')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowRight size={20} /> عودة للمدرسين
        </button>

        {/* Profile Card */}
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm flex flex-col md:flex-row gap-6 items-start md:items-center">
          <div className="w-24 h-24 rounded-2xl bg-indigo-50 text-indigo-600 flex flex-shrink-0 items-center justify-center text-4xl font-bold shadow-inner" style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}>
            {teacher.avatar ? <img src={teacher.avatar} alt="avatar" className="w-full h-full object-cover rounded-2xl" /> : teacher.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{teacher.name}</h1>
              <Badge status={teacher.status} />
            </div>
            <p className="text-gray-500 mb-4">{teacher.specialization}</p>

            {/* البيانات مكتوبة */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 mb-4">
              <InfoItem icon={<Phone size={15} />} label="رقم الهاتف" value={teacher.phone} dir="ltr" />
              <InfoItem icon={<Mail size={15} />} label="البريد الإلكتروني" value={teacher.email} dir="ltr" />
              <InfoItem icon={<BookOpen size={15} />} label="التخصص" value={teacher.specialization} />
              {showMoney && (
                <InfoItem icon={<Wallet size={15} />} label="طريقة حساب المستحقات" value={describeTeacherPay(teacher, settings?.currency)} />
              )}
              <InfoItem icon={<CalendarDays size={15} />} label="تاريخ الانضمام" value={formatDate(teacher.createdAt)} />
              {showMoney && teacher.payNotes && (
                <InfoItem icon={<StickyNote size={15} />} label="ملاحظات المستحقات" value={teacher.payNotes} />
              )}
              {teacher.notes && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <InfoItem icon={<StickyNote size={15} />} label="ملاحظات" value={teacher.notes} />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-medium">
              {showMoney && (
                <button onClick={() => navigate(`/payroll?teacher=${encodeURIComponent(teacher.id)}`)}
                  className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-xl border border-indigo-100 hover:bg-indigo-100">
                  <Wallet size={14} /> كشف المرتبات
                </button>
              )}
              <a href={getWhatsAppLink(teacher.phone)} target="_blank" rel="noreferrer" title={`واتساب ${teacher.phone}`}
                className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 hover:bg-green-50 hover:text-green-600 transition-colors">
                <MessageCircle size={14} /> واتساب
              </a>
              <a href={`tel:${teacher.phone}`}
                className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                <PhoneCall size={14} /> اتصال
              </a>
              {teacher.email && (
                <a href={`mailto:${teacher.email}`}
                  className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                  <Mail size={14} /> إيميل
                </a>
              )}
              <div className="bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">{students.length} طالب</div>
              <div className="bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">{groups.length} مجموعة</div>
            </div>
          </div>
        </div>

        {/* Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Groups */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 overflow-hidden flex flex-col h-full">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><Users2 className="text-indigo-500" /> مجموعات المدرس</h2>
            <div className="overflow-auto flex-1">
              <table className="w-full text-right">
                <thead><tr className="border-b border-gray-100 text-sm text-gray-500"><th className="pb-3 font-semibold">المجموعة</th><th className="pb-3 font-semibold">الكورس</th><th className="pb-3 font-semibold text-center">الطلاب</th></tr></thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {groups.length === 0 ? <tr><td colSpan={3} className="py-4 text-center text-gray-400">لا توجد مجموعات</td></tr> :
                   groups.map(g => (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="py-3 font-medium">{g.name}</td>
                      <td className="py-3 text-gray-600">{g.courseName}</td>
                      <td className="py-3 text-center">{g.studentIds.length}/{g.maxStudents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Students */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 overflow-hidden flex flex-col h-full">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><GraduationCap className="text-indigo-500" /> الطلاب ({students.length})</h2>
            <div className="overflow-auto flex-1 max-h-[400px]">
              <table className="w-full text-right">
                <thead><tr className="border-b border-gray-100 text-sm text-gray-500"><th className="pb-3 font-semibold">اسم الطالب</th><th className="pb-3 font-semibold text-center">المتبقي</th></tr></thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {students.length === 0 ? <tr><td colSpan={2} className="py-4 text-center text-gray-400">لا يوجد طلاب</td></tr> :
                   students.map(s => {
                     const remaining = (s.totalOwed || 0) - s.totalPaid;
                     return (
                      <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/students/${s.id}`)}>
                        <td className="py-3 font-medium text-indigo-600 hover:underline">{s.name}</td>
                        <td className="py-3 text-center">
                          {remaining > 0 ? <span className="text-red-600 font-bold">{formatCurrency(remaining, settings?.currency)}</span> : <span className="text-green-600 font-bold">مسدد</span>}
                        </td>
                      </tr>
                    );
                   })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
