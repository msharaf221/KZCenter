import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Edit2, Trash2, Eye, Download, Upload, CheckSquare, Square, BookOpen, Users } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import { dbGetPaginated, dbGetAll, dbPut, dbSoftDelete, dbAdd, recalculateStudentTotalPaid, enrollStudent, unenrollStudent, generateId, Student, Group, Course, Gender, StudentStatus } from '../lib/db';
import { toCSV, downloadCSV, parseCSV, formatDate } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify, notifyNewStudent } from '../lib/notifications';
import { useDebounce } from '../hooks';
import { addAuditEntry } from '../lib/security';

const PAGE_SIZE = 24;

const INITIAL_FORM: Omit<Student, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '', age: 10, gender: 'male', phone: '', parentPhone: '',
  avatar: '', notes: '', status: 'active', totalPaid: 0, enrolledGroups: [],
};

export default function StudentsPage() {
  const navigate = useNavigate();
  const { settings } = useApp();
  const { isAdmin } = useAuth();
  const canEdit = isAdmin(); // المدرس: عرض فقط
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form, setForm] = useState<Omit<Student, 'id' | 'createdAt' | 'updatedAt'>>(INITIAL_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [initialPayments, setInitialPayments] = useState<Record<string, number>>({});

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const allGroups = await dbGetAll<Group>('groups');
      const allCourses = await dbGetAll<Course>('courses');
      setGroups(allGroups);
      setCourses(allCourses);

      const result = await dbGetPaginated<Student>('students', page, PAGE_SIZE, (s: Student) => {
        const q = debouncedSearch.toLowerCase();
        const matchSearch = !q || s.name.toLowerCase().includes(q) || s.parentPhone.includes(q);
        const matchStatus = !statusFilter || s.status === statusFilter;
        const matchGroup = !groupFilter || s.enrolledGroups?.includes(groupFilter);
        
        let matchCourse = true;
        if (courseFilter) {
          const studentGroups = allGroups.filter(g => s.enrolledGroups?.includes(g.id));
          matchCourse = studentGroups.some(g => g.courseId === courseFilter);
        }

        return matchSearch && matchStatus && matchGroup && matchCourse;
      });
      setStudents(result.items);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, groupFilter, courseFilter]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, groupFilter, courseFilter]);

  function openAdd() {
    setEditingStudent(null);
    setForm(INITIAL_FORM);
    setInitialPayments({});
    setShowModal(true);
  }

  function openEdit(student: Student) {
    setEditingStudent(student);
    setInitialPayments({});
    setForm({
      name: student.name, age: student.age, gender: student.gender,
      phone: student.phone || '', parentPhone: student.parentPhone,
      avatar: student.avatar || '', notes: student.notes || '',
      status: student.status, totalPaid: student.totalPaid,
      enrolledGroups: student.enrolledGroups,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!canEdit) { notify.error('ليس لديك صلاحية التعديل'); return; }
    if (!form.name.trim()) { notify.error('الاسم مطلوب'); return; }
    if (!form.parentPhone.trim()) { notify.error('هاتف ولي الأمر مطلوب'); return; }
    if (form.age < 3 || form.age > 18) { notify.error('العمر يجب أن يكون بين 3 و 18 سنة'); return; }

    // فحص المجموعات الجديدة (السعة والحالة) قبل أي حفظ - نفس منطق صفحة المجموعات
    const oldGroups = editingStudent?.enrolledGroups || [];
    const newGroups = form.enrolledGroups || [];
    const removedGroups = oldGroups.filter(g => !newGroups.includes(g));
    const addedGroups = newGroups.filter(g => !oldGroups.includes(g));

    for (const groupId of addedGroups) {
      const g = groups.find(g => g.id === groupId);
      if (!g) continue;
      if (g.status === 'ended') {
        notify.error(`المجموعة "${g.name}" منتهية - لا يمكن التسجيل فيها`);
        return;
      }
      if (g.studentIds.length >= g.maxStudents) {
        notify.error(`المجموعة "${g.name}" مكتملة (${g.studentIds.length}/${g.maxStudents})`);
        return;
      }
    }

    try {
      const studentId = editingStudent?.id || generateId();
      
      const newStudentData = {
        id: studentId,
        ...form,
        updatedAt: new Date().toISOString(),
      };

      if (editingStudent) {
        await dbPut('students', { ...editingStudent, ...newStudentData });
        notify.success('تم تحديث بيانات الطالب');
        addAuditEntry({
          userId: 'current',
          username: 'current',
          action: 'update',
          entity: 'student',
          entityId: studentId,
          details: `تعديل بيانات الطالب: ${form.name}`,
        });
      } else {
        await dbAdd('students', { ...newStudentData, createdAt: new Date().toISOString() });
        notifyNewStudent(form.name);
        addAuditEntry({
          userId: 'current',
          username: 'current',
          action: 'create',
          entity: 'student',
          entityId: studentId,
          details: `إضافة طالب جديد: ${form.name}`,
        });
      }

      for (const groupId of removedGroups) {
        try {
          await unenrollStudent(studentId, groupId, 'تعديل بيانات الطالب');
        } catch (e) {
          console.error(`Failed to unenroll ${studentId} from ${groupId}:`, e);
        }
      }
      for (const groupId of addedGroups) {
        const paidAmount = initialPayments[groupId] || 0;
        try {
          const result = await enrollStudent(studentId, groupId, paidAmount > 0 ? paidAmount : undefined);
          if (!result.success) {
            console.error(`Failed to enroll ${studentId} in ${groupId}:`, result.error);
          }
        } catch (e) {
          console.error(`Failed to enroll ${studentId} in ${groupId}:`, e);
        }
      }

      // إعادة حساب المدفوع والمستحق دائماً بعد أي تغيير في المجموعات
      if (addedGroups.length > 0 || removedGroups.length > 0) {
        await recalculateStudentTotalPaid(studentId);
      }

      setShowModal(false);
      loadStudents();
    } catch {
      notify.error('حدث خطأ أثناء الحفظ');
    }
  }

  async function handleDelete(id: string) {
    if (!canEdit) { notify.error('ليس لديك صلاحية الحذف'); return; }
    try {
      const student = students.find(s => s.id === id);
      if (student && student.enrolledGroups) {
        for (const groupId of student.enrolledGroups) {
          try {
            await unenrollStudent(id, groupId, 'حذف الطالب');
          } catch (e) {
            console.error(`Failed to unenroll ${id} from ${groupId}:`, e);
          }
        }
      }
      await dbSoftDelete('students', id);
      notify.success('تم حذف الطالب');
      loadStudents();
    } catch {
      notify.error('حدث خطأ أثناء الحذف');
    }
  }

  async function handleBulkDelete() {
    if (!canEdit) { notify.error('ليس لديك صلاحية الحذف'); return; }
    try {
      for (const id of selectedIds) {
        const student = students.find(s => s.id === id);
        if (student && student.enrolledGroups) {
          for (const groupId of student.enrolledGroups) {
            try {
              await unenrollStudent(id, groupId, 'حذف جماعي');
            } catch (e) {
              console.error(`Failed to unenroll ${id} from ${groupId}:`, e);
            }
          }
        }
        await dbSoftDelete('students', id);
      }
      notify.success(`تم حذف ${selectedIds.length} طالب`);
      setSelectedIds([]);
      loadStudents();
    } catch {
      notify.error('حدث خطأ أثناء الحذف الجماعي');
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  function toggleSelectAll() {
    if (selectedIds.length === students.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(students.map(s => s.id));
    }
  }

  function exportCSV() {
    const csv = toCSV(students as unknown as Record<string, unknown>[], [
      { key: 'name', label: 'الاسم' },
      { key: 'age', label: 'العمر' },
      { key: 'gender', label: 'الجنس' },
      { key: 'phone', label: 'هاتف الطالب' },
      { key: 'parentPhone', label: 'هاتف ولي الأمر' },
      { key: 'status', label: 'الحالة' },
      { key: 'totalPaid', label: 'إجمالي المدفوع' },
      { key: 'totalOwed', label: 'إجمالي المستحق' },
      { key: 'notes', label: 'ملاحظات' },
      { key: 'createdAt', label: 'تاريخ التسجيل' },
    ]);
    downloadCSV(csv, 'students.csv');
    notify.success('تم تصدير بيانات الطلاب');
  }

  function downloadTemplate() {
    const csv = '"الاسم","العمر","الجنس (male/female)","هاتف الطالب","هاتف ولي الأمر","الحالة (active/suspended/ended)","ملاحظات"\n"أحمد محمد","12","male","01012345678","01098765432","active",""\n';
    downloadCSV(csv, 'students_template.csv');
    notify.success('تم تحميل نموذج الاستيراد');
  }

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    if (!canEdit) { notify.error('ليس لديك صلاحية الاستيراد'); return; }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) { notify.error('الملف فارغ أو غير صالح'); return; }

      const headers = rows[0];
      const dataRows = rows.slice(1);

      let imported = 0;
      let errors = 0;

      for (const row of dataRows) {
        if (row.every(cell => !cell.trim())) continue;
        try {
          const name = row[headers.indexOf(headers.find(h => h.includes('الاسم')) || '')] || row[0];
          const age = parseInt(row[1]) || 12;
          const gender = (row[2] as Gender) || 'male';
          const phone = row[3] || '';
          const parentPhone = row[4] || '';
          const status = (row[5] as StudentStatus) || 'active';
          const notes = row[6] || '';

          if (!name.trim() || !parentPhone.trim()) { errors++; continue; }

          const student: Student = {
            id: generateId(), name: name.trim(), age, gender,
            phone, parentPhone: parentPhone.trim(), status, notes,
            totalPaid: 0, enrolledGroups: [],
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          };
          await dbAdd('students', student);
          imported++;
        } catch { errors++; }
      }

      notify.success(`تم استيراد ${imported} طالب${errors > 0 ? ` (${errors} خطأ)` : ''}`);
      loadStudents();
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Layout title="إدارة الطلاب">
      <div className="space-y-5">
        {/* Toolbar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex-1 min-w-48 relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو هاتف ولي الأمر..."
                className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <Filter size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">كل الحالات</option>
                <option value="active">نشط</option>
                <option value="suspended">متوقف</option>
                <option value="ended">منتهي</option>
              </select>
            </div>

            {/* Course Filter */}
            <div className="relative">
              <BookOpen size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={courseFilter}
                onChange={e => { setCourseFilter(e.target.value); setGroupFilter(''); }}
                className="pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white max-w-[150px] truncate"
              >
                <option value="">كل الكورسات</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Group Filter */}
            <div className="relative">
              <Users size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={groupFilter}
                onChange={e => setGroupFilter(e.target.value)}
                className="pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white max-w-[150px] truncate"
              >
                <option value="">كل المجموعات</option>
                {groups.filter(g => !courseFilter || g.courseId === courseFilter).map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            {/* Bulk delete */}
            {canEdit && selectedIds.length > 0 && (
              <button
                onClick={() => setShowBulkDelete(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
              >
                <Trash2 size={16} />
                حذف ({selectedIds.length})
              </button>
            )}

            <div className="flex gap-2 mr-auto">
              {canEdit && (
                <>
                  <button onClick={downloadTemplate} className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <Download size={16} />
                    <span className="hidden sm:inline">نموذج CSV</span>
                  </button>

                  <label className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
                    <Upload size={16} />
                    <span className="hidden sm:inline">استيراد CSV</span>
                    <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
                  </label>
                </>
              )}

              <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <Download size={16} />
                <span className="hidden sm:inline">تصدير</span>
              </button>

              {canEdit && (
                <button
                  onClick={openAdd}
                  className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium transition-colors"
                  style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}
                >
                  <Plus size={16} />
                  إضافة طالب
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-right">
                    <button onClick={toggleSelectAll}>
                      {selectedIds.length === students.length && students.length > 0
                        ? <CheckSquare size={16} className="text-indigo-600" />
                        : <Square size={16} className="text-gray-400" />
                      }
                    </button>
                  </th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">#</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الطالب</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">العمر</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">هاتف ولي الأمر</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الحالة</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">المدفوع</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">المتبقي</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">تاريخ التسجيل</th>
                  <th className="p-4 text-center text-xs font-semibold text-gray-600 uppercase">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={10} className="p-8 text-center">
                    <div className="animate-spin w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto" />
                  </td></tr>
                ) : students.length === 0 ? (
                  <tr><td colSpan={10} className="p-8 text-center text-gray-400">لا يوجد طلاب</td></tr>
                ) : students.map((student, idx) => (
                  <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <button onClick={() => toggleSelect(student.id)}>
                        {selectedIds.includes(student.id)
                          ? <CheckSquare size={16} className="text-indigo-600" />
                          : <Square size={16} className="text-gray-400" />
                        }
                      </button>
                    </td>
                    <td className="p-4 text-sm text-gray-500">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-base">
                          {student.gender === 'male' ? '👦' : '👧'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{student.name}</p>
                          {student.phone && <p className="text-xs text-gray-500">{student.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-gray-700">{student.age} سنة</td>
                    <td className="p-4 text-sm text-gray-700">{student.parentPhone}</td>
                    <td className="p-4"><Badge status={student.status} /></td>
                    <td className="p-4 text-sm font-medium text-gray-900">
                      {student.totalPaid.toLocaleString()} {settings?.currency}
                    </td>
                    <td className="p-4 text-sm">
                      {(() => {
                        const remaining = (student.totalOwed || 0) - student.totalPaid;
                        if (remaining > 0) return <span className="font-bold text-red-600">{remaining.toLocaleString()} {settings?.currency}</span>;
                        if (remaining < 0) return <span className="font-bold text-blue-600">فائض {Math.abs(remaining).toLocaleString()}</span>;
                        return <span className="font-bold text-green-600">مسدد</span>;
                      })()}
                    </td>
                    <td className="p-4 text-sm text-gray-500">{formatDate(student.createdAt)}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => navigate(`/students/${student.id}`)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600 transition-colors" title="عرض">
                          <Eye size={15} />
                        </button>
                        {canEdit && (
                          <>
                            <button onClick={() => openEdit(student)} className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600 transition-colors" title="تعديل">
                              <Edit2 size={15} />
                            </button>
                            <button onClick={() => setDeleteId(student.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors" title="حذف">
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={total}
            pageSize={PAGE_SIZE}
          />
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingStudent ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">الاسم الكامل *</label>
            <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="أدخل اسم الطالب" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">العمر *</label>
            <input type="number" min={3} max={18} value={form.age} onChange={e => setForm({...form, age: +e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الجنس *</label>
            <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value as Gender})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">هاتف الطالب</label>
            <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="اختياري" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">هاتف ولي الأمر *</label>
            <input type="tel" value={form.parentPhone} onChange={e => setForm({...form, parentPhone: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="إلزامي" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الحالة</label>
            <select value={form.status} onChange={e => setForm({...form, status: e.target.value as StudentStatus})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="active">نشط</option>
              <option value="suspended">متوقف</option>
              <option value="ended">منتهي</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">المجموعات المسجل بها</label>
            <div className="border border-gray-200 rounded-xl max-h-40 overflow-y-auto p-2 bg-white space-y-1">
              {groups.map(g => (
                <div key={g.id} className="flex flex-col gap-2 p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.enrolledGroups.includes(g.id)}
                      onChange={e => {
                        const checked = e.target.checked;
                        const newEnrolled = checked 
                          ? [...form.enrolledGroups, g.id]
                          : form.enrolledGroups.filter(id => id !== g.id);
                        setForm({...form, enrolledGroups: newEnrolled});
                        if (!checked) {
                          const newPayments = { ...initialPayments };
                          delete newPayments[g.id];
                          setInitialPayments(newPayments);
                        }
                      }}
                      className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                    <span className="text-sm font-medium">{g.name}</span>
                    <span className="text-xs text-gray-400">({g.studentIds.length}/{g.maxStudents})</span>
                  </label>
                  {form.enrolledGroups.includes(g.id) && (!editingStudent || !editingStudent.enrolledGroups?.includes(g.id)) && (
                    <div className="pl-6">
                      <input type="number" placeholder="المبلغ المدفوع (اختياري)" min="0"
                        value={initialPayments[g.id] || ''}
                        onChange={e => setInitialPayments({...initialPayments, [g.id]: +e.target.value})}
                        className="w-full sm:w-1/2 px-3 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
                    </div>
                  )}
                </div>
              ))}
              {groups.length === 0 && <p className="text-sm text-gray-500 text-center py-2">لا توجد مجموعات متاحة</p>}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
              rows={3} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="أي ملاحظات إضافية..." />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleSave}
            className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm transition-colors"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>
            {editingStudent ? 'تحديث' : 'إضافة'}
          </button>
          <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
            إلغاء
          </button>
        </div>
      </Modal>

      {/* End Modals */}

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        title="حذف الطالب"
        message="هل أنت متأكد من حذف هذا الطالب؟ سيتم حذفه بشكل مؤقت."
        onConfirm={() => { if (deleteId) handleDelete(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
        danger
      />

      {/* Bulk Delete Confirm */}
      <ConfirmDialog
        isOpen={showBulkDelete}
        title="حذف جماعي"
        message={`هل أنت متأكد من حذف ${selectedIds.length} طالب؟`}
        onConfirm={() => { handleBulkDelete(); setShowBulkDelete(false); }}
        onCancel={() => setShowBulkDelete(false)}
        danger
      />
    </Layout>
  );
}
