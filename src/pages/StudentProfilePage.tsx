import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowRight, BookOpen, CreditCard, ClipboardCheck, Phone, PhoneCall } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { dbGetById, dbGetAll, Student, Group, Course, Payment, Attendance, Teacher } from '../lib/db';
import { formatCurrency, formatDate, getWhatsAppLink } from '../lib/utils';
import { useApp } from '../contexts/AppContext';

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useApp();
  const primaryColor = settings?.primaryColor || '#6366f1';

  const [student, setStudent] = useState<Student | null>(null);
  const [groups, setGroups] = useState<(Group & { courseName: string, teacherName: string })[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

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

      const allPayments = await dbGetAll<Payment>('payments');
      setPayments(allPayments.filter(p => p.studentId === id && !p.deleted).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

      const allAttendance = await dbGetAll<Attendance>('attendance');
      setAttendance(allAttendance.filter(a => a.studentId === id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <Layout title="جاري التحميل..."><div className="p-8 text-center animate-pulse">جاري التحميل...</div></Layout>;
  if (!student) return null;

  const remaining = (student.totalOwed || 0) - student.totalPaid;

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
              <a href={getWhatsAppLink(student.phone)} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                <Phone size={16} /> هاتف الطالب
              </a>
              <a href={getWhatsAppLink(student.parentPhone)} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100 hover:bg-green-50 hover:text-green-600 transition-colors">
                <PhoneCall size={16} /> ولي الأمر
              </a>
              <div className="bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">{groups.length} مجموعة</div>
              <div className={`px-4 py-2 rounded-xl font-bold border ${remaining > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                {remaining > 0 ? `المتبقي: ${remaining} ${settings?.currency}` : 'خالص الديون'}
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
                      <td className="py-3 font-bold text-green-600">{p.amount} {settings?.currency}</td>
                      <td className="py-3 text-gray-600">{p.type === 'subscription' ? 'اشتراك' : p.type === 'books' ? 'كتب' : 'أخرى'}</td>
                      <td className="py-3 text-center">{formatDate(p.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
