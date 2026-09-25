import { requireRule } from '../errors';

export type BackupRow = Record<string, unknown> & { id: string };
export interface BackupPlan { tables: { store: string; rows: BackupRow[] }[]; settings?: BackupRow }
export const backupKey = (store: string) => store === 'inventory_transactions' ? 'inventoryTransactions' : store;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function assertRow(value: unknown, store: string): asserts value is BackupRow {
  requireRule(isObject(value) && typeof value.id === 'string' && value.id.length > 0, `سجل غير صالح في النسخة الاحتياطية: ${store}`);
}

/** Validate the complete requested restore before clearing anything; omitted stores are untouched. */
export function planBackupImport(data: unknown, stores: readonly string[], version: number, requireCore = false): BackupPlan {
  requireRule(isObject(data), 'ملف النسخة الاحتياطية غير صالح');
  if (data.version !== undefined) requireRule(typeof data.version === 'number' && Number.isInteger(data.version) && data.version > 0 && data.version <= version, 'إصدار النسخة الاحتياطية غير مدعوم');
  if (requireCore) for (const store of ['students', 'teachers', 'courses', 'groups']) requireRule(Array.isArray(data[store]), 'ملف النسخة الاحتياطية غير صالح');
  const tables: BackupPlan['tables'] = [];
  for (const store of stores) {
    const key = backupKey(store);
    if (!Object.prototype.hasOwnProperty.call(data, key) && !Object.prototype.hasOwnProperty.call(data, store)) continue;
    const rows = data[key] ?? data[store];
    requireRule(Array.isArray(rows), `بيانات ${store} في النسخة الاحتياطية ليست قائمة`);
    for (const row of rows) assertRow(row, store);
    tables.push({ store, rows });
  }
  let settings: BackupRow | undefined;
  if (data.settings !== undefined && data.settings !== null) {
    assertRow(data.settings, 'settings');
    requireRule(data.settings.id === 'main', 'مفتاح إعدادات النسخة الاحتياطية غير صالح');
    settings = data.settings;
  }
  return { tables, settings };
}
