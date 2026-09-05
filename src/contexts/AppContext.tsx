import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Settings, dbGetById, dbPut } from '../lib/db';
import { setSettingsCache, DEFAULT_SETTINGS_VALUES } from '../lib/settings';
import { requestNotificationPermission, updateNotificationSettings } from '../lib/notifications';
import { getSupabaseConfigured } from '../lib/supabase';

interface AppContextType {
  settings: Settings | null;
  updateSettings: (s: Partial<Settings>) => Promise<void>;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  refreshSettings: () => Promise<void>;
  isCloudEnabled: boolean;
  notificationsEnabled: boolean;
  enableNotifications: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

/** نفس الافتراضيات الموجودة في lib/settings (مصدر واحد للحقيقة) */
const DEFAULT_SETTINGS: Settings = DEFAULT_SETTINGS_VALUES;

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    refreshSettings();
    checkNotificationPermission();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- مقصود: إعادة التحميل مربوطة بالـ deps المكتوبة بس
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
        setSettingsCache(s);
        setSettings(s);
        applySettings(s);
        updateNotificationSettings({
          notifyNewStudent: s.notifyNewStudent,
          notifyAbsence: s.notifyAbsence,
          notifyLatePayment: s.notifyLatePayment,
        });
      } else {
        setSettingsCache(DEFAULT_SETTINGS);
        setSettings(DEFAULT_SETTINGS);
        applySettings(DEFAULT_SETTINGS);
      }
    } catch (e) {
      console.error('refreshSettings error:', e);
      setSettingsCache(DEFAULT_SETTINGS);
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
    setSettingsCache(updated);
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

  return (
    <AppContext.Provider value={{
      settings,
      updateSettings,
      sidebarOpen,
      setSidebarOpen,
      darkMode,
      toggleDarkMode,
      refreshSettings,
      isCloudEnabled: getSupabaseConfigured(),
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
