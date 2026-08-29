/**
 * Electron Preload Script
 * يوفر APIs آمنة للواجهة
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // ==================== BACKUP ====================
  backup: {
    /**
     * حفظ نسخة احتياطية على الجهاز
     * @param data - JSON string of backup data
     */
    saveLocal: (data: string) => ipcRenderer.invoke('backup:save-local', data),

    /**
     * استعادة نسخة احتياطية من الجهاز
     * @param filepath - optional specific file path
     */
    restoreLocal: (filepath?: string) => ipcRenderer.invoke('backup:restore-local', filepath),

    /**
     * جلب قائمة النسخ الاحتياطية المحلية
     */
    listLocal: () => ipcRenderer.invoke('backup:list-local'),

    /**
     * حذف نسخة احتياطية
     * @param filepath - path to backup file
     */
    deleteLocal: (filepath: string) => ipcRenderer.invoke('backup:delete-local', filepath),

    /**
     * فتح مجلد النسخ الاحتياطية
     */
    openFolder: () => ipcRenderer.invoke('backup:open-folder'),

    /**
     * جلب مسار مجلد النسخ الاحتياطية
     */
    getPath: () => ipcRenderer.invoke('backup:get-path'),
  },

  // ==================== SYSTEM ====================
  system: {
    /**
     * عرض إشعار نظام
     */
    notify: (title: string, body: string) => ipcRenderer.invoke('system:notify', title, body),
  },

  // ==================== APP INFO ====================
  app: {
    /**
     * جلب معلومات التطبيق
     */
    info: () => ipcRenderer.invoke('app:info'),
  },

  // ==================== ENVIRONMENT ====================
  isElectron: true,
  platform: process.platform,
});

// Type definitions for the exposed API
export interface ElectronAPI {
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

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
