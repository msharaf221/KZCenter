import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface AsyncResourceOptions {
  enabled?: boolean;
  onError?: (error: Error) => void;
}

/**
 * A latest-request-wins read resource. Memoize parameterized loaders with useCallback.
 * Keeps the last successful data during refresh/error, ignores obsolete responses,
 * and never commits after unmount. It does not cancel database writes/transactions.
 */
export function useAsyncResource<T>(
  loader: () => Promise<T>,
  initialData: T,
  { enabled = true, onError }: AsyncResourceOptions = {},
) {
  const [state, setState] = useState(() => ({ data: initialData, loading: enabled, error: null as Error | null }));
  const current = useRef({ loader, enabled });
  const errorHandler = useRef(onError);
  const mounted = useRef(false);
  const requestId = useRef(0);

  const invalidate = useCallback(() => {
    requestId.current++;
  }, []);

  // Invalidate during commit, before an old promise can publish between render and passive effects.
  useLayoutEffect(() => {
    current.current = { loader, enabled };
    mounted.current = true;
    invalidate();
    return () => {
      mounted.current = false;
      invalidate();
    };
  }, [loader, enabled, invalidate]);

  useLayoutEffect(() => {
    errorHandler.current = onError;
  }, [onError]);

  // Stable even when filters change: an awaited save holding an old reload callback uses current filters.
  const reload = useCallback(async (): Promise<T | undefined> => {
    if (!mounted.current || !current.current.enabled) return undefined;
    const request = ++requestId.current;
    const isCurrent = () => mounted.current && request === requestId.current;
    setState(previous => ({ ...previous, loading: true, error: null }));
    try {
      const data = await current.current.loader();
      if (!isCurrent()) return undefined;
      setState({ data, loading: false, error: null });
      return data;
    } catch (cause) {
      if (!isCurrent()) return undefined;
      const error =
        cause instanceof Error ? cause : new Error(typeof cause === 'string' ? cause : 'تعذّر تحميل البيانات');
      setState(previous => ({ ...previous, loading: false, error }));
      errorHandler.current?.(error);
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
    else setState(previous => (previous.loading ? { ...previous, loading: false } : previous));
  }, [loader, enabled, reload]);

  return { ...state, reload };
}
