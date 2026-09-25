import type { TableName } from '../../data/stores';

export type SyncRow = Record<string, unknown>;
export interface CloudReady {
  ok: boolean;
  error?: string;
}
export interface SyncRemote {
  prepare(): Promise<CloudReady>;
  read(table: TableName): Promise<{ rows: SyncRow[]; error?: string }>;
  write(table: TableName, rows: SyncRow[], conflictTarget: string): Promise<{ error?: string }>;
}
export interface SyncLocal {
  /** Must include tombstones, or an old remote row can resurrect a deleted record. */
  read(table: TableName): Promise<SyncRow[]>;
  write(table: TableName, row: SyncRow): Promise<void>;
}
