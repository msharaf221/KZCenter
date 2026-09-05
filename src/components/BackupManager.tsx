/**
 * Backup Manager Component
 * مكون إدارة النسخ الاحتياطي
 */

import { useState, useEffect } from 'react';
import {
  Upload, Cloud, HardDrive, Clock,
  CheckCircle, XCircle, RefreshCw, FolderOpen,
  Settings as SettingsIcon, AlertTriangle, Play, Pause
} from 'lucide-react';
import {
  getBackupConfig,
  saveBackupConfig,
  getBackupHistory,
  clearBackupHistory,
  executeBackup,
  restoreBackup,
  startBackupScheduler,
  stopBackupScheduler,
  isBackupOverdue,
  getDataSize,
  BackupConfig,
  BackupLogEntry,
} from '../lib/dailyBackup';
import { useApp } from '../contexts/AppContext';
import { notify } from '../lib/notifications';
import { getContrastColor } from '../lib/utils';

export default function BackupManager() {
  const { settings } = useApp();
  const primaryColor = settings?.primaryColor || '#6366f1';

  const [config, setConfig] = useState<BackupConfig>(getBackupConfig());
  const [history, setHistory] = useState<BackupLogEntry[]>([]);
  const [dataSize, setDataSize] = useState('...');
  const [isRunning, setIsRunning] = useState(false);
  const [schedulerActive, setSchedulerActive] = useState(false);

  async function loadData() {
    setConfig(getBackupConfig());
    setHistory(getBackupHistory().logs);
    const size = await getDataSize();
    setDataSize(size);
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleToggleScheduler() {
    if (schedulerActive) {
      stopBackupScheduler();
      setSchedulerActive(false);
      notify.info('تم إيقاف المجدول');
    } else {
      startBackupScheduler();
      setSchedulerActive(true);
      notify.success('تم تشغيل المجدول');
    }
  }

  async function handleManualBackup(destination: 'local' | 'cloud' | 'both') {
    setIsRunning(true);
    try {
      const result = await executeBackup(destination, true);
      if (result.success) {
        await loadData();
      }
    } finally {
      setIsRunning(false);
    }
  }

  async function handleRestoreFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      if (!confirm('هل أنت متأكد من استعادة هذه النسخة؟ سيتم استبدال جميع البيانات الحالية.')) {
        return;
      }

      const text = await file.text();
      const success = await restoreBackup('file', text);
      if (success) {
        setTimeout(() => window.location.reload(), 1500);
      }
    };
    input.click();
  }

  async function handleRestoreFromLocal() {
    if (!window.electronAPI?.isElectron) {
      notify.error('هذه الميزة متاحة فقط في تطبيق سطح المكتب');
      return;
    }

    const success = await restoreBackup('local');
    if (success) {
      setTimeout(() => window.location.reload(), 1500);
    }
  }

  function handleSaveConfig() {
    saveBackupConfig(config);
    notify.success('تم حفظ إعدادات النسخ الاحتياطي');
  }

  const statusColor = config.lastBackupStatus === 'success' ? 'text-green-600' :
                      config.lastBackupStatus === 'error' ? 'text-red-600' : 'text-gray-400';

  const statusIcon = config.lastBackupStatus === 'success' ? <CheckCircle size={18} /> :
                     config.lastBackupStatus === 'error' ? <XCircle size={18} /> : <Clock size={18} />;

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <HardDrive size={20} /> حالة النسخ الاحتياطي
          </h3>
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 text-sm font-medium ${statusColor}`}>
              {statusIcon}
              {config.lastBackupStatus === 'success' ? 'ناجح' :
               config.lastBackupStatus === 'error' ? 'فاشل' : 'لم يتم بعد'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div className="p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500 mb-1">آخر نسخة</p>
            <p className="text-sm font-medium text-gray-900">
              {config.lastBackupDate
                ? new Date(config.lastBackupDate).toLocaleDateString('ar-EG')
                : 'لم يتم بعد'}
            </p>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500 mb-1">حجم البيانات</p>
            <p className="text-sm font-medium text-gray-900">{dataSize}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500 mb-1">إجمالي النسخ</p>
            <p className="text-sm font-medium text-gray-900">{config.totalBackups}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500 mb-1">المجدول</p>
            <p className="text-sm font-medium text-gray-900">
              {config.enabled ? `يومياً ${config.time}` : 'معطل'}
            </p>
          </div>
        </div>

        {isBackupOverdue() && config.enabled && (
          <div className="p-3 bg-yellow-50 rounded-xl border border-yellow-100 flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-yellow-600" />
            <p className="text-sm text-yellow-700">
              النسخ الاحتياطي متأخر! آخر نسخة كانت منذ أكثر من 24 ساعة.
            </p>
          </div>
        )}

        {config.lastBackupError && (
          <div className="p-3 bg-red-50 rounded-xl border border-red-100 flex items-center gap-2 mb-4">
            <XCircle size={16} className="text-red-600" />
            <p className="text-sm text-red-700">{config.lastBackupError}</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">إجراءات سريعة</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Manual Backup Local */}
          <button
            onClick={() => handleManualBackup('local')}
            disabled={isRunning}
            className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <HardDrive size={20} className="text-blue-600" />
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-blue-900">نسخ احتياطي محلي</p>
              <p className="text-xs text-blue-600">
                {window.electronAPI?.isElectron ? 'حفظ على الجهاز' : 'تحميل الملف'}
              </p>
            </div>
          </button>

          {/* Manual Backup Cloud */}
          <button
            onClick={() => handleManualBackup('cloud')}
            disabled={isRunning}
            className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors disabled:opacity-50"
          >
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Cloud size={20} className="text-purple-600" />
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-purple-900">نسخ احتياطي سحابي</p>
              <p className="text-xs text-purple-600">رفع إلى Supabase</p>
            </div>
          </button>

          {/* Manual Backup Both */}
          <button
            onClick={() => handleManualBackup('both')}
            disabled={isRunning}
            className="flex items-center gap-3 p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <RefreshCw size={20} className={`text-green-600 ${isRunning ? 'animate-spin' : ''}`} />
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-green-900">نسخ احتياطي كامل</p>
              <p className="text-xs text-green-600">محلي + سحابي</p>
            </div>
          </button>

          {/* Restore */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleRestoreFromFile}
              className="flex items-center gap-3 p-4 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors"
            >
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <Upload size={20} className="text-orange-600" />
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-orange-900">استعادة من ملف</p>
                <p className="text-xs text-orange-600">اختيار ملف JSON</p>
              </div>
            </button>

            {window.electronAPI?.isElectron && (
              <button
                onClick={handleRestoreFromLocal}
                className="flex items-center gap-3 p-4 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
              >
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <HardDrive size={20} className="text-indigo-600" />
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-indigo-900">استعادة من الجهاز</p>
                  <p className="text-xs text-indigo-600">من النسخ المحلية</p>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scheduler Settings */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Clock size={20} /> المجدول التلقائي
          </h3>
          <button
            onClick={handleToggleScheduler}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              schedulerActive
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {schedulerActive ? <Pause size={16} /> : <Play size={16} />}
            {schedulerActive ? 'نشط' : 'معطل'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">تفعيل النسخ التلقائي</label>
            <button
              onClick={() => setConfig({ ...config, enabled: !config.enabled })}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-colors ${
                config.enabled
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-500'
              }`}
            >
              <span className="text-sm font-medium">
                {config.enabled ? 'مفعّل' : 'معطّل'}
              </span>
              <div className={`w-10 h-6 rounded-full transition-colors ${config.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow mt-1 transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">وقت النسخ اليومي</label>
            <input
              type="time"
              value={config.time}
              onChange={e => setConfig({ ...config, time: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الوجهة</label>
            <select
              value={config.destination}
              onChange={e => setConfig({ ...config, destination: e.target.value as 'local' | 'cloud' | 'both' })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="local">محلي فقط</option>
              <option value="cloud">سحابي فقط</option>
              <option value="both">محلي + سحابي</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الاحتفاظ بالنسخ (أيام)</label>
            <input
              type="number"
              min="1"
              max="365"
              value={config.keepDays}
              onChange={e => setConfig({ ...config, keepDays: parseInt(e.target.value) || 30 })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {window.electronAPI?.isElectron && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">مسار النسخ الاحتياطية</label>
              <button
                onClick={() => window.electronAPI?.backup.openFolder()}
                className="w-full flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <FolderOpen size={16} />
                <span className="truncate">فتح مجلد النسخ الاحتياطية</span>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleSaveConfig}
          className="flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium transition-colors"
          style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
        >
          <SettingsIcon size={16} /> حفظ الإعدادات
        </button>
      </div>

      {/* Backup History */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">سجل النسخ الاحتياطية</h3>
          <button
            onClick={() => { clearBackupHistory(); setHistory([]); }}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            مسح السجل
          </button>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-8">
            <Clock size={48} className="mx-auto mb-3 text-gray-200" />
            <p className="text-gray-400">لا توجد نسخ احتياطية بعد</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {history.slice(0, 20).map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  {entry.status === 'success' ? (
                    <CheckCircle size={16} className="text-green-500" />
                  ) : (
                    <XCircle size={16} className="text-red-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {entry.destination === 'both' ? 'محلي + سحابي' :
                       entry.destination === 'local' ? 'محلي' : 'سحابي'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(entry.date).toLocaleString('ar-EG')}
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-xs text-gray-500">
                    {(entry.size / 1024).toFixed(1)} KB
                  </p>
                  <p className="text-xs text-gray-400">
                    {(entry.duration / 1000).toFixed(1)}s
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
