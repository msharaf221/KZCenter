import { Bell, Save } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { getContrastColor } from '../../lib/utils';
import type { SettingsSectionProps } from './types';

export default function NotificationSettingsSection({
  form,
  setForm,
  handleSaveGeneral,
  primaryColor,
}: SettingsSectionProps) {
  const { notificationsEnabled, enableNotifications } = useApp();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900">الإشعارات</h2>
        {!notificationsEnabled && (
          <button
            onClick={enableNotifications}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-medium hover:bg-indigo-100"
          >
            <Bell size={16} /> تفعيل إشعارات المتصفح
          </button>
        )}
      </div>

      {notificationsEnabled && (
        <div className="mb-4 p-3 bg-green-50 border border-green-100 rounded-xl flex items-center gap-2">
          <span className="text-green-600">✓</span>
          <span className="text-sm text-green-700">إشعارات المتصفح مفعلة</span>
        </div>
      )}

      <div className="space-y-4">
        {[
          { key: 'notifyNewStudent', label: 'إشعار عند تسجيل طالب جديد', icon: '🎓' },
          { key: 'notifyAbsence', label: 'إشعار عند غياب الطالب', icon: '⚠️' },
          { key: 'notifyLatePayment', label: 'إشعار عند تأخر الدفعات', icon: '💰' },
        ].map(item => (
          <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <span>{item.icon}</span> {item.label}
            </span>
            <button
              onClick={() => setForm({ ...form, [item.key]: !form[item.key as keyof typeof form] })}
              className={`relative w-12 h-6 rounded-full transition-colors ${form[item.key as keyof typeof form] ? 'bg-indigo-600' : 'bg-gray-300'}`}
              style={form[item.key as keyof typeof form] ? { backgroundColor: primaryColor } : {}}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full shadow transition-transform ${form[item.key as keyof typeof form] ? 'translate-x-1' : 'translate-x-7'}`}
                style={{
                  backgroundColor: form[item.key as keyof typeof form] ? getContrastColor(primaryColor) : '#ffffff',
                }}
              />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={handleSaveGeneral}
        className="mt-5 flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium"
        style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
      >
        <Save size={16} /> حفظ الإشعارات
      </button>
    </div>
  );
}
