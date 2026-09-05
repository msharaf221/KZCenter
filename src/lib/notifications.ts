import toast from 'react-hot-toast';

// ==================== BROWSER NOTIFICATIONS ====================

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
}

export function getAppNotifications(): AppNotification[] {
  try {
    return JSON.parse(localStorage.getItem('app_notifications') || '[]');
  } catch {
    return [];
  }
}

export function saveAppNotification(notif: Omit<AppNotification, 'id' | 'date' | 'read'>) {
  const notifications = getAppNotifications();
  const newNotif: AppNotification = {
    ...notif,
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).substring(2),
    date: new Date().toISOString(),
    read: false,
  };
  notifications.unshift(newNotif);
  if (notifications.length > 50) notifications.pop();
  localStorage.setItem('app_notifications', JSON.stringify(notifications));
  window.dispatchEvent(new Event('app_notifications_updated'));
}

export function markAppNotificationsAsRead() {
  const notifications = getAppNotifications().map(n => ({ ...n, read: true }));
  localStorage.setItem('app_notifications', JSON.stringify(notifications));
  window.dispatchEvent(new Event('app_notifications_updated'));
}

export function clearAppNotifications() {
  localStorage.setItem('app_notifications', '[]');
  window.dispatchEvent(new Event('app_notifications_updated'));
}

export function showBrowserNotification(
  title: string,
  body: string,
  options?: {
    icon?: string;
    tag?: string;
    onClick?: () => void;
  }
): void {
  saveAppNotification({ title, message: body });

  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(title, {
      body,
      icon: options?.icon || '🎓',
      tag: options?.tag,
      dir: 'rtl',
      lang: 'ar',
    });

    if (options?.onClick) {
      notification.onclick = () => {
        window.focus();
        options.onClick?.();
        notification.close();
      };
    }

    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  } catch (e) {
    console.error('Notification error:', e);
  }
}

// ==================== TOAST NOTIFICATIONS ====================

export const notify = {
  success: (message: string) => {
    toast.success(message, {
      icon: '✅',
      style: {
        background: '#ecfdf5',
        color: '#065f46',
        border: '1px solid #a7f3d0',
      },
    });
  },

  error: (message: string) => {
    toast.error(message, {
      icon: '❌',
      style: {
        background: '#fef2f2',
        color: '#991b1b',
        border: '1px solid #fecaca',
      },
    });
  },

  warning: (message: string) => {
    toast(message, {
      icon: '⚠️',
      style: {
        background: '#fffbeb',
        color: '#92400e',
        border: '1px solid #fde68a',
      },
    });
  },

  info: (message: string) => {
    toast(message, {
      icon: 'ℹ️',
      style: {
        background: '#eff6ff',
        color: '#1e40af',
        border: '1px solid #bfdbfe',
      },
    });
  },

  loading: (message: string) => {
    return toast.loading(message, {
      style: {
        background: '#f8fafc',
        color: '#475569',
      },
    });
  },

  dismiss: (toastId?: string) => {
    if (toastId) {
      toast.dismiss(toastId);
    } else {
      toast.dismiss();
    }
  },

  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string;
      error: string;
    }
  ) => {
    return toast.promise(promise, messages, {
      style: {
        minWidth: '200px',
      },
    });
  },
};

// ==================== APP NOTIFICATIONS ====================

interface NotificationSettings {
  notifyNewStudent: boolean;
  notifyAbsence: boolean;
  notifyLatePayment: boolean;
}

let appSettings: NotificationSettings = {
  notifyNewStudent: true,
  notifyAbsence: true,
  notifyLatePayment: true,
};

export function updateNotificationSettings(settings: Partial<NotificationSettings>) {
  appSettings = { ...appSettings, ...settings };
}

export function notifyNewStudent(studentName: string) {
  if (!appSettings.notifyNewStudent) return;

  notify.success(`تم تسجيل طالب جديد: ${studentName}`);
  showBrowserNotification('طالب جديد 🎓', `تم تسجيل ${studentName} في المركز`);
}

export function notifyAbsence(studentName: string, groupName: string) {
  if (!appSettings.notifyAbsence) return;

  notify.warning(`${studentName} غائب في ${groupName}`);
  showBrowserNotification('غياب طالب ⚠️', `${studentName} غائب في مجموعة ${groupName}`);
}

export function notifyLatePayment(studentName: string, amount: number) {
  if (!appSettings.notifyLatePayment) return;

  notify.warning(`دفعة متأخرة: ${studentName} - ${amount}`);
  showBrowserNotification('دفعة متأخرة 💰', `${studentName} لديه دفعة متأخرة بقيمة ${amount}`);
}

export function notifyPaymentReceived(studentName: string, amount: number) {
  notify.success(`تم استلام ${amount} من ${studentName}`);
}

export function notifyAttendanceSaved(groupName: string, count: number) {
  notify.success(`تم حفظ حضور ${count} طالب في ${groupName}`);
}

/** تنبيه غياب متكرر (3+ متتالية) — مؤشر انسحاب محتمل */
export function notifyRepeatedAbsence(studentName: string, groupName: string, streak: number) {
  if (!appSettings.notifyAbsence) return;

  notify.error(`⚠️ غياب متكرر: ${studentName} غاب ${streak} مرات متتالية في ${groupName}`);
  showBrowserNotification(
    'غياب متكرر 🚨',
    `${studentName} غاب ${streak} مرات متتالية في ${groupName} — يُرجى التواصل مع ولي الأمر`
  );
  saveAppNotification({
    title: 'غياب متكرر 🚨',
    message: `${studentName} غاب ${streak} مرات متتالية في ${groupName} — تواصل مع ولي الأمر`,
  });
}
