import { Cloud, HardDrive, RefreshCw, Upload } from 'lucide-react';
import type { BackupDestination } from '../../../domain/backup/settings';

export default function BackupActions({ isRunning, handleManualBackup, handleRestoreFromFile, handleRestoreFromLocal }: {
  isRunning: boolean;
  handleManualBackup: (destination: BackupDestination) => Promise<void>;
  handleRestoreFromFile: () => void;
  handleRestoreFromLocal: () => Promise<void>;
}) {
  return (
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
            disabled={isRunning}
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
              disabled={isRunning}
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
  );
}
