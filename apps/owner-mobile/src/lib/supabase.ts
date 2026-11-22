import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
// Stay below platform secure-store value limits even for multi-byte Arabic/emoji text.
const CHUNK_SIZE = 800;
const KEY_PREFIX = 'kzcenter.owner.secure';

function storageKeys(key: string) {
  return `${KEY_PREFIX}.${encodeURIComponent(key)}`;
}

const pendingSecureOperations = new Map<string, Promise<void>>();

function enqueueSecureOperation(key: string, operation: () => Promise<void>): Promise<void> {
  const previous = pendingSecureOperations.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  pendingSecureOperations.set(key, current);
  return current.finally(() => {
    if (pendingSecureOperations.get(key) === current) pendingSecureOperations.delete(key);
  });
}

/**
 * Supabase sessions can be larger than the per-item limit on some Keychain
 * implementations. Store them as encrypted chunks and switch the pointer only
 * after every new chunk has been written successfully.
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const pending = pendingSecureOperations.get(key);
    if (pending) await pending.catch(() => {});
    const base = storageKeys(key);
    const generation = await SecureStore.getItemAsync(`${base}.active`);
    if (!generation) return null;
    const countValue = await SecureStore.getItemAsync(`${base}.${generation}.count`);
    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 1 || count > 100) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${base}.${generation}.${index}`)),
    );
    if (chunks.some(chunk => chunk === null)) return null;
    return chunks.join('');
  },

  setItem(key: string, value: string): Promise<void> {
    return enqueueSecureOperation(key, async () => {
      const base = storageKeys(key);
      const oldGeneration = await SecureStore.getItemAsync(`${base}.active`);
      const generation = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const chunks = splitValue(value);
      if (chunks.length > 100) throw new Error('SecureStore value exceeds the supported size.');
      for (let index = 0; index < chunks.length; index++) {
        await SecureStore.setItemAsync(`${base}.${generation}.${index}`, chunks[index]);
      }
      await SecureStore.setItemAsync(`${base}.${generation}.count`, String(chunks.length));
      await SecureStore.setItemAsync(`${base}.active`, generation);
      if (oldGeneration) await removeGeneration(base, oldGeneration).catch(() => {});
    });
  },

  removeItem(key: string): Promise<void> {
    return enqueueSecureOperation(key, async () => {
      const base = storageKeys(key);
      const generation = await SecureStore.getItemAsync(`${base}.active`);
      await SecureStore.deleteItemAsync(`${base}.active`);
      if (generation) await removeGeneration(base, generation);
    });
  },
};

async function removeGeneration(base: string, generation: string): Promise<void> {
  const count = Number(await SecureStore.getItemAsync(`${base}.${generation}.count`));
  if (Number.isInteger(count) && count > 0 && count <= 100) {
    await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(`${base}.${generation}.${index}`)),
    );
  }
  await SecureStore.deleteItemAsync(`${base}.${generation}.count`);
}

function splitValue(value: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + CHUNK_SIZE, value.length);
    const lastUnit = value.charCodeAt(end - 1);
    const nextUnit = value.charCodeAt(end);
    // Never split a UTF-16 surrogate pair across native Keychain entries.
    if (end < value.length && lastUnit >= 0xd800 && lastUnit <= 0xdbff && nextUnit >= 0xdc00 && nextUnit <= 0xdfff) end--;
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks.length ? chunks : [''];
}

export function ownerSnapshotStorageKey(userId: string, tenantId: string): string {
  return `owner_snapshot_${userId}_${tenantId}`;
}

export function ownerMembershipStorageKey(userId: string): string {
  return `owner_membership_${userId}`;
}

export const supabaseConfigured = Boolean(projectUrl && publicKey);

/** The mobile binary contains only the public key; RLS enforces center membership and read-only role. */
export const supabase = supabaseConfigured
  ? createClient(projectUrl!, publicKey!, {
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    })
  : null;
