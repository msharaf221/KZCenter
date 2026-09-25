import { useCallback } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsyncResource } from '../hooks/useAsyncResource';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('useAsyncResource', () => {
  it('loads on mount and publishes a complete result', async () => {
    const pending = deferred<string>();
    const loader = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useAsyncResource(loader, 'empty'));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe('empty');
    await act(async () => pending.resolve('ready'));
    expect(result.current).toMatchObject({ data: 'ready', loading: false, error: null });
    expect(loader).toHaveBeenCalledOnce();
  });

  it('keeps successful data during refresh and uses one stable reload function', async () => {
    const pending = deferred<string>();
    const loader = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockImplementationOnce(() => pending.promise);
    const { result } = renderHook(() => useAsyncResource<string>(loader, 'empty'));
    await waitFor(() => expect(result.current.data).toBe('first'));
    const reload = result.current.reload;
    let work!: Promise<string | undefined>;
    act(() => {
      work = reload();
    });
    expect(result.current).toMatchObject({ data: 'first', loading: true });
    await act(async () => {
      pending.resolve('second');
      expect(await work).toBe('second');
    });
    expect(result.current.data).toBe('second');
    expect(result.current.reload).toBe(reload);
  });

  it('ignores a slow response from an older search', async () => {
    const old = deferred<string>();
    const latest = deferred<string>();
    const fetch = vi.fn((key: string) => (key === 'old' ? old.promise : latest.promise));
    const { result, rerender } = renderHook(
      ({ key }) =>
        useAsyncResource(
          useCallback(() => fetch(key), [key]),
          'empty',
        ),
      { initialProps: { key: 'old' } },
    );
    rerender({ key: 'new' });
    await act(async () => latest.resolve('new data'));
    await act(async () => old.resolve('obsolete data'));
    expect(result.current).toMatchObject({ data: 'new data', loading: false, error: null });
  });

  it('an obsolete error cannot clear loading or notify while a new request is pending', async () => {
    const old = deferred<string>();
    const latest = deferred<string>();
    const onError = vi.fn();
    const { result, rerender } = renderHook(({ loader }) => useAsyncResource(loader, 'empty', { onError }), {
      initialProps: { loader: () => old.promise },
    });
    rerender({ loader: () => latest.promise });
    await act(async () => old.reject(new Error('obsolete')));
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    await act(async () => latest.resolve('new'));
    expect(result.current.data).toBe('new');
  });

  it('only the latest concurrent refresh is committed', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loader = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result } = renderHook(() => useAsyncResource<string>(loader, 'empty'));
    act(() => {
      void result.current.reload();
    });
    await act(async () => second.resolve('second'));
    await act(async () => first.resolve('first'));
    expect(result.current.data).toBe('second');
  });

  it('exposes errors, keeps data, and recovers on retry without an unhandled rejection', async () => {
    const error = new Error('read failed');
    const onError = vi.fn();
    const loader = vi
      .fn()
      .mockResolvedValueOnce('saved')
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('recovered');
    const { result } = renderHook(() => useAsyncResource<string>(loader, 'empty', { onError }));
    await waitFor(() => expect(result.current.data).toBe('saved'));
    await act(async () => {
      expect(await result.current.reload()).toBeUndefined();
    });
    expect(result.current).toMatchObject({ data: 'saved', loading: false, error });
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current).toMatchObject({ data: 'recovered', error: null, loading: false });
  });

  it('also handles synchronous throws and non-Error rejections', async () => {
    const loader = vi.fn((): Promise<string> => {
      throw 'failure';
    });
    const { result } = renderHook(() => useAsyncResource(loader, 'empty'));
    await waitFor(() => expect(result.current.error?.message).toBe('failure'));
    expect(result.current.loading).toBe(false);
  });

  it('never notifies or starts a saved reload callback after unmount', async () => {
    const pending = deferred<string>();
    const loader = vi.fn(() => pending.promise);
    const onError = vi.fn();
    const { result, unmount } = renderHook(() => useAsyncResource(loader, 'empty', { onError }));
    const reload = result.current.reload;
    unmount();
    await act(async () => pending.reject(new Error('too late')));
    expect(onError).not.toHaveBeenCalled();
    expect(await reload()).toBeUndefined();
    expect(loader).toHaveBeenCalledOnce();
  });

  it('uses current filters when a previously captured reload is called after a mutation', async () => {
    const original = vi.fn().mockResolvedValue('original');
    const latest = vi.fn().mockResolvedValue('latest');
    const { result, rerender } = renderHook(({ loader }) => useAsyncResource<string>(loader, 'empty'), {
      initialProps: { loader: original },
    });
    await waitFor(() => expect(result.current.data).toBe('original'));
    const savedReload = result.current.reload;
    rerender({ loader: latest });
    await waitFor(() => expect(result.current.data).toBe('latest'));
    await act(async () => {
      await savedReload();
    });
    expect(original).toHaveBeenCalledOnce();
    expect(latest).toHaveBeenCalledTimes(2);
  });

  it('does no unauthorized/disabled reads and ignores a request disabled mid-flight', async () => {
    const pending = deferred<string>();
    const loader = vi.fn(() => pending.promise);
    const { result, rerender } = renderHook(({ enabled }) => useAsyncResource(loader, 'empty', { enabled }), {
      initialProps: { enabled: false },
    });
    expect(result.current.loading).toBe(false);
    expect(loader).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(loader).toHaveBeenCalledOnce();
    rerender({ enabled: false });
    await act(async () => pending.resolve('restricted data'));
    expect(result.current).toMatchObject({ data: 'empty', loading: false });
    expect(await result.current.reload()).toBeUndefined();
  });

  it('ignores the first mount attempt in React StrictMode', async () => {
    const old = deferred<string>();
    const latest = deferred<string>();
    const loader = vi
      .fn()
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => latest.promise);
    const { result } = renderHook(() => useAsyncResource<string>(loader, 'empty'), { reactStrictMode: true });
    expect(loader).toHaveBeenCalledTimes(2);
    await act(async () => latest.resolve('latest'));
    await act(async () => old.resolve('obsolete'));
    expect(result.current.data).toBe('latest');
  });
});
