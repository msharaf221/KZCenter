import { writeTransaction } from '../data/transactions';
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
  const updated = await writeTransaction(['settings'], async tx => {
    const current = { ...DEFAULT_SETTINGS_VALUES, ...(await tx.objectStore('settings').get('main')) };
    const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch), id: 'main' };
    await tx.objectStore('settings').put(next);
    return next;
  });
  setSettingsCache(updated);
  return updated;
}
