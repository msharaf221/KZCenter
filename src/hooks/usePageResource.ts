import { notify } from '../lib/notifications';
import { useAsyncResource } from './useAsyncResource';

function reportLoadError() {
  notify.error('تعذّر تحميل البيانات. حاول مرة أخرى.');
}

/** Standard page reads share race/unmount protection and an actionable error notification. */
export function usePageResource<T>(loader: () => Promise<T>, initialData: T) {
  return useAsyncResource(loader, initialData, { onError: reportLoadError });
}
