/**
 * Electron Main Process
 * العملية الرئيسية لتطبيق سطح المكتب
 */

import { app, BrowserWindow, shell, ipcMain, dialog, Notification } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { homedir } from 'os';

// ==================== APP CONFIG ====================

const APP_NAME = 'EduCenter Pro';
const BACKUP_DIR = join(homedir(), 'Documents', 'EduCenter Backups');
const BACKUP_RETENTION_DAYS = 30;

// Ensure backup directory exists
if (!existsSync(BACKUP_DIR)) {
  mkdirSync(BACKUP_DIR, { recursive: true });
}

// ==================== MAIN WINDOW ====================

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: APP_NAME,
    icon: join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    // RTL-friendly defaults
    autoHideMenuBar: true,
    backgroundColor: '#f9fafb',
    show: false, // Show when ready
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Show when ready
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }
}

// ==================== APP LIFECYCLE ====================

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.educenter.pro');

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==================== IPC HANDLERS - BACKUP SYSTEM ====================

/**
 * حفظ نسخة احتياطية على الجهاز
 */
ipcMain.handle('backup:save-local', async (_event, data: string) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `educenter_backup_${timestamp}.json`;
    const filepath = join(BACKUP_DIR, filename);

    writeFileSync(filepath, data, 'utf-8');

    // Clean old backups
    cleanOldBackups();

    return { success: true, path: filepath, filename };
  } catch (error) {
    console.error('Local backup failed:', error);
    return { success: false, error: String(error) };
  }
});

/**
 * استعادة نسخة احتياطية من الجهاز
 */
ipcMain.handle('backup:restore-local', async (_event, filepath?: string) => {
  try {
    let selectedPath = filepath;

    if (!selectedPath) {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'اختر ملف النسخة الاحتياطية',
        defaultPath: BACKUP_DIR,
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || !result.filePaths[0]) {
        return { success: false, error: 'تم الإلغاء' };
      }
      selectedPath = result.filePaths[0];
    }

    const data = readFileSync(selectedPath, 'utf-8');
    JSON.parse(data); // Validate JSON

    return { success: true, data };
  } catch (error) {
    console.error('Restore failed:', error);
    return { success: false, error: String(error) };
  }
});

/**
 * جلب قائمة النسخ الاحتياطية المحلية
 */
ipcMain.handle('backup:list-local', async () => {
  try {
    if (!existsSync(BACKUP_DIR)) {
      return { success: true, backups: [] };
    }

    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json') && f.startsWith('educenter_backup_'))
      .map(f => {
        const filepath = join(BACKUP_DIR, f);
        const stats = statSync(filepath);
        return {
          filename: f,
          path: filepath,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    return { success: true, backups: files };
  } catch (error) {
    return { success: false, error: String(error), backups: [] };
  }
});

/**
 * حذف نسخة احتياطية
 */
ipcMain.handle('backup:delete-local', async (_event, filepath: string) => {
  try {
    if (existsSync(filepath)) {
      unlinkSync(filepath);
      return { success: true };
    }
    return { success: false, error: 'الملف غير موجود' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

/**
 * فتح مجلد النسخ الاحتياطية
 */
ipcMain.handle('backup:open-folder', async () => {
  try {
    if (!existsSync(BACKUP_DIR)) {
      mkdirSync(BACKUP_DIR, { recursive: true });
    }
    shell.openPath(BACKUP_DIR);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

/**
 * جلب مسار مجلد النسخ الاحتياطية
 */
ipcMain.handle('backup:get-path', async () => {
  return { path: BACKUP_DIR };
});

/**
 * عرض إشعار نظام
 */
ipcMain.handle('system:notify', async (_event, title: string, body: string) => {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: join(__dirname, '../build/icon.png') }).show();
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

/**
 * جلب معلومات التطبيق
 */
ipcMain.handle('app:info', async () => {
  return {
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    backupDir: BACKUP_DIR,
  };
});

// ==================== HELPER FUNCTIONS ====================

/**
 * حذف النسخ الاحتياطية القديمة (أكثر من 30 يوم)
 */
function cleanOldBackups(): void {
  try {
    if (!existsSync(BACKUP_DIR)) return;

    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json') && f.startsWith('educenter_backup_'));

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - BACKUP_RETENTION_DAYS);

    for (const file of files) {
      const filepath = join(BACKUP_DIR, file);
      const stats = statSync(filepath);
      if (stats.mtime < cutoffDate) {
        unlinkSync(filepath);
        console.log(`Deleted old backup: ${file}`);
      }
    }
  } catch (error) {
    console.error('Failed to clean old backups:', error);
  }
}
