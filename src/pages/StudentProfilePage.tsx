import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, CreditCard, Phone, PhoneCall, ClipboardCheck, GraduationCap } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { dbGetById, dbGetAll, dbGetByIndex, Student, Group, Course, Payment, Attendance, Exam, Grade, Teacher } from '../lib/db';
import { formatDate, formatCurrency, getWhatsAppLink } from '../lib/utils';
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
  const [examResults, setExamResults] = useState<(Grade & { examName: string; maxGrade: number; examDate: string })[]>([]);
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

      const studentPayments = await dbGetByIndex<Payment>('payments', 'by-studentId', id);
      setPayments(studentPayments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

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

  if (loading) return <Layout title="جاري التحميل..."><div className="p-8 text-center animate-pulse">جاري التحميل...</div></Layout>;
  if (!student) return null;

  const remaining = (student.totalOwed || 0) - student.totalPaid;

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
    </Layout>
  );
}
