import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCommandTask } from '../hooks/useCommandTask';
import { RuleError } from '../domain/errors';
import { notify } from '../lib/notifications';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => {
    resolve = yes;
  });
  return { resolve, promise };
}
afterEach(() => vi.restoreAllMocks());

describe('shared command lifecycle', () => {
  it('blocks a second write immediately, before React has rendered the busy state', async () => {
    const wait = deferred();
    const first = vi.fn(() => wait.promise);
    const duplicate = vi.fn(async () => {});
    const { result } = renderHook(() => useCommandTask());
    let task!: Promise<unknown>;
    act(() => {
      task = result.current.run(first);
      void result.current.run(duplicate);
    });
    expect(result.current.pending).toBe(true);
    expect(first).toHaveBeenCalledOnce();
    expect(duplicate).not.toHaveBeenCalled();
    await act(async () => {
      wait.resolve();
      await task;
    });
    expect(result.current.pending).toBe(false);
  });
  it('shows domain errors but masks unexpected infrastructure details and permits retry', async () => {
    const error = vi.spyOn(notify, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useCommandTask());
    await act(async () => {
      await result.current.run(async () => {
        throw new RuleError('validation');
      });
    });
    expect(error).toHaveBeenCalledWith('validation');
    await act(async () => {
      await result.current.run(async () => {
        throw new Error('private internal detail');
      });
    });
    expect(error).not.toHaveBeenCalledWith('private internal detail');
    let value: unknown;
    await act(async () => {
      value = await result.current.run(async () => 'done');
    });
    expect(value).toBe('done');
  });
  it('does not cancel committed work on navigation, but blocks new starts after unmount', async () => {
    const wait = deferred();
    const work = vi.fn(() => wait.promise);
    const late = vi.fn(async () => {});
    const { result, unmount } = renderHook(() => useCommandTask());
    const run = result.current.run;
    let task!: Promise<unknown>;
    act(() => {
      task = run(work);
    });
    unmount();
    await act(async () => {
      wait.resolve();
      await task;
    });
    await run(late);
    expect(work).toHaveBeenCalledOnce();
    expect(late).not.toHaveBeenCalled();
  });
});
