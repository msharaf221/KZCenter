import { readAll } from '../../data/readers';
import { dbPut } from '../../data/records';
import type { SyncReport } from '../../domain/sync/report';
import { notify } from '../../lib/notifications';
import { createSyncEngine } from './engine';
import type { SyncLocal, SyncRow } from './ports';
import { createCloudTransport } from './transport';

const local: SyncLocal = {
  read: table => readAll<SyncRow>(table, { includeDeleted: true }),
  write: (table, row) => dbPut(table, row),
};

async function synchronize(direction: 'push' | 'pull', opts?: { silent?: boolean }): Promise<SyncReport> {
  let toastId: string | undefined;
  try {
    const run = createSyncEngine(local, createCloudTransport());
    const report = await run(direction, () => {
      if (!opts?.silent)
        toastId = notify.loading(
          direction === 'push' ? 'جاري رفع البيانات للسحابة...' : 'جاري تنزيل البيانات من السحابة...',
        );
    });
    if (!opts?.silent) {
      if (report.ok) notify.success(`تم ${direction === 'push' ? 'رفع' : 'تنزيل'} ${report.total} صف بنجاح`);
      else notify.error(`فشلت المزامنة: ${report.errors[0] || 'خطأ غير معروف'}`);
    }
    return report;
  } finally {
    if (toastId) notify.dismiss(toastId);
  }
}

export function syncLocalToCloud(opts?: { silent?: boolean }): Promise<SyncReport> {
  return synchronize('push', opts);
}
export function syncCloudToLocal(opts?: { silent?: boolean }): Promise<SyncReport> {
  return synchronize('pull', opts);
}
