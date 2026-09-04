import { useState, useEffect } from 'react';
import { Trash2, Download, Search, Filter, Shield } from 'lucide-react';
import Layout from '../components/layout/Layout';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { getAuditEntries, clearAuditLog, AuditEntry } from '../lib/security';
import { useAuth } from '../contexts/AuthContext';
import { formatDate, formatDateTime, toCSV, downloadCSV } from '../lib/utils';
import { notify } from '../lib/notifications';

const ACTION_LABELS: Record<string, string> = {
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  login: 'تسجيل دخول',
  logout: 'تسجيل خروج',
  export: 'تصدير',
  import: 'استيراد',
  backup: 'نسخ احتياطي',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  login: 'bg-indigo-100 text-indigo-700',
  logout: 'bg-gray-100 text-gray-700',
  export: 'bg-purple-100 text-purple-700',
  import: 'bg-orange-100 text-orange-700',
  backup: 'bg-yellow-100 text-yellow-700',
};

export default function AuditLogPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    void loadLog();
    const handler = () => { void loadLog(); };
    window.addEventListener('audit_log_updated', handler);
    return () => window.removeEventListener('audit_log_updated', handler);
  }, []);

  useEffect(() => {
    let filtered = entries;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(e =>
        e.username.toLowerCase().includes(q) ||
        e.entity.toLowerCase().includes(q) ||
        (e.details || '').toLowerCase().includes(q)
      );
    }
    if (actionFilter) {
      filtered = filtered.filter(e => e.action === actionFilter);
    }
    setFilteredEntries(filtered);
  }, [entries, search, actionFilter]);

  async function loadLog() {
    // السجل دلوقتي في IndexedDB (مركزي + بيتنسخ + بيتزامن) مش في localStorage
    const rows = await getAuditEntries();
    setEntries(rows);
  }

  async function handleClear() {
    await clearAuditLog({ userId: user?.id || 'unknown', username: user?.username || 'غير معروف' });
    setShowClearConfirm(false);
    await loadLog();
    notify.success('تم مسح سجل المراجعة');
  }

  function handleExport() {
    const csv = toCSV(entries as unknown as Record<string, unknown>[], [
      { key: 'timestamp', label: 'التاريخ والوقت' },
      { key: 'username', label: 'المستخدم' },
      { key: 'action', label: 'الإجراء' },
      { key: 'entity', label: 'الكيان' },
      { key: 'entityId', label: 'معرف الكيان' },
      { key: 'details', label: 'التفاصيل' },
    ]);
    downloadCSV(csv, `audit_log_${formatDate(new Date().toISOString(), 'YYYY-MM-DD')}.csv`);
    notify.success('تم تصدير السجل');
  }

  return (
    <Layout title="سجل المراجعة">
      <div className="space-y-5">
        {/* Toolbar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-48 relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالمستخدم أو الكيان أو التفاصيل..."
                className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="relative">
              <Filter size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                className="pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">كل الإجراءات</option>
                {Object.entries(ACTION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 mr-auto">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Download size={16} />
                <span className="hidden sm:inline">تصدير CSV</span>
              </button>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-2 px-3 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
              >
                <Trash2 size={16} />
                <span className="hidden sm:inline">مسح الكل</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{entries.length}</p>
            <p className="text-xs text-gray-500">إجمالي السجلات</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-indigo-600">
              {entries.filter(e => e.action === 'login').length}
            </p>
            <p className="text-xs text-gray-500">تسجيلات دخول</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-green-600">
              {entries.filter(e => e.action === 'create').length}
            </p>
            <p className="text-xs text-gray-500">عمليات إنشاء</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-red-600">
              {entries.filter(e => e.action === 'delete').length}
            </p>
            <p className="text-xs text-gray-500">عمليات حذف</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">التاريخ والوقت</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">المستخدم</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الإجراء</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الكيان</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center">
                      <Shield size={48} className="mx-auto mb-3 text-gray-200" />
                      <p className="text-gray-400">لا توجد سجلات</p>
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                        {formatDateTime(entry.timestamp)}
                      </td>
                      <td className="p-4">
                        <span className="text-sm font-medium text-gray-900">{entry.username}</span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[entry.action] || 'bg-gray-100 text-gray-700'}`}>
                          {ACTION_LABELS[entry.action] || entry.action}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-600">{entry.entity}</td>
                      <td className="p-4 text-sm text-gray-500 max-w-xs truncate">{entry.details || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showClearConfirm}
        title="مسح سجل المراجعة"
        message="هل أنت متأكد من مسح جميع السجلات؟ لا يمكن التراجع عن هذا الإجراء."
        onConfirm={handleClear}
        onCancel={() => setShowClearConfirm(false)}
        danger
      />
    </Layout>
  );
}
