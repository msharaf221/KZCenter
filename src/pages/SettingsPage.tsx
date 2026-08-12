import { useState, useEffect } from 'react';
import { Save, Download, Upload, Bell, Cloud, Database, RefreshCw } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { exportAllData, importAllData } from '../lib/db';
import { downloadJSON, COLORS } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notifications';
import { SQL_SCHEMA } from '../lib/supabase';
import { syncLocalToCloud, syncCloudToLocal } from '../lib/storage';

export default function SettingsPage() {
  const { 
    settings, updateSettings, 
    notificationsEnabled, enableNotifications,
    storageMode, changeStorageMode, isCloudEnabled 
  } = useApp();
  const { user, resetPassword } = useAuth();
  const [form, setForm] = useState({
    centerName: '', address: '', phone: '', email: '',
    academicYear: '', currency: 'EGP', primaryColor: '#6366f1',
    fontSize: 'md' as 'sm' | 'md' | 'lg', language: 'ar' as 'ar' | 'en',
    notifyNewStudent: true, notifyAbsence: true, notifyLatePayment: true,
  });
  const [passwordForm, setPasswordForm] = useState({ newPass: '', confirm: '' });
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        centerName: settings.centerName || '',
        address: settings.address || '',
        phone: settings.phone || '',
        email: settings.email || '',
        academicYear: settings.academicYear || '',
        currency: settings.currency || 'EGP',
        primaryColor: settings.primaryColor || '#6366f1',
        fontSize: settings.fontSize || 'md',
        language: settings.language || 'ar',
        notifyNewStudent: settings.notifyNewStudent ?? true,
        notifyAbsence: settings.notifyAbsence ?? true,
        notifyLatePayment: settings.notifyLatePayment ?? true,
      });
    }
  }, [settings]);

  async function handleSaveGeneral() {
    try {
      await updateSettings(form);
      notify.success('تم حفظ الإعدادات');
    } catch { notify.error('حدث خطأ'); }
  }

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

  async function handleExportBackup() {
    try {
      const data = await exportAllData();
      downloadJSON(data, `eduCenter_backup_${new Date().toISOString().split('T')[0]}.json`);
      notify.success('تم تصدير نسخة احتياطية بنجاح');
    } catch { notify.error('حدث خطأ أثناء التصدير'); }
  }

  async function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm('هل أنت متأكد من استيراد هذه البيانات؟ سيتم استبدال جميع البيانات الحالية.')) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importAllData(data);
      notify.success('تم استيراد البيانات بنجاح. يُنصح بإعادة تحميل الصفحة.');
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      notify.error('حدث خطأ أثناء الاستيراد. تأكد من صحة الملف.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  async function handleSyncToCloud() {
    setSyncing(true);
    try {
      await syncLocalToCloud();
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncFromCloud() {
    setSyncing(true);
    try {
      await syncCloudToLocal();
    } finally {
      setSyncing(false);
    }
  }

  function copySchema() {
    navigator.clipboard.writeText(SQL_SCHEMA);
    notify.success('تم نسخ الـ Schema');
  }

  const primaryColor = settings?.primaryColor || '#6366f1';

  return (
    <Layout title="الإعدادات">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* General Settings */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-5">الإعدادات العامة</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">اسم المركز</label>
              <input type="text" value={form.centerName} onChange={e => setForm({...form, centerName: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">العنوان</label>
              <input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الهاتف</label>
              <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">البريد الإلكتروني</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">العام الدراسي</label>
              <input type="text" value={form.academicYear} onChange={e => setForm({...form, academicYear: e.target.value})}
                placeholder="مثال: 2024-2025"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">العملة</label>
              <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                <option value="EGP">جنيه مصري (EGP)</option>
                <option value="SAR">ريال سعودي (SAR)</option>
                <option value="AED">درهم إماراتي (AED)</option>
                <option value="USD">دولار أمريكي (USD)</option>
              </select>
            </div>
          </div>
          <button onClick={handleSaveGeneral}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium transition-colors"
            style={{ backgroundColor: primaryColor }}>
            <Save size={16} /> حفظ الإعدادات العامة
          </button>
        </div>

        {/* Appearance */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-5">المظهر</h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">اللون الرئيسي</label>
              <div className="flex flex-wrap gap-3">
                {COLORS.map(color => (
                  <button key={color} onClick={() => setForm({...form, primaryColor: color})}
                    className={`w-9 h-9 rounded-full border-4 transition-transform hover:scale-110
                      ${form.primaryColor === color ? 'border-gray-400 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }} />
                ))}
                <div className="flex items-center gap-2">
                  <input type="color" value={form.primaryColor} onChange={e => setForm({...form, primaryColor: e.target.value})}
                    className="w-9 h-9 rounded-full cursor-pointer border-0 bg-transparent" />
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
                  <button key={opt.value} onClick={() => setForm({...form, fontSize: opt.value as 'sm' | 'md' | 'lg'})}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors
                      ${form.fontSize === opt.value ? 'border-current text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    style={form.fontSize === opt.value ? { borderColor: primaryColor, backgroundColor: primaryColor } : {}}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={handleSaveGeneral}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium"
            style={{ backgroundColor: primaryColor }}>
            <Save size={16} /> تطبيق المظهر
          </button>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">الإشعارات</h2>
            {!notificationsEnabled && (
              <button onClick={enableNotifications}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-medium hover:bg-indigo-100">
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
                  onClick={() => setForm({...form, [item.key]: !form[item.key as keyof typeof form]})}
                  className={`relative w-12 h-6 rounded-full transition-colors ${form[item.key as keyof typeof form] ? 'bg-indigo-600' : 'bg-gray-300'}`}
                  style={form[item.key as keyof typeof form] ? { backgroundColor: primaryColor } : {}}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${form[item.key as keyof typeof form] ? 'translate-x-1' : 'translate-x-7'}`} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={handleSaveGeneral}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium"
            style={{ backgroundColor: primaryColor }}>
            <Save size={16} /> حفظ الإشعارات
          </button>
        </div>

        {/* Cloud Storage */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
            <Cloud size={20} /> التخزين السحابي
          </h2>

          {/* Status */}
          <div className={`p-4 rounded-xl mb-4 ${isCloudEnabled ? 'bg-green-50 border border-green-100' : 'bg-yellow-50 border border-yellow-100'}`}>
            <p className={`text-sm font-medium ${isCloudEnabled ? 'text-green-700' : 'text-yellow-700'}`}>
              {isCloudEnabled ? '✓ Supabase متصل' : '⚠️ Supabase غير مهيأ - النظام يعمل محلياً'}
            </p>
          </div>

          {/* Storage Mode */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">وضع التخزين</label>
            <div className="flex gap-2">
              {[
                { value: 'local', label: 'محلي فقط', icon: <Database size={14} /> },
                { value: 'cloud', label: 'سحابي فقط', icon: <Cloud size={14} />, disabled: !isCloudEnabled },
                { value: 'hybrid', label: 'مختلط', icon: <RefreshCw size={14} />, disabled: !isCloudEnabled },
              ].map(opt => (
                <button key={opt.value} 
                  onClick={() => !opt.disabled && changeStorageMode(opt.value as 'local' | 'cloud' | 'hybrid')}
                  disabled={opt.disabled}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium border-2 transition-colors
                    ${storageMode === opt.value ? 'border-current text-white' : opt.disabled ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  style={storageMode === opt.value ? { borderColor: primaryColor, backgroundColor: primaryColor } : {}}>
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sync buttons */}
          {isCloudEnabled && (
            <div className="flex gap-2">
              <button onClick={handleSyncToCloud} disabled={syncing}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-100 disabled:opacity-50">
                <Upload size={16} /> رفع للسحابة
              </button>
              <button onClick={handleSyncFromCloud} disabled={syncing}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-purple-50 text-purple-600 rounded-xl text-sm font-medium hover:bg-purple-100 disabled:opacity-50">
                <Download size={16} /> تنزيل من السحابة
              </button>
            </div>
          )}

          {/* Setup instructions */}
          {!isCloudEnabled && (
            <div className="mt-4 p-4 bg-gray-50 rounded-xl">
              <p className="text-sm font-semibold text-gray-700 mb-2">لتفعيل التخزين السحابي:</p>
              <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
                <li>أنشئ مشروع على <a href="https://supabase.com" target="_blank" className="text-indigo-600 underline">supabase.com</a></li>
                <li>انسخ الـ Schema وأنشئ الجداول</li>
                <li>أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY</li>
              </ol>
              <button onClick={copySchema} className="mt-3 text-xs text-indigo-600 hover:underline">
                📋 نسخ SQL Schema
              </button>
            </div>
          )}
        </div>

        {/* Security */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-5">الأمان</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">كلمة المرور الجديدة</label>
              <input type="password" value={passwordForm.newPass} onChange={e => setPasswordForm({...passwordForm, newPass: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="6 أحرف على الأقل" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">تأكيد كلمة المرور</label>
              <input type="password" value={passwordForm.confirm} onChange={e => setPasswordForm({...passwordForm, confirm: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>
          </div>
          <button onClick={handleChangePassword}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium"
            style={{ backgroundColor: primaryColor }}>
            <Save size={16} /> تغيير كلمة المرور
          </button>
        </div>

        {/* Backup */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-5">النسخ الاحتياطي</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 border border-dashed border-gray-200 rounded-xl text-center">
              <Download size={24} className="text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700 mb-3">تصدير نسخة احتياطية كاملة</p>
              <button onClick={handleExportBackup}
                className="flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-medium mx-auto"
                style={{ backgroundColor: primaryColor }}>
                <Download size={16} /> تصدير JSON
              </button>
            </div>
            <div className="p-4 border border-dashed border-gray-200 rounded-xl text-center">
              <Upload size={24} className="text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700 mb-3">استيراد نسخة احتياطية</p>
              <label className={`flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-medium mx-auto cursor-pointer ${importing ? 'opacity-60' : ''}`}
                style={{ backgroundColor: '#8b5cf6' }}>
                <Upload size={16} />
                {importing ? 'جاري الاستيراد...' : 'استيراد JSON'}
                <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" disabled={importing} />
              </label>
            </div>
          </div>
          <div className="mt-4 p-4 bg-yellow-50 rounded-xl border border-yellow-100">
            <p className="text-xs text-yellow-700">⚠️ تحذير: استيراد نسخة احتياطية سيستبدل جميع البيانات الحالية. تأكد من عمل نسخة احتياطية أولاً.</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
