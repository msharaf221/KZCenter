import { useCallback, useEffect, useRef, useState } from 'react';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { notify } from '../../lib/notifications';

export interface FilePreview<T> {
  parsed: T | null;
  warning?: string;
}
const reportError = (error: Error) => notify.error(`ماقدرتش أقرا الملف: ${error.message}`);

/** A preview is tied to the selected File, never to whichever read happens to finish last. */
export function useFilePreview<T>(open: boolean, read: (file: File) => Promise<FilePreview<T>>) {
  const [selection, setSelection] = useState<{ file: File } | null>(null);
  const query = useCallback(
    async () => ({ selection, result: selection ? await read(selection.file) : { parsed: null } }),
    [selection, read],
  );
  const resource = useAsyncResource(
    query,
    { selection: null, result: { parsed: null } },
    { enabled: open && !!selection, onError: reportError },
  );
  const notified = useRef<typeof resource.data | null>(null);
  useEffect(() => {
    if (open && resource.data.selection === selection && resource.data !== notified.current) {
      notified.current = resource.data;
      if (resource.data.result.warning) notify.error(resource.data.result.warning);
    }
  }, [open, resource.data, selection]);
  const parsed =
    selection && resource.data.selection === selection && !resource.loading && !resource.error
      ? resource.data.result.parsed
      : null;
  return {
    parsed,
    parsing: !!selection && resource.loading,
    fileName: selection?.file.name || '',
    selectFile: (file: File) => setSelection({ file }),
  };
}
