import { Clock, FolderOpen, Pause, Play, Settings as SettingsIcon } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { BackupPreferences } from '../../../domain/backup/settings';
import { getContrastColor } from '../../../lib/utils';

export default function BackupPreferencesForm({ preferences, setPreferences, schedulerActive, handleToggleScheduler, handleSaveConfig, primaryColor }: {
  preferences: BackupPreferences; setPreferences: Dispatch<SetStateAction<BackupPreferences>>;
  schedulerActive: boolean; handleToggleScheduler: () => void; handleSaveConfig: () => void; primaryColor: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Clock size={20} /> المجدول التلقائي
        </h3>
        <button
          onClick={handleToggleScheduler}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${schedulerActive
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
            onClick={() => setPreferences({ ...preferences, enabled: !preferences.enabled })}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-colors ${preferences.enabled
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-500'
              }`}
          >
            <span className="text-sm font-medium">
              {preferences.enabled ? 'مفعّل' : 'معطّل'}
            </span>
            <div className={`w-10 h-6 rounded-full transition-colors ${preferences.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow mt-1 transition-transform ${preferences.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
          </button>
        </div>

        <div>
          <label htmlFor="backup-time" className="block text-sm font-semibold text-gray-700 mb-1">وقت النسخ اليومي</label>
          <input
            id="backup-time"
            type="time"
            value={preferences.time}
            onChange={e => setPreferences({ ...preferences, time: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="backup-destination" className="block text-sm font-semibold text-gray-700 mb-1">الوجهة</label>
          <select
            id="backup-destination"
            value={preferences.destination}
            onChange={e => setPreferences({ ...preferences, destination: e.target.value as 'local' | 'cloud' | 'both' })}
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
          <label htmlFor="backup-keep-days" className="block text-sm font-semibold text-gray-700 mb-1">الاحتفاظ بالنسخ (أيام)</label>
          <input
            id="backup-keep-days"
            type="number"
            min="1"
            max="365"
            value={preferences.keepDays}
            onChange={e => setPreferences({ ...preferences, keepDays: parseInt(e.target.value) || 30 })}
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
  );
}
