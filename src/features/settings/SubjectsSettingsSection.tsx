import { useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { getAllSubjects } from '../../lib/subjects';
import { getContrastColor } from '../../lib/utils';
import SubjectsManagementModal from '../../components/subjects/SubjectsManagementModal';

export default function SubjectsSettingsSection({ primaryColor }: { primaryColor: string }) {
  const { settings } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'list' | 'add'>('list');

  const subjects = getAllSubjects(settings?.customSubjects);

  const handleOpenList = () => {
    setModalMode('list');
    setModalOpen(true);
  };

  const handleOpenAdd = () => {
    setModalMode('add');
    setModalOpen(true);
  };

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BookOpen size={20} className="text-indigo-600" /> إدارة المواد الدراسية
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              إضافة مواد جديدة، تعديل أسمائها وألوانها وأيقوناتها وتصنيفاتها، وتخصيص المواد المتاحة للكورسات.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
            >
              <Plus size={15} />
              <span>إضافة مادة</span>
            </button>
            <button
              type="button"
              onClick={handleOpenList}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition-opacity"
              style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
            >
              <BookOpen size={15} />
              <span>إدارة المواد ({subjects.length})</span>
            </button>
          </div>
        </div>

        {/* Display badges of active subjects */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          {subjects.map(s => (
            <span
              key={s.id}
              onClick={handleOpenList}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-800 cursor-pointer transition-colors"
            >
              <span
                className="w-5 h-5 rounded-md flex items-center justify-center text-xs"
                style={{ backgroundColor: `${s.color}20`, color: s.color }}
              >
                {s.icon}
              </span>
              <span>{s.name}</span>
              {s.nameEn && <span className="text-[10px] text-gray-400 font-mono">({s.nameEn})</span>}
              <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-500">
                {s.category}
              </span>
            </span>
          ))}
        </div>
      </div>

      <SubjectsManagementModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialMode={modalMode}
      />
    </>
  );
}
