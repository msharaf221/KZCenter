import { act, renderHook, waitFor } from '@testing-library/react';
import { useCallback } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useResourceDraft } from '../hooks/useResourceDraft';
import { useFilePreview, type FilePreview } from '../features/imports/useFilePreview';
import { notify } from '../lib/notifications';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
}
afterEach(() => vi.restoreAllMocks());

describe('scoped editable resources', () => {
  it('never carries an attendance/grade draft into a different selection or a fresh snapshot', async () => {
    const read = vi.fn(async (scope: string) => ({ [scope]: 1 }));
    const { result, rerender } = renderHook(
      ({ scope }) =>
        useResourceDraft(
          scope,
          useCallback(() => read(scope), [scope]),
          {},
        ),
      { initialProps: { scope: 'first' } },
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setValue({ first: 80 }));
    expect(result.current.value).toEqual({ first: 80 });
    rerender({ scope: 'second' });
    expect(result.current.value).toEqual({});
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.value).toEqual({ second: 1 });
    act(() => result.current.setValue({ second: 90 }));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.value).toEqual({ second: 1 });
  });
  it('rejects edits while data is disabled or loading', async () => {
    const read = vi.fn(async () => ({ score: 10 }));
    const { result } = renderHook(() => useResourceDraft<Record<string, number>>('exam', read, {}, false));
    act(() => result.current.setValue({ score: 99 }));
    expect(result.current.ready).toBe(false);
    expect(result.current.value).toEqual({});
    expect(read).not.toHaveBeenCalled();
  });
});

describe('file preview isolation', () => {
  it('only imports the selected file even when an older Excel parse finishes last', async () => {
    const first = deferred<FilePreview<string>>();
    const second = deferred<FilePreview<string>>();
    const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useFilePreview(true, read));
    act(() => result.current.selectFile(new File([''], 'first.xlsx')));
    act(() => result.current.selectFile(new File([''], 'second.xlsx')));
    expect(result.current.parsed).toBeNull();
    await act(async () => {
      second.resolve({ parsed: 'second' });
    });
    await act(async () => {
      first.resolve({ parsed: 'first' });
    });
    expect(result.current).toMatchObject({ parsed: 'second', fileName: 'second.xlsx', parsing: false });
  });
  it('clears the previous preview immediately when selecting a new file', async () => {
    const pending = deferred<FilePreview<string>>();
    const read = vi.fn().mockResolvedValueOnce({ parsed: 'old' }).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useFilePreview(true, read));
    act(() => result.current.selectFile(new File([''], 'old.csv')));
    await waitFor(() => expect(result.current.parsed).toBe('old'));
    act(() => result.current.selectFile(new File([''], 'new.csv')));
    expect(result.current.parsed).toBeNull();
    await act(async () => {
      pending.resolve({ parsed: 'new' });
    });
    expect(result.current.parsed).toBe('new');
  });
  it('does not publish errors after closing a dialog', async () => {
    const error = vi.spyOn(notify, 'error').mockImplementation(() => {});
    const pending = deferred<FilePreview<string>>();
    const read = vi.fn(() => pending.promise);
    const { result, rerender } = renderHook(({ open }) => useFilePreview(open, read), { initialProps: { open: true } });
    act(() => result.current.selectFile(new File([''], 'test.xlsx')));
    rerender({ open: false });
    await act(async () => {
      pending.reject(new Error('late failure'));
    });
    expect(error).not.toHaveBeenCalled();
    expect(result.current.parsed).toBeNull();
  });
  it('warns only for the accepted preview and supports reselecting the same file', async () => {
    const error = vi.spyOn(notify, 'error').mockImplementation(() => {});
    const read = vi.fn(async () => ({ parsed: null, warning: 'test warning' }));
    const { result } = renderHook(() => useFilePreview(true, read));
    const file = new File([''], 'same.csv');
    act(() => result.current.selectFile(file));
    await waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    act(() => result.current.selectFile(file));
    await waitFor(() => expect(error).toHaveBeenCalledTimes(2));
    expect(read).toHaveBeenCalledTimes(2);
  });
});
