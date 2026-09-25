import { Save } from 'lucide-react';
import { COLORS, getContrastColor } from '../../lib/utils';
import type { SettingsSectionProps } from './types';

export default function AppearanceSettingsSection({
  form,
  setForm,
  handleSaveGeneral,
  primaryColor,
}: SettingsSectionProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-5">المظهر</h2>
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">اللون الرئيسي</label>
          <div className="flex flex-wrap gap-3">
            {COLORS.map(color => (
              <button
                key={color}
                onClick={() => setForm({ ...form, primaryColor: color })}
                className={`w-9 h-9 rounded-full border-4 transition-transform hover:scale-110
                      ${form.primaryColor === color ? 'border-gray-400 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: color, color: getContrastColor(color) }}
              />
            ))}
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primaryColor}
                onChange={e => setForm({ ...form, primaryColor: e.target.value })}
                className="w-9 h-9 rounded-full cursor-pointer border-0 bg-transparent"
              />
              <span className="text-xs text-gray-500">مخصص</span>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">حجم الخط</label>
          <div className="flex gap-3">
            {[
              { value: 'sm', label: 'صغير' },
              { value: 'md', label: 'متوسط' },
              { value: 'lg', label: 'كبير' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setForm({ ...form, fontSize: opt.value as 'sm' | 'md' | 'lg' })}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors
                      ${form.fontSize === opt.value ? 'border-current text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                style={
                  form.fontSize === opt.value
                    ? {
                        borderColor: primaryColor,
                        backgroundColor: primaryColor,
                        color: getContrastColor(primaryColor),
                      }
                    : {}
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button
        onClick={handleSaveGeneral}
        className="mt-5 flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium"
        style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
      >
        <Save size={16} /> تطبيق المظهر
      </button>
    </div>
  );
}
