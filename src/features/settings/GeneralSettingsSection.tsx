import { Save } from 'lucide-react';
import { getContrastColor } from '../../lib/utils';
import type { SettingsSectionProps } from './types';

export default function GeneralSettingsSection({
  form,
  setForm,
  handleSaveGeneral,
  primaryColor,
}: SettingsSectionProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-5">الإعدادات العامة</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1">اسم المركز</label>
          <input
            type="text"
            value={form.centerName}
            onChange={e => setForm({ ...form, centerName: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1">العنوان</label>
          <input
            type="text"
            value={form.address}
            onChange={e => setForm({ ...form, address: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">الهاتف</label>
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">البريد الإلكتروني</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">العام الدراسي</label>
          <input
            type="text"
            value={form.academicYear}
            onChange={e => setForm({ ...form, academicYear: e.target.value })}
            placeholder="مثال: 2024-2025"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">العملة</label>
          <select
            value={form.currency}
            onChange={e => setForm({ ...form, currency: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white"
          >
            <option value="EGP">جنيه مصري (EGP)</option>
            <option value="SAR">ريال سعودي (SAR)</option>
            <option value="AED">درهم إماراتي (AED)</option>
            <option value="USD">دولار أمريكي (USD)</option>
          </select>
        </div>
      </div>
      <button
        onClick={handleSaveGeneral}
        className="mt-5 flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium transition-colors"
        style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
      >
        <Save size={16} /> حفظ الإعدادات العامة
      </button>
    </div>
  );
}
