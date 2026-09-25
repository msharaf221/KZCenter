export interface BackupRuntime { readonly running: boolean; readonly restoring: boolean; readonly schedulerActive: boolean }
let snapshot: BackupRuntime = { running: false, restoring: false, schedulerActive: false };
const listeners = new Set<() => void>();
export const getBackupRuntime = () => snapshot;
export function subscribeBackupRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function update(patch: Partial<BackupRuntime>) {
  snapshot = Object.freeze({ ...snapshot, ...patch });
  listeners.forEach(listener => {
    try { listener(); } catch (error) { console.error('Backup observer failed:', error); }
  });
}
export function claimBackupOperation(operation: 'running' | 'restoring'): boolean {
  if (snapshot.running || snapshot.restoring) return false;
  update({ [operation]: true });
  return true;
}
export function finishBackupOperation(operation: 'running' | 'restoring'): void { update({ [operation]: false }); }
export function setSchedulerActive(schedulerActive: boolean): void { update({ schedulerActive }); }
