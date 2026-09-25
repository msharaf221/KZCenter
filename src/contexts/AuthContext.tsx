import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User, UserRole } from '../domain/models';
import { useAsyncResource } from '../hooks/useAsyncResource';
import { notify } from '../lib/notifications';
import { can as canDo, type Action, type Entity } from '../lib/permissions';
import { addAuditEntry, isSessionExpired } from '../lib/security';
import { authenticateUser, initializeAuthentication } from '../services/auth/authentication';
import {
  clearLocalSession,
  resolveLocalSession,
  saveLocalSession,
  toSessionUser,
  type SessionUser,
} from '../services/auth/session';
import { changeOwnPassword, createUser, listUsers, removeUser, resetUserPassword } from '../services/auth/users';
import { requirePermission } from '../services/commands/access';

interface AuthContextType {
  user: SessionUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; mustChangePassword?: boolean }>;
  logout: () => void;
  isAdmin: () => boolean;
  isTeacher: () => boolean;
  /** هل المستخدم الحالي عنده الإجراء ده على الكيان ده؟ (مصفوفة permissions.ts) */
  can: (entity: Entity, action?: Action) => boolean;
  allUsers: User[];
  usersError: Error | null;
  usersLoading: boolean;
  addUser: (username: string, password: string, role: UserRole, teacherId?: string) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  resetPassword: (id: string, newPassword: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  rateLimitInfo: { remainingAttempts: number; blockedUntil?: number } | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ remainingAttempts: number; blockedUntil?: number } | null>(null);
  const { data: allUsers, error: usersError, loading: usersLoading, reload } = useAsyncResource(listUsers, []);
  const refreshUsers = useCallback(async () => {
    await reload();
  }, [reload]);
  const sequence = useRef(0);
  const mounted = useRef(false);
  const invalidateSession = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidateSession();
    };
  }, [invalidateSession]);

  useEffect(() => {
    let active = true;
    const request = sequence.current;
    void initializeAuthentication()
      .then(async () => {
        if (!active) return;
        if (sequence.current === request) {
          const restored = await resolveLocalSession();
          if (!active || sequence.current !== request) return;
          setUser(restored);
          if (restored) saveLocalSession(restored, !!restored.mustChangePassword);
          else clearLocalSession();
        }
        await refreshUsers();
      })
      .catch(error => console.error('initApp error:', error))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshUsers]);

  const logout = useCallback(() => {
    invalidateSession();
    if (user) addAuditEntry({ userId: user.id, username: user.username, action: 'logout', entity: 'session' });
    setUser(null);
    clearLocalSession();
    notify.info('تم تسجيل الخروج');
  }, [user, invalidateSession]);

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      if (isSessionExpired()) {
        notify.warning('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
        logout();
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [user, logout]);

  async function login(username: string, password: string) {
    const request = ++sequence.current;
    try {
      const result = await authenticateUser(username, password);
      if (!mounted.current || request !== sequence.current) return { success: false };
      setRateLimitInfo(result.rateLimitInfo || null);
      if (result.message) (result.warning ? notify.warning : notify.error)(result.message);
      if (!result.success || !result.user) return { success: false };
      const sessionUser = { ...result.user, mustChangePassword: !!result.mustChangePassword };
      setUser(sessionUser);
      saveLocalSession(sessionUser, !!result.mustChangePassword);
      addAuditEntry({
        userId: result.user.id,
        username: result.user.username,
        action: 'login',
        entity: 'session',
        details: `تسجيل دخول ناجح - الدور: ${result.user.role}`,
      });
      return { success: true, mustChangePassword: result.mustChangePassword };
    } catch (error) {
      console.error('login error:', error);
      return { success: false };
    }
  }

  async function changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    if (!user) return false;
    try {
      const request = sequence.current;
      const updated = await changeOwnPassword(user.id, oldPassword, newPassword);
      if (mounted.current && sequence.current === request) {
        const safe = toSessionUser(updated);
        setUser(safe);
        saveLocalSession(safe, false);
      }
      addAuditEntry({
        userId: user.id,
        username: user.username,
        action: 'update',
        entity: 'user',
        entityId: user.id,
        details: 'تغيير كلمة المرور',
      });
      notify.success('تم تغيير كلمة المرور بنجاح');
      return true;
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'حدث خطأ');
      return false;
    }
  }

  async function addUser(username: string, password: string, role: UserRole, teacherId?: string): Promise<void> {
    requirePermission(user, 'users', 'create');
    const created = await createUser(username, password, role, teacherId);
    await refreshUsers();
    addAuditEntry({
      userId: user?.id || 'system',
      username: user?.username || 'system',
      action: 'create',
      entity: 'user',
      entityId: created.id,
      details: `إضافة مستخدم جديد: ${username} (${role})`,
    });
    notify.success('تم إضافة المستخدم بنجاح');
  }

  async function deleteUser(id: string): Promise<void> {
    requirePermission(user, 'users', 'delete');
    const target = await removeUser(id);
    await refreshUsers();
    addAuditEntry({
      userId: user?.id || 'system',
      username: user?.username || 'system',
      action: 'delete',
      entity: 'user',
      entityId: id,
      details: `حذف مستخدم: ${target?.username}`,
    });
    notify.success('تم حذف المستخدم');
  }

  async function resetPassword(id: string, password: string): Promise<void> {
    requirePermission(user, 'users', 'edit');
    const target = await resetUserPassword(id, password);
    await refreshUsers();
    addAuditEntry({
      userId: user?.id || 'system',
      username: user?.username || 'system',
      action: 'update',
      entity: 'user',
      entityId: id,
      details: `إعادة تعيين كلمة مرور: ${target.username}`,
    });
    notify.success('تم تغيير كلمة المرور بنجاح');
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAdmin: () => user?.role === 'admin',
        isTeacher: () => user?.role === 'teacher',
        can: (entity, action = 'view') => canDo(user?.role, entity, action),
        allUsers, usersError, usersLoading,
        addUser,
        deleteUser,
        resetPassword,
        refreshUsers,
        changePassword,
        rateLimitInfo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
