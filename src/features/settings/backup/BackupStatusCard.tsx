import { AlertTriangle, CheckCircle, Clock, HardDrive, XCircle } from 'lucide-react';
import { backupOverdue } from '../../../domain/backup/schedule';
import type { BackupConfig } from '../../../domain/backup/settings';

export default function BackupStatusCard({ config, dataSize, schedulerActive }: {
  config: BackupConfig; dataSize: string; schedulerActive: boolean;
}) {
  const statusColor = config.lastBackupStatus === 'success' ? 'text-green-600' : config.lastBackupStatus === 'error' ? 'text-red-600' : 'text-gray-400';
  const statusIcon = config.lastBackupStatus === 'success' ? <CheckCircle size={18} /> : config.lastBackupStatus === 'error' ? <XCircle size={18} /> : <Clock size={18} />;
  return (
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
            {schedulerActive && config.enabled ? `يومياً ${config.time}` : 'معطل'}
          </p>
        </div>
      </div>

      {backupOverdue(config, new Date()) && config.enabled && (
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
  );
}
