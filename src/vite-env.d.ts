/// <reference types="vite/client" />

// Electron API types
interface ElectronAPI {
  backup: {
    saveLocal: (data: string) => Promise<{ success: boolean; path?: string; filename?: string; error?: string }>;
    restoreLocal: (filepath?: string) => Promise<{ success: boolean; data?: string; error?: string }>;
    listLocal: () => Promise<{
      success: boolean;
      backups: Array<{
        filename: string;
        path: string;
        size: number;
        createdAt: string;
        modifiedAt: string;
      }>;
      error?: string;
    }>;
    deleteLocal: (filepath: string) => Promise<{ success: boolean; error?: string }>;
    openFolder: () => Promise<{ success: boolean; error?: string }>;
    getPath: () => Promise<{ path: string }>;
  };
  system: {
    notify: (title: string, body: string) => Promise<{ success: boolean; error?: string }>;
  };
  app: {
    info: () => Promise<{
      version: string;
      name: string;
      platform: string;
      arch: string;
      electronVersion: string;
      nodeVersion: string;
      backupDir: string;
    }>;
  };
  isElectron: boolean;
  platform: string;
}

interface Window {
  electronAPI?: ElectronAPI;
}
