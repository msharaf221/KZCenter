import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTableImport } from '../features/imports/useTableImport';
import { importTableIntoDb } from '../services/imports/table';
import { linkOrphans } from '../services/imports/linking';
import { auditData } from '../services/maintenance/quality';
import { notify } from '../lib/notifications';
import type { TableImportReport } from '../domain/imports/types';

vi.mock('../contexts/AppContext', () => ({ useApp: () => ({ settings: {} }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'test-admin', username: 'Synthetic', role: 'admin' }, can: () => true }) }));
vi.mock('../features/imports/useFilePreview', () => ({ useFilePreview: () => ({ parsed: { records: [] }, parsing: false, fileName: 'synthetic.csv', selectFile: vi.fn() }) }));
vi.mock('../services/imports/table', () => ({ importTableIntoDb: vi.fn() }));
vi.mock('../services/imports/linking', () => ({ linkOrphans: vi.fn() }));
vi.mock('../services/maintenance/quality', () => ({ auditData: vi.fn() }));
vi.mock('../lib/notifications', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
const report: TableImportReport = { studentsCreated: 1, studentsExisting: 0, studentsMatchedByPhone: 0, teachersCreated: 0, teachersExisting: 0, coursesCreated: 0, coursesExisting: 0, groupsCreated: 0, groupsExisting: 0, enrollmentsCreated: 0, enrollmentsSkipped: 0, priceOverrides: 0, rowsWithoutSubject: 0, subjectsUsed: [], errors: [] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(importTableIntoDb).mockResolvedValue(report);
  vi.mocked(linkOrphans).mockResolvedValue({ courses: 0, groups: 0 });
  vi.mocked(auditData).mockRejectedValue(new Error('Synthetic audit read failure'));
});
afterEach(() => vi.restoreAllMocks());
it.each(['link', 'audit'] as const)('keeps an accepted import report when %s aftercare fails', async phase => {
  if (phase === 'link') vi.mocked(linkOrphans).mockRejectedValueOnce(new Error('Synthetic linking failure'));
  const done = vi.fn();
  const { result } = renderHook(() => useTableImport(false, done));
  await act(async () => { await result.current.runImport(); });
  expect(result.current.report).toEqual(report);
  expect(result.current.busy).toBe(false);
  expect(result.current.progress?.label).toContain('الفحص غير مكتمل');
  expect(notify.warning).toHaveBeenCalledWith(expect.stringContaining('لا تعيد الاستيراد'));
  expect(notify.error).not.toHaveBeenCalled();
  expect(done).toHaveBeenCalledOnce();
  expect(importTableIntoDb).toHaveBeenCalledOnce();
});
it('reports actual import failure as a failure, not accepted aftercare', async () => {
  vi.mocked(importTableIntoDb).mockRejectedValueOnce(new Error('Synthetic import failure'));
  const done = vi.fn(), { result } = renderHook(() => useTableImport(false, done));
  await act(async () => { await result.current.runImport(); });
  expect(result.current.report).toBeNull(); expect(done).not.toHaveBeenCalled();
  expect(notify.error).toHaveBeenCalledOnce(); expect(notify.warning).not.toHaveBeenCalled();
});
it('does not invoke a throwing view-refresh callback twice after a completed import', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const done = vi.fn(() => { throw new Error('Synthetic refresh failure'); });
  const { result } = renderHook(() => useTableImport(false, done));
  await act(async () => { await result.current.runImport(); });
  expect(done).toHaveBeenCalledOnce(); expect(result.current.report).toEqual(report);
  expect(notify.error).not.toHaveBeenCalled();
});
