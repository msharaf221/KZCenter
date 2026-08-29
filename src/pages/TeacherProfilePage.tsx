import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users2, ArrowRight, GraduationCap } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { dbGetById, dbGetAll, getGroupStudents, Teacher, Group, Student, Course } from '../lib/db';
import { useApp } from '../contexts/AppContext';

export default function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useApp();
  const primaryColor = settings?.primaryColor || '#6366f1';

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [groups, setGroups] = useState<(Group & { courseName: string })[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const t = await dbGetById<Teacher>('teachers', id);
      if (!t) { navigate('/teachers'); return; }
      setTeacher(t);

      const allGroups = await dbGetAll<Group>('groups');
      const teacherGroups = allGroups.filter(g => g.teacherId === id && !g.deleted);
      
      const courses = await dbGetAll<Course>('courses');
      const enrichedGroups = teacherGroups.map(g => ({
        ...g,
        courseName: courses.find(c => c.id === g.courseId)?.name || 'غير معروف'
      }));
      setGroups(enrichedGroups);

      // Get enrolled students from enrollments table (source of truth)
      const teacherStudents: Student[] = [];
      for (const g of teacherGroups) {
        const groupStudents = await getGroupStudents(g.id);
        for (const s of groupStudents) {
          if (!teacherStudents.some(ts => ts.id === s.id)) {
            teacherStudents.push(s);
          }
        }
      }
      setStudents(teacherStudents);

    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <Layout title="جاري التحميل..."><div className="p-8 text-center animate-pulse">جاري التحميل...</div></Layout>;
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
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{teacher.name}</h1>
            <p className="text-gray-500 mb-4">{teacher.specialization}</p>
            <div className="flex flex-wrap gap-4 text-sm font-medium">
              <div className="bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">{teacher.phone}</div>
              <div className="bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">{students.length} طالب</div>
              <div className="bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">{groups.length} مجموعة</div>
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
                          {remaining > 0 ? <span className="text-red-600 font-bold">{remaining} {settings?.currency}</span> : <span className="text-green-600 font-bold">مسدد</span>}
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
