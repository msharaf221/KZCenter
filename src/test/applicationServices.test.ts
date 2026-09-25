import 'fake-indexeddb/auto';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { dbClearStore, dbGetById, dbPut } from '../data/records';
import { createUser, removeUser, resetUserPassword, changeOwnPassword, listUsers } from '../services/auth/users';
import { authenticateUser } from '../services/auth/authentication';
import {
  clearLocalSession,
  restoreLocalSession,
  saveLocalSession,
  SESSION_KEY,
  toSessionUser,
} from '../services/auth/session';
import { loadApplicationSettings, updateApplicationSettings } from '../services/settingsService';
import { setSettingsCache } from '../lib/settings';

const password = 'Synthetic!Pass123';
beforeEach(async () => {
  for (const store of ['users', 'settings'] as const) await dbClearStore(store);
  localStorage.clear();
  sessionStorage.clear();
  setSettingsCache(null);
});

describe('settings service', () => {
  it('returns default settings without creating a persistent record', async () => {
    expect(await loadApplicationSettings()).toMatchObject({ id: 'main', darkMode: false, sessionsPerMonth: 8 });
    expect(await dbGetById('settings', 'main')).toBeUndefined();
  });
  it('merges concurrent patches against the fresh row rather than a stale context snapshot', async () => {
    await Promise.all([
      updateApplicationSettings({ centerName: 'Synthetic center' }),
      updateApplicationSettings({ currency: 'USD' }),
    ]);
    expect(await loadApplicationSettings()).toMatchObject({ centerName: 'Synthetic center', currency: 'USD' });
  });
  it('serializes repeated toggles and preserves the singleton id', async () => {
    await Promise.all([
      updateApplicationSettings(s => ({ darkMode: !s.darkMode })),
      updateApplicationSettings(s => ({ darkMode: !s.darkMode })),
    ]);
    expect((await loadApplicationSettings()).darkMode).toBe(false);
    await updateApplicationSettings({ id: 'not-main', receiptPrefix: 'TEST' });
    expect(await dbGetById('settings', 'not-main')).toBeUndefined();
    expect((await loadApplicationSettings()).receiptPrefix).toBe('TEST');
  });
});

describe('user administration service', () => {
  it('hashes credentials, validates strength and retains teacher linkage only for teacher accounts', async () => {
    const teacher = await createUser('synthetic-teacher', password, 'teacher', 'teacher-id');
    expect(teacher.teacherId).toBe('teacher-id');
    expect(teacher.passwordHash).not.toBe(password);
    expect(bcrypt.compareSync(password, teacher.passwordHash)).toBe(true);
    expect((await createUser('synthetic-admin', password, 'admin', 'teacher-id')).teacherId).toBeUndefined();
    await expect(createUser('weak', 'x', 'admin')).rejects.toThrow('ضعيفة');
  });
  it('prevents duplicate names even with simultaneous requests', async () => {
    const outcomes = await Promise.allSettled([
      createUser('same-test-user', password, 'teacher'),
      createUser('same-test-user', password, 'teacher'),
    ]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await listUsers()).toHaveLength(1);
  });
  it('cannot delete the final administrator even when two deletions race', async () => {
    const a = await createUser('admin-a', password, 'admin');
    const b = await createUser('admin-b', password, 'admin');
    const outcomes = await Promise.allSettled([removeUser(a.id), removeUser(b.id)]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await listUsers()).filter(user => user.role === 'admin')).toHaveLength(1);
  });
  it('resets a password without overwriting newer profile fields and requires a change at login', async () => {
    const user = await createUser('synthetic-user', password, 'teacher', 'old-teacher');
    await dbPut('users', { ...user, teacherId: 'updated-teacher' });
    await resetUserPassword(user.id, 'Different!Pass123');
    const fresh = await dbGetById('users', user.id);
    expect(fresh).toMatchObject({ teacherId: 'updated-teacher', mustChangePassword: true });
    const login = await authenticateUser('synthetic-user', 'Different!Pass123');
    expect(login).toMatchObject({ success: true, mustChangePassword: true });
    expect(login.user).not.toHaveProperty('passwordHash');
  });
  it('checks the current password, clears the forced-change flag, and never resurrects a deleted account', async () => {
    const user = await createUser('synthetic-user', password, 'teacher');
    await expect(changeOwnPassword(user.id, 'wrong', 'Another!Pass123')).rejects.toThrow('غير صحيحة');
    await changeOwnPassword(user.id, password, 'Another!Pass123');
    expect((await dbGetById('users', user.id))?.mustChangePassword).toBe(false);
    await removeUser(user.id);
    await expect(resetUserPassword(user.id, password)).rejects.toThrow('غير موجود');
    expect(await dbGetById('users', user.id)).toBeUndefined();
  });
});

describe('local session boundary', () => {
  it('never stores a password hash and clears a previous forced-change flag on a normal login', async () => {
    const user = await createUser('synthetic-user', password, 'teacher');
    saveLocalSession(toSessionUser(user), true);
    expect(sessionStorage.getItem('educenter_must_change_pw')).toBe('true');
    saveLocalSession(toSessionUser(user), false);
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!)).not.toHaveProperty('passwordHash');
    expect(sessionStorage.getItem('educenter_must_change_pw')).toBeNull();
    expect(restoreLocalSession()).toMatchObject({ id: user.id });
    clearLocalSession();
    expect(restoreLocalSession()).toBeNull();
  });
  it('cleans legacy password-bearing sessions and rejects malformed sessions', async () => {
    const user = await createUser('synthetic-user', password, 'teacher');
    saveLocalSession(toSessionUser(user), false);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    expect(restoreLocalSession()).not.toHaveProperty('passwordHash');
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!)).not.toHaveProperty('passwordHash');
    sessionStorage.setItem(SESSION_KEY, '{bad');
    expect(restoreLocalSession()).toBeNull();
  });
});
