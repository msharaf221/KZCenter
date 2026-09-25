import { Save } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { notify } from '../../lib/notifications';
import { getContrastColor } from '../../lib/utils';

export default function PasswordSettingsSection({ primaryColor }: { primaryColor: string }) {
  const { user, resetPassword } = useAuth();
  const [passwordForm, setPasswordForm] = useState({ newPass: '', confirm: '' });

  async function handleChangePassword() {
    if (!passwordForm.newPass || passwordForm.newPass.length < 6) {
      notify.error('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (passwordForm.newPass !== passwordForm.confirm) {
      notify.error('كلمتا المرور غير متطابقتين');
      return;
    }
    if (!user) return;
    try {
      await resetPassword(user.id, passwordForm.newPass);
      setPasswordForm({ newPass: '', confirm: '' });
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : 'حدث خطأ');
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-5">الأمان</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">كلمة المرور الجديدة</label>
          <input
            type="password"
            value={passwordForm.newPass}
            onChange={e => setPasswordForm({ ...passwordForm, newPass: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="6 أحرف على الأقل"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">تأكيد كلمة المرور</label>
          <input
            type="password"
            value={passwordForm.confirm}
            onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
          />
        </div>
      </div>
      <button
        onClick={handleChangePassword}
        className="mt-5 flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium"
        style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
      >
        <Save size={16} /> تغيير كلمة المرور
      </button>
    </div>
  );
}
