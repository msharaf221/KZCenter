import 'fake-indexeddb/auto';
import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { AppProvider, useApp } from '../contexts/AppContext';
import { dbClearStore, dbGetById } from '../data/records';
import { authenticateUser, initializeAuthentication, type LoginAttempt } from '../services/auth/authentication';
import { setSettingsCache } from '../lib/settings';

vi.mock('../services/auth/authentication', () => ({
  authenticateUser: vi.fn(),
  initializeAuthentication: vi.fn(async () => {}),
}));
vi.mock('../lib/notifications', async original => ({
  ...(await original<typeof import('../lib/notifications')>()),
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {
    resolve = yes;
  });
  return { resolve, promise };
}
const authWrapper = ({ children }: PropsWithChildren) => <AuthProvider>{children}</AuthProvider>;
const appWrapper = ({ children }: PropsWithChildren) => <AppProvider>{children}</AppProvider>;
const success = (id: string): LoginAttempt => ({
  success: true,
  user: { id, username: id, role: 'admin', createdAt: '2026-09-24', updatedAt: '2026-09-24' },
});

beforeEach(async () => {
  for (const store of ['users', 'settings', 'audit_logs'] as const) await dbClearStore(store);
  localStorage.clear();
  sessionStorage.clear();
  setSettingsCache(null);
  vi.mocked(authenticateUser).mockReset();
  vi.mocked(initializeAuthentication).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('authentication lifecycle', () => {
  it('a pending login cannot recreate a session after logout', async () => {
    const pending = deferred<LoginAttempt>();
    vi.mocked(authenticateUser).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useAuth(), { wrapper: authWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let task!: Promise<unknown>;
    act(() => {
      task = result.current.login('test-a', 'synthetic');
    });
    act(() => result.current.logout());
    await act(async () => {
      pending.resolve(success('test-a'));
      await task;
    });
    expect(result.current.user).toBeNull();
    expect(sessionStorage.getItem('educenter_session')).toBeNull();
  });
  it('only the latest successful authentication publishes its user', async () => {
    const a = deferred<LoginAttempt>();
    const b = deferred<LoginAttempt>();
    vi.mocked(authenticateUser).mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { result } = renderHook(() => useAuth(), { wrapper: authWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = result.current.login('test-a', 'synthetic');
      second = result.current.login('test-b', 'synthetic');
    });
    await act(async () => {
      b.resolve(success('test-b'));
      await second;
    });
    await act(async () => {
      a.resolve(success('test-a'));
      await first;
    });
    expect(result.current.user?.id).toBe('test-b');
    expect(JSON.parse(sessionStorage.getItem('educenter_session')!).id).toBe('test-b');
  });
  it('never persists a session for an unmounted provider, including StrictMode', async () => {
    const pending = deferred<LoginAttempt>();
    vi.mocked(authenticateUser).mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useAuth(), { wrapper: authWrapper, reactStrictMode: true });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let task!: Promise<unknown>;
    act(() => {
      task = result.current.login('test-a', 'synthetic');
    });
    unmount();
    await act(async () => {
      pending.resolve(success('test-a'));
      await task;
    });
    expect(sessionStorage.getItem('educenter_session')).toBeNull();
  });
});

describe('settings provider', () => {
  it('publishes defaults and applies saved settings/theme through the same service', async () => {
    const { result } = renderHook(() => useApp(), { wrapper: appWrapper });
    await waitFor(() => expect(result.current.settings?.id).toBe('main'));
    await act(async () => {
      await result.current.updateSettings({ primaryColor: '#abcdef', fontSize: 'lg', darkMode: true });
    });
    await waitFor(() => expect(result.current.darkMode).toBe(true));
    expect(document.documentElement).toHaveClass('dark', 'font-lg');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#abcdef');
    expect(await dbGetById('settings', 'main')).toMatchObject({ primaryColor: '#abcdef' });
  });
  it('preserves unrelated concurrent updates through the public context API', async () => {
    const { result } = renderHook(() => useApp(), { wrapper: appWrapper });
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    await act(async () => {
      await Promise.all([
        result.current.updateSettings({ centerName: 'Synthetic Center' }),
        result.current.updateSettings({ currency: 'USD' }),
      ]);
    });
    await waitFor(() =>
      expect(result.current.settings).toMatchObject({ centerName: 'Synthetic Center', currency: 'USD' }),
    );
  });
});
