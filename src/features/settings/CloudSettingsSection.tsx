import { CheckCircle, Cloud, Download, Eye, EyeOff, Loader2, RefreshCw, Save, Upload, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { isSupabaseConfigured } from '../../data/cloud/client';
import { clearCloudCredentials, clearSupabaseConfig, getCloudCredentials, getStoredSupabaseConfig, saveCloudCredentials, saveSupabaseConfig } from '../../data/cloud/config';
import { SQL_SCHEMA } from '../../data/cloud/schema';
import type { SyncReport } from '../../domain/sync/report';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { notify } from '../../lib/notifications';
import { getContrastColor, validateEmail } from '../../lib/utils';
import { testSupabaseConnection } from '../../services/cloud/connection';
import { syncCloudToLocal, syncLocalToCloud } from '../../services/sync/actions';

export default function CloudSettingsSection({ primaryColor }: { primaryColor: string }) {
  const { isCloudEnabled } = useApp();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);

  const [syncing, setSyncing] = useState(false);

  const [supabaseUrl, setSupabaseUrl] = useState('');

  const [supabaseKey, setSupabaseKey] = useState('');

  const [cloudEmail, setCloudEmail] = useState('');

  const [cloudPassword, setCloudPassword] = useState('');

  const [showCloudPassword, setShowCloudPassword] = useState(false);

  const [showKey, setShowKey] = useState(false);

  const [testingConnection, setTestingConnection] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const [supabaseExpanded, setSupabaseExpanded] = useState(false);
  useEffect(() => {
    const config = getStoredSupabaseConfig();
    setSupabaseUrl(config.url);
    setSupabaseKey(config.anonKey);
    const creds = getCloudCredentials();
    setCloudEmail(creds.email);
    setCloudPassword(creds.password);
  }, []);
  async function handleTestConnection() {
    if (!supabaseUrl || !supabaseKey) {
      notify.error('يرجى إدخال URL و Anon Key');
      return;
    }
    if (!cloudEmail.trim() || !cloudPassword) {
      notify.error('يرجى إدخال بريد وكلمة مرور حساب المركز السحابي');
      return;
    }
    setTestingConnection(true);
    setConnectionStatus('idle');
    try {
      // Save config + credentials first so test can authenticate as the tenant
      saveSupabaseConfig(supabaseUrl, supabaseKey);
      saveCloudCredentials(cloudEmail, cloudPassword);
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
    if (!cloudEmail.trim() || !cloudPassword) {
      notify.error('يرجى إدخال بريد وكلمة مرور حساب المركز السحابي (حساب Supabase Auth)');
      return;
    }
    if (!validateEmail(cloudEmail.trim())) {
      notify.error('بريد الحساب السحابي غير صحيح');
      return;
    }
    saveSupabaseConfig(supabaseUrl, supabaseKey);
    saveCloudCredentials(cloudEmail.trim(), cloudPassword);
    notify.success('تم حفظ إعدادات Supabase وحساب المركز. يُنصح بإعادة تحميل الصفحة.');
    // سؤال إعادة التحميل — نافذة React بدل نافذة المتصفح الأصلية
    void (async () => {
      const ok = await confirm({
        title: 'إعادة تحميل الصفحة',
        message: 'هل تريد إعادة تحميل الصفحة لتطبيق الإعدادات؟',
        confirmLabel: 'إعادة التحميل',
      });
      if (ok) window.location.reload();
    })();
  }

  async function handleClearSupabaseConfig() {
    const ok = await confirm({
      title: 'حذف إعدادات السحابة',
      message: 'هل أنت متأكد من حذف إعدادات Supabase واعتماد الحساب السحابي؟ البيانات المحلية لن تتأثر.',
      confirmLabel: 'نعم، حذف',
      danger: true,
    });
    if (!ok) return;
    clearSupabaseConfig();
    clearCloudCredentials();
    setSupabaseUrl('');
    setSupabaseKey('');
    setCloudEmail('');
    setCloudPassword('');
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

  function copySchema() {
    navigator.clipboard.writeText(SQL_SCHEMA);
    notify.success('تم نسخ الـ Schema');
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
          <Cloud size={20} /> التخزين السحابي - Supabase
        </h2>

        {/* Status */}
        <div
          className={`p-4 rounded-xl mb-5 ${isCloudEnabled ? 'bg-green-50 border border-green-100' : 'bg-yellow-50 border border-yellow-100'}`}
        >
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
                onChange={e => {
                  setSupabaseUrl(e.target.value);
                  setConnectionStatus('idle');
                }}
                placeholder="https://xxxxx.supabase.co"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                dir="ltr"
              />
              <p className="text-xs text-gray-400 mt-1">تجده في: Supabase Dashboard → Settings → API → Project URL</p>
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
                  onChange={e => {
                    setSupabaseKey(e.target.value);
                    setConnectionStatus('idle');
                  }}
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

            {/* حساب المركز في السحابة (tenant) — البريد وكلمة المرور */}
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
                <Cloud size={15} style={{ color: primaryColor }} />
                حساب المركز السحابي (Supabase Auth)
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                أنشئ مستخدم واحد لمركزك من Authentication → Users، ثم ضع بياناته هنا. بياناتك محمية بحسابك — لا يمكن لأي
                مركز آخر رؤيتها.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">البريد</label>
                  <input
                    type="email"
                    value={cloudEmail}
                    onChange={e => setCloudEmail(e.target.value)}
                    placeholder="center@example.com"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    dir="ltr"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">كلمة المرور</label>
                  <div className="relative">
                    <input
                      type={showCloudPassword ? 'text' : 'password'}
                      value={cloudPassword}
                      onChange={e => setCloudPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 pl-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      dir="ltr"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCloudPassword(!showCloudPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCloudPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>
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
                disabled={testingConnection || !supabaseUrl || !supabaseKey || !cloudEmail.trim() || !cloudPassword}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testingConnection ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {testingConnection ? 'جاري الاختبار...' : 'اختبار الاتصال'}
              </button>

              <button
                onClick={handleSaveSupabaseConfig}
                disabled={!supabaseUrl || !supabaseKey || !cloudEmail.trim() || !cloudPassword}
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
                <li>
                  أنشئ مشروع على{' '}
                  <a href="https://supabase.com" target="_blank" rel="noopener" className="underline">
                    supabase.com
                  </a>
                </li>
                <li>
                  اذهب لـ SQL Editor والصق الـ Schema واعمل Run (اضغط "نسخ SQL Schema" أدناه) — فيه تأمين وعزل
                  المستأجرين
                </li>
                <li>
                  فعّل تسجيل الدخول بالبريد: Authentication → Providers → Email، ثم أنشئ مستخدم واحد لمركزك من
                  Authentication → Users → Add user
                </li>
                <li>انسخ Project URL و Anon Key من Settings → API، وضع بريد وكلمة مرور حساب المركز بالأعلى</li>
                <li>اضغط "اختبار الاتصال" ثم "حفظ الإعدادات"</li>
              </ol>
              <button
                onClick={copySchema}
                className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
              >
                📋 نسخ SQL Schema (املأه في SQL Editor)
              </button>
            </div>
          </div>
        )}

        {/* Storage model note */}
        <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm text-gray-600">
          <p>
            <strong className="text-gray-900">النظام يعمل محلياً</strong> — تُحفظ البيانات على هذا الجهاز. عند ربط
            Supabase يمكنك رفع نسخة احتياطية للسحابة أو تنزيلها يدوياً من الأزرار أدناه.
          </p>
        </div>

        {/* Sync buttons */}
        {isCloudEnabled && (
          <div className="flex gap-2">
            <button
              onClick={handleSyncToCloud}
              disabled={syncing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-100 disabled:opacity-50"
            >
              <Upload size={16} /> {syncing ? 'جاري المزامنة...' : 'رفع للسحابة'}
            </button>
            <button
              onClick={handleSyncFromCloud}
              disabled={syncing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-purple-50 text-purple-600 rounded-xl text-sm font-medium hover:bg-purple-100 disabled:opacity-50"
            >
              <Download size={16} /> تنزيل من السحابة
            </button>
          </div>
        )}

        {/* تقرير المزامنة — قبل كده المزامنة كانت بتنجح/تفشل في صمت */}
        {syncReport && (
          <div
            className={`mt-4 rounded-xl border p-4 text-sm ${syncReport.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={`font-bold flex items-center gap-1.5 ${syncReport.ok ? 'text-green-800' : 'text-red-800'}`}
              >
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
                {syncReport.errors.map((e, i) => (
                  <p key={i}>• {e}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {confirmDialog}
    </>
  );
}
