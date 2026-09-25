import { CheckCircle, Clock, XCircle } from 'lucide-react';
import type { BackupLogEntry } from '../../../domain/backup/settings';

export default function BackupHistoryList({ history, onClear }: { history: BackupLogEntry[]; onClear: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">سجل النسخ الاحتياطية</h3>
        <button
          onClick={onClear}
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
  );
}
