import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Settings, dbGetById, dbPut } from '../lib/db';
import { requestNotificationPermission, updateNotificationSettings } from '../lib/notifications';
import { isSupabaseConfigured } from '../lib/supabase';
import { getStorageMode, setStorageMode, StorageMode } from '../lib/storage';

interface AppContextType {
  settings: Settings | null;
  updateSettings: (s: Partial<Settings>) => Promise<void>;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  refreshSettings: () => Promise<void>;
  isCloudEnabled: boolean;
  storageMode: StorageMode;
  changeStorageMode: (mode: StorageMode) => void;
  notificationsEnabled: boolean;
  enableNotifications: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  centerName: 'EduCenter Pro',
  currency: 'EGP',
  primaryColor: '#6366f1',
  fontSize: 'md',
  language: 'ar',
  darkMode: false,
  notifyNewStudent: true,
  notifyAbsence: true,
  notifyLatePayment: true,
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [storageMode, setStorageModeState] = useState<StorageMode>(getStorageMode());
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    refreshSettings();
    checkNotificationPermission();
  }, []);

  async function checkNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }

  async function enableNotifications() {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
  }

  const refreshSettings = useCallback(async () => {
    try {
      const s = await dbGetById<Settings>('settings', 'main');
      if (s) {
        setSettings(s);
        applySettings(s);
        updateNotificationSettings({
          notifyNewStudent: s.notifyNewStudent,
          notifyAbsence: s.notifyAbsence,
          notifyLatePayment: s.notifyLatePayment,
        });
      } else {
        setSettings(DEFAULT_SETTINGS);
        applySettings(DEFAULT_SETTINGS);
      }
    } catch (e) {
      console.error('refreshSettings error:', e);
      setSettings(DEFAULT_SETTINGS);
    }
  }, []);

  function applySettings(s: Settings) {
    // Apply primary color
    document.documentElement.style.setProperty('--primary', s.primaryColor);

    // Apply font size
    const html = document.documentElement;
    html.classList.remove('font-sm', 'font-md', 'font-lg');
    html.classList.add(`font-${s.fontSize}`);

    // Apply dark mode
    if (s.darkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    setDarkMode(s.darkMode);
  }

  async function updateSettings(partial: Partial<Settings>) {
    const current = settings || DEFAULT_SETTINGS;
    const updated = { ...current, ...partial };
    await dbPut('settings', updated);
    setSettings(updated);
    applySettings(updated);
    
    // Update notification settings
    if (partial.notifyNewStudent !== undefined || 
        partial.notifyAbsence !== undefined || 
        partial.notifyLatePayment !== undefined) {
      updateNotificationSettings({
        notifyNewStudent: updated.notifyNewStudent,
        notifyAbsence: updated.notifyAbsence,
        notifyLatePayment: updated.notifyLatePayment,
      });
    }
  }

  function toggleDarkMode() {
    const newMode = !darkMode;
    updateSettings({ darkMode: newMode });
  }

  function changeStorageMode(mode: StorageMode) {
    setStorageMode(mode);
    setStorageModeState(mode);
  }

  return (
    <AppContext.Provider value={{
      settings,
      updateSettings,
      sidebarOpen,
      setSidebarOpen,
      darkMode,
      toggleDarkMode,
      refreshSettings,
      isCloudEnabled: isSupabaseConfigured,
      storageMode,
      changeStorageMode,
      notificationsEnabled,
      enableNotifications,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
