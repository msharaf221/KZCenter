import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbAdd, dbClearStore, dbGetById } from '../data/records';
import { resetLocalDatabase } from '../services/localRecoveryService';
import { authenticateUser } from '../services/auth/authentication';
import { payrollStudent } from './helpers/payroll';

vi.mock('../services/auth/authentication', () => ({ authenticateUser: vi.fn() }));
beforeEach(async () => {
  await dbClearStore('students');
  await dbAdd('students', payrollStudent());
  sessionStorage.clear();
  vi.mocked(authenticateUser).mockReset();
});

describe('explicit local recovery', () => {
  it('requires both confirmation and real administrator authentication before touching data', async () => {
    await expect(resetLocalDatabase('test', 'synthetic', false)).rejects.toThrow('تأكيد');
    expect(authenticateUser).not.toHaveBeenCalled();
    vi.mocked(authenticateUser).mockResolvedValueOnce({ success: false });
    await expect(resetLocalDatabase('test', 'synthetic', true)).rejects.toThrow('مسؤول');
    vi.mocked(authenticateUser).mockResolvedValueOnce({
      success: true,
      user: { id: 'teacher', username: 'test', role: 'teacher', createdAt: '', updatedAt: '' },
    });
    await expect(resetLocalDatabase('test', 'synthetic', true)).rejects.toThrow('مسؤول');
    expect(await dbGetById('students', 'student-1')).toBeDefined();
  });
  it('closes its connection and clears only the local database/session after confirmed authorization', async () => {
    vi.mocked(authenticateUser).mockResolvedValueOnce({
      success: true,
      user: { id: 'admin', username: 'test', role: 'admin', createdAt: '', updatedAt: '' },
    });
    sessionStorage.setItem('educenter_session', 'synthetic-session');
    await resetLocalDatabase('test', 'synthetic', true);
    expect(await dbGetById('students', 'student-1')).toBeUndefined();
    expect(sessionStorage.getItem('educenter_session')).toBeNull();
  });
});
