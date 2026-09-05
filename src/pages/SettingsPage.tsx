import { useState, useEffect } from 'react';
import { Save, Download, Upload, Bell, Cloud, RefreshCw, Wrench, Eye, EyeOff, CheckCircle, XCircle, Loader2, Receipt, Image as ImageIcon, Trash2 } from 'lucide-react';
import Layout from '../components/layout/Layout';
import BackupManager from '../components/BackupManager';
import { runIntegrityFix, IntegrityReport } from '../lib/db';
import { COLORS, validateEmail, validatePhone, getContrastColor } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notifications';
import {
  SQL_SCHEMA,
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  testSupabaseConnection,
  isSupabaseConfigured,
} from '../lib/supabase';
import { syncLocalToCloud, syncCloudToLocal, type SyncReport } from '../lib/storage';

export default function SettingsPage() {
  const {
    settings, updateSettings,
    notificationsEnabled, enableNotifications,
    isCloudEnabled
  } = useApp();
  const { user, resetPassword } = useAuth();
  const [form, setForm] = useState({
    centerName: '', address: '', phone: '', email: '',
    academicYear: '', currency: 'EGP', primaryColor: '#6366f1',
    fontSize: 'md' as 'sm' | 'md' | 'lg',
    notifyNewStudent: true, notifyAbsence: true, notifyLatePayment: true,
    // سياسة التحصيل والإيصالات
    dueDayOfMonth: undefined as number | undefined,
    graceDays: 0,
    sessionsPerMonth: 8,
    receiptPrefix: '',
    receiptFooter: '',
    logo: '',
    notifyUpcomingDue: false,
    upcomingDueDays: 3,
    lowStockThreshold: 5,
  });
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const [passwordForm, setPasswordForm] = useState({ newPass: '', confirm: '' });
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);

  // Supabase config state
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [supabaseExpanded, setSupabaseExpanded] = useState(false);

  async function handleIntegrityCheck() {
    setChecking(true);
    try {
      const report = await runIntegrityFix();
      setIntegrityReport(report);
      const totalFixed = report.staleEnrollments + report.staleGroupMembers;
      if (totalFixed > 0) {
        notify.success(`تم إصلاح ${totalFixed} رابط تالف وإعادة حساب ${report.recalculatedStudents} طالب`);
      } else {
        notify.success('البيانات سليمة - لا توجد روابط تالفة ✓');
      }
    } catch {
      notify.error('حدث خطأ أثناء الفحص');
    } finally {
      setChecking(false);
    }
  }

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
        notifyNewStudent: settings.notifyNewStudent ?? true,
        notifyAbsence: settings.notifyAbsence ?? true,
        notifyLatePayment: settings.notifyLatePayment ?? true,
        dueDayOfMonth: settings.dueDayOfMonth,
        graceDays: settings.graceDays ?? 0,
        sessionsPerMonth: settings.sessionsPerMonth ?? 8,
        receiptPrefix: settings.receiptPrefix || '',
        receiptFooter: settings.receiptFooter || '',
        logo: settings.logo || '',
        notifyUpcomingDue: settings.notifyUpcomingDue ?? false,
        upcomingDueDays: settings.upcomingDueDays ?? 3,
        lowStockThreshold: settings.lowStockThreshold ?? 5,
      });
    }
  }, [settings]);

  // Load Supabase config
  useEffect(() => {
    const config = getStoredSupabaseConfig();
    setSupabaseUrl(config.url);
    setSupabaseKey(config.anonKey);
  }, []);

  async function handleSaveGeneral() {
    if (form.email && !validateEmail(form.email)) { notify.error('البريد الإلكتروني غير صحيح'); return; }
    if (form.phone && !validatePhone(form.phone)) { notify.error('رقم الهاتف غير صحيح'); return; }
    if (form.dueDayOfMonth !== undefined && form.dueDayOfMonth !== null) {
      const d = Number(form.dueDayOfMonth);
      if (!Number.isFinite(d) || d < 1 || d > 28) { notify.error('يوم الاستحقاق لازم يكون بين 1 و 28'); return; }
    }
    if (form.sessionsPerMonth < 1 || form.sessionsPerMonth > 40) { notify.error('عدد الحصص في الشهر لازم يكون بين 1 و 40'); return; }
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

  async function handleTestConnection() {
    if (!supabaseUrl || !supabaseKey) {
      notify.error('يرجى إدخال URL و Anon Key');
      return;
    }
    setTestingConnection(true);
    setConnectionStatus('idle');
    try {
      // Save config first so test can use it
      saveSupabaseConfig(supabaseUrl, supabaseKey);
      const success = await testSupabaseConnection();
      setConnectionStatus(success ? 'success' : 'error');
      if (success) {
        notify.success('الاتصال بـ Supabase ناجح! 🎉');
      } else {
        notify.error('فشل الاتصال. تأكد من صحة البيانات.');
      }
    } catch {
      setConnectionStatus('error');
      notify.error('حدث خطأ أثناء اختبار الاتصال');
    } finally {
      setTestingConnection(false);
    }
  }

  function handleSaveSupabaseConfig() {
    if (!supabaseUrl || !supabaseKey) {
      notify.error('يرجى إدخال URL و Anon Key');
      return;
    }
    saveSupabaseConfig(supabaseUrl, supabaseKey);
    notify.success('تم حفظ إعدادات Supabase. يُنصح بإعادة تحميل الصفحة.');
    // Show reload prompt
    setTimeout(() => {
      if (confirm('هل تريد إعادة تحميل الصفحة لتطبيق الإعدادات؟')) {
        window.location.reload();
      }
    }, 1000);
  }

  function handleClearSupabaseConfig() {
    if (!confirm('هل أنت متأكد من حذف إعدادات Supabase؟')) return;
    clearSupabaseConfig();
    setSupabaseUrl('');
    setSupabaseKey('');
    setConnectionStatus('idle');
    notify.success('تم حذف إعدادات Supabase. يُنصح بإعادة تحميل الصفحة.');
  }

  async function handleSyncToCloud() {
    setSyncing(true);
    try {
      setSyncReport(await syncLocalToCloud());
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncFromCloud() {
    setSyncing(true);
    try {
      setSyncReport(await syncCloudToLocal());
    } finally {
      setSyncing(false);
    }
  }

  /** رفع شعار المركز (data URL) — بيتصغر قبل الحفظ عشان ما ينفخش القاعدة */
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { notify.error('الملف لازم يكون صورة'); return; }
    if (file.size > 2 * 1024 * 1024) { notify.error('حجم الصورة كبير (الحد 2 ميجا)'); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const max = 320;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('read failed'));
      img.src = URL.createObjectURL(file);
    }).catch(() => '');
    if (!dataUrl) { notify.error('تعذّر قراءة الصورة'); return; }
    setForm(f => ({ ...f, logo: dataUrl }));
    notify.success('تم تحميل الشعار — اضغط حفظ لتفعيله');
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
            style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
            <Save size={16} /> حفظ الإعدادات العامة
          </button>
        </div>

        {/* سياسة التحصيل والإيصالات */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Receipt size={20} /> سياسة التحصيل والإيصالات
          </h2>
          <p className="text-xs text-gray-400 mb-5">الإعدادات دي بتتحكم في مواعيد الاستحقاق وأرقام الإيصالات والمطبوعات</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">يوم الاستحقاق الموحد</label>
              <input type="number" min={1} max={28}
                value={form.dueDayOfMonth ?? ''}
                onChange={e => setForm({ ...form, dueDayOfMonth: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="مثال: 5 (فاضي = يوم التسجيل)"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
              <p className="text-[11px] text-gray-400 mt-1">كل الأقساط تستحق في اليوم ده من كل شهر (1-28)</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">أيام السماح</label>
              <input type="number" min={0} max={30} value={form.graceDays}
                onChange={e => setForm({ ...form, graceDays: Number(e.target.value) })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
              <p className="text-[11px] text-gray-400 mt-1">بعد كام يوم من الاستحقاق يتحول القسط لـ«متأخر»</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">عدد الحصص في الشهر</label>
              <input type="number" min={1} max={40} value={form.sessionsPerMonth}
                onChange={e => setForm({ ...form, sessionsPerMonth: Number(e.target.value) })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
              <p className="text-[11px] text-gray-400 mt-1">الافتراضي لو الكورس/المجموعة مش محددة — كان ثابت على 8 قبل كده</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">بادئة رقم الإيصال</label>
              <input type="text" value={form.receiptPrefix} maxLength={8}
                onChange={e => setForm({ ...form, receiptPrefix: e.target.value.toUpperCase() })}
                placeholder="KZ (افتراضي = السنة)"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none font-mono" />
              <p className="text-[11px] text-gray-400 mt-1">الأرقام بتكمل تسلسلياً: KZ-202609-0001</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">تذييل الإيصال</label>
              <input type="text" value={form.receiptFooter}
                onChange={e => setForm({ ...form, receiptFooter: e.target.value })}
                placeholder="مثال: الاشتراك غير قابل للاسترداد بعد أول حصة"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>

            {/* الشعار */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <ImageIcon size={14} /> شعار المركز (يظهر في الإيصالات والتقارير المطبوعة)
              </label>
              <div className="flex items-center gap-3">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50">
                  {form.logo
                    ? <img src={form.logo} alt="الشعار" className="w-full h-full object-contain" />
                    : <span className="text-xs text-gray-400">مفيش شعار</span>}
                </div>
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                    <Upload size={14} /> اختيار صورة
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </label>
                  {form.logo && (
                    <button onClick={() => setForm(f => ({ ...f, logo: '' }))}
                      className="flex items-center gap-1.5 px-3 py-2 border border-red-200 rounded-xl text-xs text-red-600 hover:bg-red-50">
                      <Trash2 size={13} /> إزالة الشعار
                    </button>
                  )}
                  <p className="text-[11px] text-gray-400">PNG/JPG — بيتصغر تلقائياً لأقصى 320px</p>
                </div>
              </div>
            </div>

            {/* التنبيهات الجديدة */}
            <div className="sm:col-span-2 border-t border-gray-100 pt-4 space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <span className="text-sm font-medium text-gray-700">🔔 تنبيه بالأقساط اللي استحقاقها قريب</span>
                  <p className="text-[11px] text-gray-400 mt-0.5">يظهر في لوحة التحكم قبل ما القسط يتأخر</p>
                </div>
                <button onClick={() => setForm(f => ({ ...f, notifyUpcomingDue: !f.notifyUpcomingDue }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${form.notifyUpcomingDue ? '' : 'bg-gray-300'}`}
                  style={form.notifyUpcomingDue ? { backgroundColor: primaryColor } : {}}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full shadow transition-transform bg-white ${form.notifyUpcomingDue ? 'translate-x-1' : 'translate-x-7'}`} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">التنبيه قبل الاستحقاق بـ (يوم)</label>
                  <input type="number" min={1} max={15} value={form.upcomingDueDays}
                    onChange={e => setForm({ ...form, upcomingDueDays: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">حد المخزون المنخفض</label>
                  <input type="number" min={0} max={100} value={form.lowStockThreshold}
                    onChange={e => setForm({ ...form, lowStockThreshold: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
                </div>
              </div>
            </div>
          </div>

          <button onClick={handleSaveGeneral}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium"
            style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
            <Save size={16} /> حفظ سياسة التحصيل
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
                    style={{ backgroundColor: color, color: getContrastColor(color) }} />
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
                    style={form.fontSize === opt.value ? { borderColor: primaryColor, backgroundColor: primaryColor, color: getContrastColor(primaryColor) } : {}}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={handleSaveGeneral}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium"
            style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
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
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full shadow transition-transform ${form[item.key as keyof typeof form] ? 'translate-x-1' : 'translate-x-7'}`}
                    style={{ backgroundColor: form[item.key as keyof typeof form] ? getContrastColor(primaryColor) : '#ffffff' }}
                  />
                </button>
              </div>
            ))}
          </div>
          <button onClick={handleSaveGeneral}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium"
            style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
            <Save size={16} /> حفظ الإشعارات
          </button>
        </div>

        {/* Cloud Storage - Supabase Configuration */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
            <Cloud size={20} /> التخزين السحابي - Supabase
          </h2>

          {/* Status */}
          <div className={`p-4 rounded-xl mb-5 ${isCloudEnabled ? 'bg-green-50 border border-green-100' : 'bg-yellow-50 border border-yellow-100'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isCloudEnabled ? (
                  <CheckCircle size={18} className="text-green-600" />
                ) : (
                  <XCircle size={18} className="text-yellow-600" />
                )}
                <p className={`text-sm font-medium ${isCloudEnabled ? 'text-green-700' : 'text-yellow-700'}`}>
                  {isCloudEnabled ? '✓ Supabase متصل ومهيأ' : '⚠️ Supabase غير مهيأ - النظام يعمل محلياً فقط'}
                </p>
              </div>
              <button
                onClick={() => setSupabaseExpanded(!supabaseExpanded)}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                {supabaseExpanded ? 'إخفاء' : 'إعدادات الاتصال'}
              </button>
            </div>
          </div>

          {/* Supabase URL & Key Configuration */}
          {supabaseExpanded && (
            <div className="mb-5 p-5 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 mb-3">إعدادات الاتصال بـ Supabase</h3>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Project URL
                  <span className="text-xs font-normal text-gray-400 mr-2">(VITE_SUPABASE_URL)</span>
                </label>
                <input
                  type="url"
                  value={supabaseUrl}
                  onChange={e => { setSupabaseUrl(e.target.value); setConnectionStatus('idle'); }}
                  placeholder="https://xxxxx.supabase.co"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  dir="ltr"
                />
                <p className="text-xs text-gray-400 mt-1">
                  تجده في: Supabase Dashboard → Settings → API → Project URL
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Anon Public Key
                  <span className="text-xs font-normal text-gray-400 mr-2">(VITE_SUPABASE_ANON_KEY)</span>
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={supabaseKey}
                    onChange={e => { setSupabaseKey(e.target.value); setConnectionStatus('idle'); }}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3 py-2.5 pl-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  تجده في: Supabase Dashboard → Settings → API → anon public key
                </p>
              </div>

              {/* Connection Status */}
              {connectionStatus === 'success' && (
                <div className="p-3 bg-green-50 border border-green-100 rounded-xl flex items-center gap-2">
                  <CheckCircle size={16} className="text-green-600" />
                  <span className="text-sm text-green-700">الاتصال ناجح! ✓</span>
                </div>
              )}
              {connectionStatus === 'error' && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2">
                  <XCircle size={16} className="text-red-600" />
                  <span className="text-sm text-red-700">فشل الاتصال. تأكد من صحة البيانات.</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection || !supabaseUrl || !supabaseKey}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingConnection ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  {testingConnection ? 'جاري الاختبار...' : 'اختبار الاتصال'}
                </button>

                <button
                  onClick={handleSaveSupabaseConfig}
                  disabled={!supabaseUrl || !supabaseKey}
                  className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
                >
                  <Save size={16} /> حفظ الإعدادات
                </button>

                {isSupabaseConfigured && (
                  <button
                    onClick={handleClearSupabaseConfig}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100"
                  >
                    حذف الإعدادات
                  </button>
                )}
              </div>

              {/* Setup Guide */}
              <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs font-bold text-blue-800 mb-2">📋 خطوات التفعيل:</p>
                <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                  <li>أنشئ مشروع على <a href="https://supabase.com" target="_blank" rel="noopener" className="underline">supabase.com</a></li>
                  <li>اذهب لـ SQL Editor وأنشئ الجداول (اضغط "نسخ SQL Schema" أدناه)</li>
                  <li>انسخ Project URL و Anon Key من Settings → API</li>
                  <li>الصقهما هنا واختبر الاتصال ثم احفظ</li>
                </ol>
                <button onClick={copySchema} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">
                  📋 نسخ SQL Schema (املأه في SQL Editor)
                </button>
              </div>
            </div>
          )}

          {/* Storage model note */}
          <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm text-gray-600">
            <p>
              <strong className="text-gray-900">النظام يعمل محلياً</strong> — تُحفظ البيانات على هذا الجهاز.
              عند ربط Supabase يمكنك رفع نسخة احتياطية للسحابة أو تنزيلها يدوياً من الأزرار أدناه.
            </p>
          </div>

          {/* Sync buttons */}
          {isCloudEnabled && (
            <div className="flex gap-2">
              <button onClick={handleSyncToCloud} disabled={syncing}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-100 disabled:opacity-50">
                <Upload size={16} /> {syncing ? 'جاري المزامنة...' : 'رفع للسحابة'}
              </button>
              <button onClick={handleSyncFromCloud} disabled={syncing}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-purple-50 text-purple-600 rounded-xl text-sm font-medium hover:bg-purple-100 disabled:opacity-50">
                <Download size={16} /> تنزيل من السحابة
              </button>
            </div>
          )}

          {/* تقرير المزامنة — قبل كده المزامنة كانت بتنجح/تفشل في صمت */}
          {syncReport && (
            <div className={`mt-4 rounded-xl border p-4 text-sm ${syncReport.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`font-bold flex items-center gap-1.5 ${syncReport.ok ? 'text-green-800' : 'text-red-800'}`}>
                  {syncReport.ok ? <CheckCircle size={15} /> : <XCircle size={15} />}
                  {syncReport.direction === 'push' ? 'رفع للسحابة' : 'تنزيل من السحابة'}
                  {syncReport.ok ? ' — نجح' : ' — فشل جزئي أو كلي'}
                </span>
                <span className="text-[11px] text-gray-500">{(syncReport.durationMs / 1000).toFixed(1)} ثانية</span>
              </div>
              <div className="text-xs text-gray-700 space-y-1 max-h-40 overflow-y-auto">
                {syncReport.tables.map(t => (
                  <div key={t.table} className="flex items-center justify-between gap-2">
                    <span className="font-mono">{t.table}</span>
                    <span className={t.error ? 'text-red-600 font-bold' : 'text-gray-500'}>
                      {t.error
                        ? `خطأ: ${t.error}`
                        : `رفع ${t.pushed} · تنزيل ${t.pulled}${t.skipped ? ` · متخطى ${t.skipped}` : ''}`}
                    </span>
                  </div>
                ))}
              </div>
              {syncReport.errors.length > 0 && (
                <div className="mt-2 pt-2 border-t border-red-200 text-xs text-red-700 space-y-0.5">
                  {syncReport.errors.map((e, i) => <p key={i}>• {e}</p>)}
                </div>
              )}
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
            style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
            <Save size={16} /> تغيير كلمة المرور
          </button>
        </div>

        {/* Data Integrity */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Wrench size={20} /> فحص سلامة البيانات
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            يفحص الروابط بين الطلاب والمجموعات والكورسات والمدرسين، ويصلح أي روابط تالفة (مثل تسجيلات في مجموعات محذوفة) ويعيد حساب المستحقات تلقائياً.
          </p>
          <button onClick={handleIntegrityCheck} disabled={checking}
            className={`flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium ${checking ? 'opacity-60' : ''}`}
            style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
            <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
            {checking ? 'جاري الفحص والإصلاح...' : 'فحص وإصلاح الآن'}
          </button>

          {integrityReport && (
            <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-1 text-sm">
              <p className="font-bold text-gray-900 mb-2">نتيجة الفحص:</p>
              <p className="text-gray-600">• تسجيلات تالفة تم تنظيفها من ملفات الطلاب: <strong>{integrityReport.staleEnrollments}</strong></p>
              <p className="text-gray-600">• طلاب محذوفون تم إزالتهم من المجموعات: <strong>{integrityReport.staleGroupMembers}</strong></p>
              <p className="text-gray-600">• طلاب أعيد حساب مستحقاتهم: <strong>{integrityReport.recalculatedStudents}</strong></p>
              {integrityReport.orphanGroupCourses.length > 0 && (
                <p className="text-red-600">⚠️ مجموعات مرتبطة بكورس محذوف (تحتاج تدخل يدوي): {integrityReport.orphanGroupCourses.join('، ')}</p>
              )}
              {integrityReport.orphanGroupTeachers.length > 0 && (
                <p className="text-red-600">⚠️ مجموعات مرتبطة بمدرس محذوف (تحتاج تدخل يدوي): {integrityReport.orphanGroupTeachers.join('، ')}</p>
              )}
            </div>
          )}
        </div>

        {/* Backup Manager */}
        <BackupManager />
      </div>
    </Layout>
  );
}
