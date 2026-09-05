/**
 * SessionPicker — اختيار «بدأ من الحصة رقم» بأزرار مرقمة واضحة.
 *
 * بديل الـ <select> اللي كان بيعرض تسميات ملخبطة زي «الأولى (شهر كامل)» و«رقم 2 من 4».
 * دلوقتي الأرقام ظاهرة كلها قدام المستخدم (1 → sessions، والافتراضي 8 حصة)،
 * والمختار بياخد لون الـ primaryColor من الإعدادات مع لون نص متباين.
 */
import { useApp } from '../contexts/AppContext';
import { getContrastColor } from '../lib/utils';

interface Props {
  /** عدد الحصص في الشهر (الافتراضي في النظام 8) */
  sessions: number;
  /** الحصة المختارة (1 = من أول حصة) */
  value: number;
  onChange: (session: number) => void;
  /** عنوان فوق الأزرار */
  label?: string;
  /** حجم الأزرار */
  size?: 'sm' | 'md';
}

export default function SessionPicker({
  sessions,
  value,
  onChange,
  label = 'بدأ من الحصة رقم',
  size = 'md',
}: Props) {
  const { settings } = useApp();
  const primaryColor = settings?.primaryColor || '#6366f1';
  const contrast = getContrastColor(primaryColor);

  const total = Math.max(1, Math.round(sessions) || 1);
  const selected = Math.min(Math.max(1, value || 1), total);
  const remaining = total - selected + 1;

  const btn = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-sm';
  const labelCls = size === 'sm' ? 'text-xs text-gray-500' : 'text-sm font-semibold text-gray-700';

  return (
    <div>
      {label && <label className={`block ${labelCls} mb-1.5`}>{label}</label>}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: total }, (_, i) => i + 1).map(n => {
          const active = n === selected;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-pressed={active}
              aria-label={`الحصة رقم ${n}`}
              className={`${btn} rounded-lg font-bold border transition-colors ${
                active
                  ? 'border-transparent shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
              }`}
              style={active ? { backgroundColor: primaryColor, color: contrast } : undefined}
            >
              {n}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-500 mt-1.5">
        {selected === 1
          ? `من أول حصة — شهر كامل (${total} حصص)`
          : `هيحضر ${remaining} حصص من ${total} في الشهر ده`}
      </p>
    </div>
  );
}
