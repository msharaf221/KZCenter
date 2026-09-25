// ==================== REPORTS ====================

export interface TableSyncResult {
  table: string;
  pushed: number;
  pulled: number;
  skipped: number;
  error?: string;
}

export interface SyncReport {
  ok: boolean;
  direction: 'push' | 'pull';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  tables: TableSyncResult[];
  errors: string[];
  /** إجمالي الصفوف اللي اتأثرت */
  total: number;
}

export function emptyReport(direction: 'push' | 'pull', startedAt: string): SyncReport {
  return {
    ok: true,
    direction,
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    tables: [],
    errors: [],
    total: 0,
  };
}

/** ملخص مقروء للتقرير (يُعرض في الإعدادات) */
export function formatSyncReport(report: SyncReport): string {
  const label = report.direction === 'push' ? 'رفع للسحابة' : 'تنزيل من السحابة';
  const lines = [
    `${label} — ${report.ok ? 'نجح' : 'فشل جزئياً'}`,
    `الصفوف: ${report.total} · المدة: ${(report.durationMs / 1000).toFixed(1)}ث`,
  ];
  for (const t of report.tables) {
    if (t.pushed || t.pulled || t.error) {
      lines.push(
        `  • ${t.table}: ${t.pushed ? `رفع ${t.pushed}` : ''}${t.pulled ? ` تنزيل ${t.pulled}` : ''}${t.skipped ? ` (تخطى ${t.skipped} أقدم)` : ''}${t.error ? ` ❌ ${t.error}` : ''}`,
      );
    }
  }
  if (report.errors.length) lines.push(`الأخطاء: ${report.errors.join(' | ')}`);
  return lines.join('\n');
}
