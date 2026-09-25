import { getDB } from '../data/database';
import { readById } from '../data/readers';
import type { Settings } from '../domain/models';
import { DEFAULT_SETTINGS_VALUES, setSettingsCache } from '../lib/settings';

export async function loadApplicationSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS_VALUES, ...(await readById('settings', 'main')) };
}

/** Read and patch inside one transaction; concurrent unrelated edits must not overwrite each other. */
export async function updateApplicationSettings(
  patch: Partial<Settings> | ((current: Settings) => Partial<Settings>),
): Promise<Settings> {
  const tx = (await getDB()).transaction('settings', 'readwrite');
  try {
    const current = { ...DEFAULT_SETTINGS_VALUES, ...(await tx.store.get('main')) };
    const updated = { ...current, ...(typeof patch === 'function' ? patch(current) : patch), id: 'main' };
    await tx.store.put(updated);
    await tx.done;
    setSettingsCache(updated);
    return updated;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    await tx.done.catch(() => {});
    throw error;
  }
}
