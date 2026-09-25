import { useCallback, useState, type SetStateAction } from 'react';
import { notify } from '../lib/notifications';
import { useAsyncResource } from './useAsyncResource';

/** An editable draft belongs to one accepted read snapshot, not just a reused form component. */
export function useResourceDraft<T>(scope: string, loader: () => Promise<T>, initial: T, enabled = true) {
  const query = useCallback(async () => ({ scope, value: await loader() }), [scope, loader]);
  const resource = useAsyncResource(
    query,
    { scope: '', value: initial },
    {
      enabled,
      onError: () => notify.error('تعذّر تحميل البيانات. حاول مرة أخرى.'),
    },
  );
  const [draft, setDraft] = useState<{ source: typeof resource.data; value: T } | null>(null);
  const ready = enabled && !resource.loading && !resource.error && resource.data.scope === scope;
  const value = ready ? (draft?.source === resource.data ? draft.value : resource.data.value) : initial;
  const setValue = (action: SetStateAction<T>) => {
    if (!ready) return;
    setDraft(previous => {
      const current = previous?.source === resource.data ? previous.value : resource.data.value;
      return {
        source: resource.data,
        value: typeof action === 'function' ? (action as (value: T) => T)(current) : action,
      };
    });
  };
  return { value, setValue, ready, loading: resource.loading, error: resource.error, reload: resource.reload };
}
