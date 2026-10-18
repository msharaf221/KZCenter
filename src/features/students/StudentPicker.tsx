import { Check, Search, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { Student } from '../../domain/models';
import { normalizeSearchText } from '../../domain/searchText';

interface StudentPickerProps {
  students: Student[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  maxSelections?: number;
  placeholder?: string;
  emptyHint?: string;
}

const STATUS_LABEL: Record<Student['status'], string> = {
  active: 'نشط',
  suspended: 'متوقف',
  ended: 'منتهي',
};

/** Search by student/guardian phone or name; keep selection while the query changes. */
export default function StudentPicker({
  students,
  selectedIds,
  onChange,
  multiple = false,
  disabled = false,
  maxSelections,
  placeholder = 'اكتب اسم الطالب أو رقم هاتفه/ولي الأمر...',
  emptyHint = 'اكتب اسمًا أو رقم هاتف للبحث عن الطالب.',
}: StudentPickerProps) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const normalizedQuery = normalizeSearchText(query);
  const selected = useMemo(() => {
    const byId = new Map(students.map(student => [student.id, student]));
    return selectedIds.map(id => byId.get(id)).filter((student): student is Student => !!student && !student.deleted);
  }, [students, selectedIds]);
  const matches = useMemo(() => {
    if (!normalizedQuery) return [];
    return students
      .filter(student => !student.deleted)
      .filter(student => [student.name, student.phone, student.parentPhone, student.gradeLevel]
        .some(value => normalizeSearchText(value).includes(normalizedQuery)))
      .sort((a, b) => {
        const aName = normalizeSearchText(a.name);
        const bName = normalizeSearchText(b.name);
        return Number(!aName.startsWith(normalizedQuery)) - Number(!bName.startsWith(normalizedQuery)) || aName.localeCompare(bName, 'ar');
      })
      .slice(0, 30);
  }, [students, normalizedQuery]);
  const availableSlots = maxSelections === undefined ? Number.POSITIVE_INFINITY : Math.max(0, maxSelections - selectedIds.length);

  function toggleStudent(id: string) {
    if (disabled) return;
    const isSelected = selectedIds.includes(id);
    if (!multiple) {
      onChange(isSelected ? [] : [id]);
      setQuery('');
      return;
    }
    if (isSelected) onChange(selectedIds.filter(selectedId => selectedId !== id));
    else if (availableSlots > 0) onChange([...selectedIds, id]);
  }

  function removeStudent(id: string) {
    if (!disabled) onChange(selectedIds.filter(selectedId => selectedId !== id));
  }

  function selectVisible() {
    if (disabled || !multiple) return;
    const alreadySelected = new Set(selectedIds);
    const room = Math.max(0, availableSlots);
    const additions = matches.filter(student => !alreadySelected.has(student.id)).slice(0, room);
    if (additions.length) onChange([...selectedIds, ...additions.map(student => student.id)]);
  }

  return (
    <div className="space-y-2">
      {multiple && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="الطلاب المختارون">
          {selected.map(student => (
            <span key={student.id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800">
              <span className="max-w-48 truncate">{student.name}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeStudent(student.id)}
                aria-label={`إزالة ${student.name} من الاختيار`}
                className="rounded-full p-0.5 text-indigo-500 hover:bg-indigo-100 disabled:opacity-50"
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!multiple && selected[0] && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-900">{selected[0].name}</p>
            <p className="truncate text-xs text-gray-600">{selected[0].parentPhone || selected[0].phone || 'لا يوجد رقم هاتف مسجل'}</p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange([])}
            aria-label={`مسح اختيار ${selected[0].name}`}
            className="rounded-lg p-2 text-gray-500 hover:bg-white disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {(!selected[0] || multiple) && (
        <div className="relative">
          <label htmlFor={inputId} className="sr-only">بحث عن طالب</label>
          <Search size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id={inputId}
            type="search"
            value={query}
            disabled={disabled}
            onChange={event => setQuery(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-10 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
          />
        </div>
      )}

      {multiple && matches.length > 0 && (
        <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
          <span>نتائج البحث: {matches.length === 30 ? 'أول ٣٠ نتيجة' : matches.length}</span>
          <button
            type="button"
            onClick={selectVisible}
            disabled={disabled || matches.every(student => selectedIds.includes(student.id)) || availableSlots <= 0}
            className="font-semibold text-indigo-700 hover:text-indigo-900 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {availableSlots < matches.filter(student => !selectedIds.includes(student.id)).length
              ? `تحديد أول ${availableSlots} نتائج`
              : 'تحديد النتائج الظاهرة'}
          </button>
        </div>
      )}

      <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white" aria-live="polite">
        {!normalizedQuery ? (
          <p className="px-3 py-4 text-center text-xs text-gray-500">{emptyHint}</p>
        ) : matches.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-gray-500">لا توجد نتائج مطابقة. جرّب الاسم أو رقمًا مختلفًا.</p>
        ) : (
          matches.map(student => {
            const checked = selectedIds.includes(student.id);
            const disabledByLimit = multiple && !checked && availableSlots <= 0;
            return (
              <button
                key={student.id}
                type="button"
                role={multiple ? 'checkbox' : undefined}
                aria-checked={multiple ? checked : undefined}
                aria-pressed={!multiple ? checked : undefined}
                disabled={disabled || disabledByLimit}
                onClick={() => toggleStudent(student.id)}
                className={`flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-right last:border-b-0 hover:bg-indigo-50/60 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-indigo-50' : ''}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-transparent'}`}>
                  {checked ? <Check size={14} strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{student.name}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {student.parentPhone || student.phone || 'لا يوجد رقم هاتف'}
                    {student.gradeLevel ? ` · ${student.gradeLevel}` : ''}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${student.status === 'active' ? 'bg-green-50 text-green-700' : student.status === 'suspended' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABEL[student.status] || student.status}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
