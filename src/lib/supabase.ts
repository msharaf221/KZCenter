/** Backwards-compatible public API. Production code imports the owning modules. */
export {
  getSupabaseClient,
  getSupabaseConfigured,
  isSupabaseConfigured,
  reinitializeSupabase,
  supabase
} from '../data/cloud/client';
export {
  clearCloudCredentials,
  clearSupabaseConfig,
  getCloudCredentials,
  getStoredSupabaseConfig,
  saveCloudCredentials,
  saveSupabaseConfig
} from '../data/cloud/config';
export { SQL_SCHEMA } from '../data/cloud/schema';
export type { Database } from '../data/cloud/schema';
export { testSupabaseConnection, testSupabaseConnectionDetailed } from '../services/cloud/connection';
export type { ConnectionTestResult } from '../services/cloud/connection';
export { cloudSignOut, ensureCloudSession } from '../services/cloud/session';
export type { CloudSessionResult } from '../services/cloud/session';
