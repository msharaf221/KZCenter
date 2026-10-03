import { useState, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Search,
  Check,
  AlertCircle,
  X,
  Palette,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { getAllSubjects, getSubjectCategories, type Subject, type SubjectId } from '../../lib/subjects';
import { saveSubject, removeSubject } from '../../services/subjectService';
import { notify } from '../../lib/notifications';
import Modal from '../ui/Modal';
import type { Course } from '../../domain/models';

interface SubjectsManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses?: Course[];
  initialMode?: 'list' | 'add';
  onSubjectCreated?: (subjectId: SubjectId) => void;
}

const PRESET_ICONS = ['📚', '🔬', '🧪', '🌍', '📖', '🕌', '🧮', '🔢', '🎨', '💻', '⚽', '✍️', '🏛️', '🎵', '🔭', '📐', '📝', '⚡'];
const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#0ea5e9', // Sky
  '#14b8a6', // Teal
  '#22c55e', // Green
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f97316', // Orange
  '#ef4444', // Red
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#64748b', // Slate
];

export default function SubjectsManagementModal({
  isOpen,
  onClose,
  courses = [],
  initialMode = 'list',
  onSubjectCreated,
}: SubjectsManagementModalProps) {
  const { settings, updateSettings } = useApp();
  const [mode, setMode] = useState<'list' | 'form'>(initialMode === 'add' ? 'form' : 'list');
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState<Subject | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formCategory, setFormCategory] = useState('عام');
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [formPrice, setFormPrice] = useState<number | ''>(200);
  const [formIcon, setFormIcon] = useState('📚');
  const [formColor, setFormColor] = useState('#6366f1');
  const [formDescription, setFormDescription] = useState('');

  const allSubjects = useMemo(() => {
    return getAllSubjects(settings?.customSubjects);
  }, [settings?.customSubjects]);

  const categories = useMemo(() => {
    const cats = getSubjectCategories(settings?.customSubjects);
    if (!cats.includes('عام')) cats.unshift('عام');
    return cats;
  }, [settings?.customSubjects]);

  const filteredSubjects = useMemo(() => {
    if (!searchTerm.trim()) return allSubjects;
    const term = searchTerm.trim().toLowerCase();
    return allSubjects.filter(
      s =>
        s.name.toLowerCase().includes(term) ||
        s.nameEn.toLowerCase().includes(term) ||
        s.category.toLowerCase().includes(term)
    );
  }, [allSubjects, searchTerm]);

  const getCourseCountForSubject = (subjectId: SubjectId) => {
    return courses.filter(c => c.subjectId === subjectId).length;
  };

  const handleOpenAdd = () => {
    setEditingSubject(null);
    setFormName('');
    setFormNameEn('');
    setFormCategory('عام');
    setCustomCategoryInput('');
    setFormPrice(200);
    setFormIcon('📚');
    setFormColor('#6366f1');
    setFormDescription('');
    setMode('form');
  };

  const handleOpenEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setFormName(subject.name);
    setFormNameEn(subject.nameEn || '');
    setFormCategory(subject.category || 'عام');
    setCustomCategoryInput('');
    setFormPrice(subject.monthlyPrice || 0);
    setFormIcon(subject.icon || '📚');
    setFormColor(subject.color || '#6366f1');
    setFormDescription(subject.description || '');
    setMode('form');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      notify.error('يرجى إدخال اسم المادة');
      return;
    }

    try {
      setSaving(true);
      const chosenCategory = customCategoryInput.trim() || formCategory || 'عام';
      const updatedList = saveSubject(
        {
          id: editingSubject?.id,
          name: formName.trim(),
          nameEn: formNameEn.trim(),
          category: chosenCategory,
          monthlyPrice: formPrice === '' ? 0 : Number(formPrice),
          icon: formIcon,
          color: formColor,
          description: formDescription.trim(),
        },
        settings?.customSubjects || []
      );

      await updateSettings({ customSubjects: updatedList });
      notify.success(editingSubject ? 'تم تحديث المادة بنجاح' : 'تم إضافة المادة الجديدة بنجاح');

      const savedSubject = editingSubject || updatedList[updatedList.length - 1];
      if (onSubjectCreated && savedSubject) {
        onSubjectCreated(savedSubject.id);
      }

      setMode('list');
      setEditingSubject(null);
    } catch (err) {
      notify.error(`حدث خطأ أثناء حفظ المادة: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;
    try {
      setSaving(true);
      const updatedList = removeSubject(deleteCandidate.id, settings?.customSubjects || []);
      await updateSettings({ customSubjects: updatedList });
      notify.success(`تم حذف مادة «${deleteCandidate.name}» من القائمة`);
      setDeleteCandidate(null);
    } catch (err) {
      notify.error(`تعذّر حذف المادة: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`إدارة المواد الدراسية (${allSubjects.length})`}
      size="lg"
    >
      <div className="space-y-4">
        {/* Navigation tabs / toggle */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('list')}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                mode === 'list'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              قائمة المواد ({allSubjects.length})
            </button>
            <button
              onClick={handleOpenAdd}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                mode === 'form' && !editingSubject
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
              }`}
            >
              <Plus size={16} />
              <span>إضافة مادة جديدة</span>
            </button>
          </div>

          {mode === 'list' && (
            <div className="relative w-48 sm:w-64">
              <Search size={16} className="absolute right-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="بحث في المواد..."
                className="w-full pl-3 pr-9 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>

        {/* View Mode: List */}
        {mode === 'list' && (
          <div className="space-y-3">
            {filteredSubjects.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <BookOpen className="mx-auto text-gray-300 mb-2" size={36} />
                <p className="text-sm font-medium text-gray-600">لا توجد مواد مطابقة للبحث</p>
                <button
                  onClick={handleOpenAdd}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                >
                  <Plus size={14} /> إضافة مادة جديدة الآن
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
                {filteredSubjects.map(subject => {
                  const courseCount = getCourseCountForSubject(subject.id);
                  return (
                    <div
                      key={subject.id}
                      className="flex items-center justify-between p-3.5 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 shadow-sm"
                          style={{ backgroundColor: `${subject.color}15`, color: subject.color }}
                        >
                          {subject.icon || '📚'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-gray-900 text-sm truncate">
                              {subject.name}
                            </span>
                            {subject.nameEn && (
                              <span className="text-[11px] text-gray-400 font-mono">
                                ({subject.nameEn})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                            <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                              {subject.category || 'عام'}
                            </span>
                            {courseCount > 0 ? (
                              <span className="text-indigo-600 font-medium">
                                {courseCount} {courseCount === 1 ? 'كورس' : 'كورسات'}
                              </span>
                            ) : (
                              <span className="text-gray-400">غير مستخدمة</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 mr-2">
                        <button
                          onClick={() => handleOpenEdit(subject)}
                          className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="تعديل المادة"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteCandidate(subject)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="حذف المادة"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* View Mode: Add / Edit Form */}
        {mode === 'form' && (
          <form onSubmit={handleSave} className="space-y-4 bg-gray-50/70 p-4 rounded-2xl border border-gray-200">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-600" />
                {editingSubject ? `تعديل مادة «${editingSubject.name}»` : 'إضافة مادة دراسية جديدة'}
              </h4>
              <button
                type="button"
                onClick={() => setMode('list')}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  اسم المادة بالعربي *
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: كيمياء، أحياء، لغة فرنسية..."
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  الاسم بالإنجليزية / كود مختصر (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="مثال: Chemistry, French..."
                  value={formNameEn}
                  onChange={e => setFormNameEn(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  التصنيف
                </label>
                <div className="flex gap-2">
                  <select
                    value={formCategory}
                    onChange={e => {
                      setFormCategory(e.target.value);
                      if (e.target.value !== '__new__') setCustomCategoryInput('');
                    }}
                    className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__new__">+ تصنيف جديد...</option>
                  </select>
                </div>
                {formCategory === '__new__' && (
                  <input
                    type="text"
                    required
                    placeholder="اكتب اسم التصنيف الجديد..."
                    value={customCategoryInput}
                    onChange={e => setCustomCategoryInput(e.target.value)}
                    className="w-full mt-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  السعر الافتراضي المقترح (ج.م)
                </label>
                <input
                  type="number"
                  min={0}
                  value={formPrice}
                  onChange={e => setFormPrice(e.target.value === '' ? '' : +e.target.value)}
                  placeholder="200"
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Icon selector */}
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                  <Palette size={14} /> اختر أيقونة المادة
                </label>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-xl shadow-sm">
                    {formIcon}
                  </div>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {PRESET_ICONS.map(ico => (
                      <button
                        key={ico}
                        type="button"
                        onClick={() => setFormIcon(ico)}
                        className={`w-8 h-8 rounded-lg text-sm flex items-center justify-center transition-transform hover:scale-110 ${
                          formIcon === ico
                            ? 'bg-indigo-100 ring-2 ring-indigo-500'
                            : 'bg-white border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {ico}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Color selector */}
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                  <Layers size={14} /> اختر لون المادة
                </label>
                <div className="flex flex-wrap gap-2 items-center">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-white shadow-sm shrink-0"
                    style={{ backgroundColor: formColor }}
                  />
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map(clr => (
                      <button
                        key={clr}
                        type="button"
                        onClick={() => setFormColor(clr)}
                        className={`w-7 h-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center ${
                          formColor === clr ? 'ring-2 ring-offset-2 ring-indigo-600 scale-105' : ''
                        }`}
                        style={{ backgroundColor: clr }}
                      >
                        {formColor === clr && <Check size={14} className="text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  وصف مختصر للمادة (اختياري)
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="وصف إضافي للمنهج أو المادة الدراسية..."
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setMode('list')}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
              >
                {saving ? 'جاري الحفظ...' : editingSubject ? 'حفظ التعديلات' : 'إضافة المادة'}
              </button>
            </div>
          </form>
        )}

        {/* Delete Confirmation Modal */}
        {deleteCandidate && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
              <div className="text-sm">
                <p className="font-bold text-red-900">
                  هل تريد بالتأكيد إزالة مادة «{deleteCandidate.name}»؟
                </p>
                {getCourseCountForSubject(deleteCandidate.id) > 0 ? (
                  <p className="text-red-700 text-xs mt-1">
                    ⚠️ تنبيه: هذه المادة مرتبطة حالياً بـ{' '}
                    <strong>{getCourseCountForSubject(deleteCandidate.id)} كورس</strong>. إزالتها
                    لن تحذف الكورسات، ولكن ستظهر بدون مادة مصنفة.
                  </p>
                ) : (
                  <p className="text-red-600 text-xs mt-1">
                    لن يؤثر هذا الإجراء على أي كورسات أو سجلات سابقة.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-red-200">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeleteCandidate(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 shadow-sm"
              >
                {saving ? 'جاري الإزالة...' : 'تأكيد الإزالة'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
