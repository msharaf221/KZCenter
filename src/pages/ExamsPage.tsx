import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, ClipboardList } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { dbGetAll, dbPut, dbSoftDelete, dbAdd, dbGetByIndex, generateId, Exam, Grade, Group, Course, Student } from '../lib/db';
import { formatDate } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { notify } from '../lib/notifications';
import dayjs from 'dayjs';

export default function ExamsPage() {
  const { settings } = useApp();
  const [exams, setExams] = useState<Exam[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showGradesModal, setShowGradesModal] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [grades, setGrades] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Exam | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', groupId: '', date: dayjs().format('YYYY-MM-DD'), maxGrade: 100,
  });

  const load = useCallback(async () => {
    const [e, g, c, s] = await Promise.all([
      dbGetAll<Exam>('exams'),
      dbGetAll<Group>('groups'),
      dbGetAll<Course>('courses'),
      dbGetAll<Student>('students'),
    ]);
    setExams(e);
    setGroups(g);
    setCourses(c);
    setStudents(s);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openGrades(exam: Exam) {
    setSelectedExam(exam);
    const existingGrades = await dbGetByIndex<Grade>('grades', 'by-examId', exam.id);
    const map: Record<string, number> = {};
    existingGrades.forEach(g => { map[g.studentId] = g.grade; });
    setGrades(map);
    setShowGradesModal(true);
  }

  async function handleSaveGrades() {
    if (!selectedExam) return;
    try {
      const existingGrades = await dbGetByIndex<Grade>('grades', 'by-examId', selectedExam.id);
      const group = groups.find(g => g.id === selectedExam.groupId);
      const groupStudents = students.filter(s => group?.studentIds.includes(s.id));

      for (const student of groupStudents) {
        const grade = grades[student.id];
        if (grade === undefined || grade === null) continue;
        const existing = existingGrades.find(g => g.studentId === student.id);
        if (existing) {
          await dbPut('grades', { ...existing, grade, updatedAt: new Date().toISOString() });
        } else {
          await dbAdd('grades', {
            id: generateId(), examId: selectedExam.id, studentId: student.id,
            grade, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          });
        }
      }
      notify.success('تم حفظ الدرجات');
      setShowGradesModal(false);
    } catch { notify.error('حدث خطأ'); }
  }

  async function handleSave() {
    if (!form.name.trim()) { notify.error('اسم الاختبار مطلوب'); return; }
    if (!form.groupId) { notify.error('اختر مجموعة'); return; }
    try {
      if (editing) {
        await dbPut('exams', { ...editing, ...form, updatedAt: new Date().toISOString() });
        notify.success('تم تحديث الاختبار');
      } else {
        await dbAdd('exams', { id: generateId(), ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        notify.success('تم إضافة الاختبار');
      }
      setShowModal(false);
      load();
    } catch { notify.error('حدث خطأ'); }
  }

  const selectedGroup = selectedExam ? groups.find(g => g.id === selectedExam.groupId) : null;
  const examGroupStudents = selectedGroup ? students.filter(s => selectedGroup.studentIds.includes(s.id)) : [];

  return (
    <Layout title="الاختبارات والدرجات">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button onClick={() => { setEditing(null); setForm({ name: '', groupId: groups[0]?.id || '', date: dayjs().format('YYYY-MM-DD'), maxGrade: 100 }); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>
            <Plus size={16} /> إضافة اختبار
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {exams.map(exam => {
            const group = groups.find(g => g.id === exam.groupId);
            const course = group ? courses.find(c => c.id === group.courseId) : null;
            return (
              <div key={exam.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900">{exam.name}</h3>
                    <p className="text-xs text-gray-500">{group?.name} • {course?.name}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(exam); setForm({ name: exam.name, groupId: exam.groupId, date: exam.date, maxGrade: exam.maxGrade }); setShowModal(true); }}
                      className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600"><Edit2 size={14} /></button>
                    <button onClick={() => setDeleteId(exam.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-gray-500">{formatDate(exam.date)}</span>
                  <span className="font-medium text-indigo-600">الدرجة العظمى: {exam.maxGrade}</span>
                </div>
                <button onClick={() => openGrades(exam)}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-colors">
                  <ClipboardList size={16} /> إدخال الدرجات
                </button>
              </div>
            );
          })}
          {exams.length === 0 && (
            <div className="col-span-3 text-center py-12 text-gray-400">لا توجد اختبارات</div>
          )}
        </div>
      </div>

      {/* Exam Form Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'تعديل الاختبار' : 'إضافة اختبار'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">اسم الاختبار *</label>
            <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="مثال: الاختبار النصفي" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">المجموعة *</label>
            <select value={form.groupId} onChange={e => setForm({...form, groupId: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
              <option value="">اختر مجموعة</option>
              {groups.map(g => {
                const c = courses.find(c => c.id === g.courseId);
                return <option key={g.id} value={g.id}>{g.name} - {c?.name}</option>;
              })}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">التاريخ</label>
              <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الدرجة العظمى</label>
              <input type="number" value={form.maxGrade} onChange={e => setForm({...form, maxGrade: +e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" min="1" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>
            {editing ? 'تحديث' : 'إضافة'}
          </button>
          <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">إلغاء</button>
        </div>
      </Modal>

      {/* Grades Modal */}
      {selectedExam && (
        <Modal isOpen={showGradesModal} onClose={() => setShowGradesModal(false)} title={`درجات: ${selectedExam.name}`} size="md">
          <div className="space-y-3">
            <p className="text-sm text-gray-500">الدرجة العظمى: <strong>{selectedExam.maxGrade}</strong></p>
            {examGroupStudents.length === 0 ? (
              <p className="text-center text-gray-400 py-6">لا يوجد طلاب</p>
            ) : examGroupStudents.map(student => (
              <div key={student.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm font-medium text-gray-900">{student.name}</span>
                <input type="number"
                  value={grades[student.id] ?? ''}
                  onChange={e => setGrades({...grades, [student.id]: +e.target.value})}
                  min={0} max={selectedExam.maxGrade}
                  placeholder={`0 - ${selectedExam.maxGrade}`}
                  className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={handleSaveGrades} className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm"
              style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>حفظ الدرجات</button>
            <button onClick={() => setShowGradesModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">إلغاء</button>
          </div>
        </Modal>
      )}

      <ConfirmDialog isOpen={!!deleteId} title="حذف الاختبار" message="هل أنت متأكد؟"
        onConfirm={async () => { if (deleteId) { await dbSoftDelete('exams', deleteId); notify.success('تم الحذف'); load(); } setDeleteId(null); }}
        onCancel={() => setDeleteId(null)} danger />
    </Layout>
  );
}
