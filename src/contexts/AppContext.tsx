import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { applyApplicationTheme } from '../app/theme';
import ResourceError from '../components/ui/ResourceError';
import { getSupabaseConfigured } from '../data/cloud/client';
import type { Settings } from '../domain/models';
import { useAsyncResource } from '../hooks/useAsyncResource';
import { notify, requestNotificationPermission, updateNotificationSettings } from '../lib/notifications';
import { setSettingsCache } from '../lib/settings';
import { loadApplicationSettings, updateApplicationSettings } from '../services/settingsService';

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

export function AppProvider({ children }: { children: ReactNode }) {
  const { data: settings, error: settingsError, reload } = useAsyncResource<Settings | null>(loadApplicationSettings, null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => 'Notification' in window && Notification.permission === 'granted',
  );

  useEffect(() => {
    if (!settings) return;
    setSettingsCache(settings);
    applyApplicationTheme(settings);
    updateNotificationSettings({
      notifyNewStudent: settings.notifyNewStudent,
      notifyAbsence: settings.notifyAbsence,
      notifyLatePayment: settings.notifyLatePayment,
    });
  }, [settings]);

  useEffect(() => {
    const collapseOnMobile = () => {
      if (window.innerWidth < 768) setSidebarOpen(false);
    };
    window.addEventListener('resize', collapseOnMobile);
    return () => window.removeEventListener('resize', collapseOnMobile);
  }, []);

  const refreshSettings = useCallback(async () => {
    await reload();
  }, [reload]);
  const updateSettings = useCallback(
    async (partial: Partial<Settings>) => {
      await updateApplicationSettings(partial);
      await reload();
    },
    [reload],
  );

  async function enableNotifications() {
    setNotificationsEnabled(await requestNotificationPermission());
  }

  function toggleDarkMode() {
    void updateApplicationSettings(current => ({ darkMode: !current.darkMode }))
      .then(() => reload())
      .catch(() => notify.error('تعذّر حفظ إعدادات المظهر'));
  }

  return (
    <AppContext.Provider
      value={{
        settings,
        updateSettings,
        sidebarOpen,
        setSidebarOpen,
        darkMode: settings?.darkMode ?? false,
        toggleDarkMode,
        refreshSettings,
        isCloudEnabled: getSupabaseConfigured(),
        notificationsEnabled,
        enableNotifications,
      }}
    >
      {settingsError ? <div className="mx-auto max-w-xl p-6"><ResourceError onRetry={reload} message="تعذّر قراءة إعدادات المركز. أعد المحاولة قبل استخدام النظام." /></div> : children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
