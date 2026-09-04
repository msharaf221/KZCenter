/**
 * سلة المحذوفات (Recycle Bin)
 *
 * كل الحذف في النظام ناعم (`deleted: true`) — يعني البيانات لسه موجودة في القاعدة،
 * لكن قبل كده ما كانش فيه أي طريقة تشوفها أو ترجّعها. دلوقتي فيه.
 */
import { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, XCircle, Search } from 'lucide-react';
import Layout from '../components/layout/Layout';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { getTrash, restoreFromTrash, purgeFromTrash, purgeStore, STORE_LABEL, TRASHABLE_STORES, TrashItem } from '../lib/trash';
import type { StoreName } from '../lib/db';
import { formatDateTime } from '../lib/utils';
import { notify } from '../lib/notifications';
import { addAuditEntry } from '../lib/security';
import { useAuth } from '../contexts/AuthContext';

export default function TrashPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeFilter, setStoreFilter] = useState<StoreName | ''>('');
  const [search, setSearch] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<TrashItem | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);
  const [purgeStoreTarget, setPurgeStoreTarget] = useState<StoreName | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getTrash(storeFilter ? [storeFilter] : undefined);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [storeFilter]);

  useEffect(() => { void load(); }, [load]);

  const filtered = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.label.toLowerCase().includes(q) || i.storeLabel.toLowerCase().includes(q) || i.id.toLowerCase().includes(q);
  });

  const counts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.store] = (acc[i.store] || 0) + 1;
    return acc;
  }, {});

  async function handleRestore() {
    if (!restoreTarget) return;
    const r = await restoreFromTrash(restoreTarget.store, restoreTarget.id);
    if (!r.success) { notify.error(r.error || 'تعذّر الاسترجاع'); return; }

    addAuditEntry({
      userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
      action: 'restore', entity: restoreTarget.store, entityId: restoreTarget.id,
      details: `استرجاع من سلة المحذوفات: ${restoreTarget.label}`,
    });
    notify.success('تم استرجاع العنصر');
    setRestoreTarget(null);
    await load();
  }

  async function handlePurge() {
    if (!purgeTarget) return;
    const r = await purgeFromTrash(purgeTarget.store, purgeTarget.id);
    if (!r.success) { notify.error(r.error || 'تعذّر الحذف النهائي'); return; }

    addAuditEntry({
      userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
      action: 'delete', entity: purgeTarget.store, entityId: purgeTarget.id,
      details: `حذف نهائي من سلة المحذوفات: ${purgeTarget.label}`,
    });
    notify.success('تم الحذف نهائياً');
    setPurgeTarget(null);
    await load();
  }

  async function handlePurgeStore() {
    if (!purgeStoreTarget) return;
    const n = await purgeStore(purgeStoreTarget);
    addAuditEntry({
      userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
      action: 'delete', entity: purgeStoreTarget,
      details: `تفريغ سلة المحذوفات لـ ${STORE_LABEL[purgeStoreTarget]} (${n} عنصر) — حذف نهائي`,
    });
    notify.success(`تم حذف ${n} عنصر نهائياً`);
    setPurgeStoreTarget('');
    await load();
  }

  return (
    <Layout title="سلة المحذوفات">
      <div className="space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-2">
          <Trash2 size={17} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800 leading-relaxed">
            كل الحذف في النظام «ناعم» — البيانات بتفضل محفوظة هنا ويمكن استرجاعها.
            <b> الحذف النهائي</b> لا رجعة فيه، فاستخدمه بحذر.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-48 relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث في المحذوفات..."
                className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <select value={storeFilter} onChange={e => setStoreFilter(e.target.value as StoreName | '')}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">كل الأنواع ({items.length})</option>
              {TRASHABLE_STORES.filter(s => counts[s]).map(s => (
                <option key={s} value={s}>{STORE_LABEL[s] || s} ({counts[s]})</option>
              ))}
            </select>

            {storeFilter && counts[storeFilter] > 0 && (
              <button onClick={() => setPurgeStoreTarget(storeFilter)}
                className="flex items-center gap-2 px-3 py-2.5 border border-red-200 text-red-700 rounded-xl text-sm hover:bg-red-50">
                <XCircle size={15} /> حذف نهائي للكل
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center">
              <div className="text-5xl mb-3">🗑️</div>
              <p className="text-gray-500 font-medium">سلة المحذوفات فاضية</p>
              <p className="text-xs text-gray-400 mt-1">أي حاجة تتحذف هتظهر هنا ويمكن استرجاعها</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-right text-xs text-gray-500">
                    <th className="px-4 py-3 font-medium">النوع</th>
                    <th className="px-4 py-3 font-medium">العنصر</th>
                    <th className="px-4 py-3 font-medium">اتحذف</th>
                    <th className="px-4 py-3 font-medium">بواسطة</th>
                    <th className="px-4 py-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map(item => (
                    <tr key={`${item.store}-${item.id}`} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {item.storeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{item.label}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {item.deletedAt ? formatDateTime(item.deletedAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {String(item.raw.deletedBy || '—')}
                        {item.raw.deleteReason ? <span className="block text-gray-400">{String(item.raw.deleteReason)}</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setRestoreTarget(item)}
                            className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="استرجاع">
                            <RotateCcw size={15} />
                          </button>
                          <button onClick={() => setPurgeTarget(item)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="حذف نهائي">
                            <XCircle size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 200 && (
            <p className="p-3 text-center text-xs text-gray-400 border-t border-gray-50">
              معروض أول 200 من {filtered.length} — استخدم الفلتر أو البحث
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!restoreTarget}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={handleRestore}
        title="استرجاع العنصر"
        message={`هترجع «${restoreTarget?.label || ''}» (${restoreTarget?.storeLabel})؟ الأرصدة وحالات المجموعات هتتحسب من جديد تلقائياً.`}
        confirmLabel="استرجاع"
      />

      <ConfirmDialog
        isOpen={!!purgeTarget}
        onCancel={() => setPurgeTarget(null)}
        onConfirm={handlePurge}
        title="حذف نهائي ⚠️"
        message={`«${purgeTarget?.label || ''}» هتتمسح من القاعدة نهائياً. الإجراء ده ما ينفعش يتراجع عنه.`}
        confirmLabel="حذف نهائي"
        danger
      />

      <ConfirmDialog
        isOpen={!!purgeStoreTarget}
        onCancel={() => setPurgeStoreTarget('')}
        onConfirm={handlePurgeStore}
        title="تفريغ السلة ⚠️"
        message={`كل المحذوفات في «${purgeStoreTarget ? STORE_LABEL[purgeStoreTarget] : ''}» (${counts[purgeStoreTarget || ''] || 0} عنصر) هتتمسح نهائياً.`}
        confirmLabel="حذف الكل نهائياً"
        danger
      />
    </Layout>
  );
}
