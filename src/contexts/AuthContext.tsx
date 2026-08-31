import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import bcrypt from 'bcryptjs';
import { User, UserRole, seedDefaultData, getUserByUsername, dbGetAll, dbPut, dbAdd, dbSoftDelete, generateId } from '../lib/db';
import { notify } from '../lib/notifications';
import {
  checkRateLimit,
  recordLoginAttempt,
  recordGlobalFailedAttempt,
  isGloballyBlocked,
  resetGlobalFailedAttempts,
  isSessionExpired,
  refreshSession,
  clearSession,
  addAuditEntry,
  checkPasswordStrength,
} from '../lib/security';

interface AuthContextType {
  user: SessionUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; mustChangePassword?: boolean }>;
  logout: () => void;
  isAdmin: () => boolean;
  isTeacher: () => boolean;
  allUsers: User[];
  addUser: (username: string, password: string, role: UserRole) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  resetPassword: (id: string, newPassword: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  rateLimitInfo: { remainingAttempts: number; blockedUntil?: number } | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = 'educenter_session';
const SESSION_TIMESTAMP_KEY = 'educenter_session_ts';
const MUST_CHANGE_PASSWORD_KEY = 'educenter_must_change_pw';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Safe session shape: never persist the password hash
type SessionUser = Omit<User, 'passwordHash'>;

function toSessionUser(u: User): SessionUser {
  const { passwordHash: _ph, ...safe } = u;
  return safe;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ remainingAttempts: number; blockedUntil?: number } | null>(null);
  const sessionCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    initApp();
    return () => {
      if (sessionCheckRef.current) clearInterval(sessionCheckRef.current);
    };
  }, []);

  // Check session expiry periodically
  useEffect(() => {
    if (user) {
      sessionCheckRef.current = setInterval(() => {
        if (isSessionExpired()) {
          notify.warning('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
          logout();
        }
      }, 60000); // Check every minute
    }
    return () => {
      if (sessionCheckRef.current) clearInterval(sessionCheckRef.current);
    };
  }, [user]);

  async function initApp() {
    try {
      await seedDefaultData();

      // Try to restore session (strip any legacy passwordHash)
      const savedSession = sessionStorage.getItem(SESSION_KEY);
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          delete parsed.passwordHash;

          // Check session expiry
          if (isSessionExpired()) {
            sessionStorage.removeItem(SESSION_KEY);
            sessionStorage.removeItem(SESSION_TIMESTAMP_KEY);
          } else {
            setUser(parsed);
            refreshSession();
          }
        } catch {
          sessionStorage.removeItem(SESSION_KEY);
          sessionStorage.removeItem(SESSION_TIMESTAMP_KEY);
        }
      }
      await refreshUsers();
    } catch (e) {
      console.error('initApp error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function refreshUsers() {
    try {
      const users = await dbGetAll<User>('users');
      setAllUsers(users);
    } catch (e) {
      console.error('refreshUsers error:', e);
    }
  }

  async function login(username: string, password: string): Promise<{ success: boolean; mustChangePassword?: boolean }> {
    try {
      // Global lockout (across all usernames) to deter username-spraying
      if (isGloballyBlocked()) {
        notify.error('تم حظر محاولات تسجيل الدخول مؤقتاً. حاول مرة أخرى لاحقاً');
        return { success: false };
      }

      // Rate limiting
      const rateCheck = checkRateLimit(username);
      setRateLimitInfo(rateCheck);

      if (!rateCheck.allowed) {
        const blockedMinutes = rateCheck.blockedUntil
          ? Math.ceil((rateCheck.blockedUntil - Date.now()) / 60000)
          : 5;
        notify.error(`تم حظر المحاولات. حاول مرة أخرى بعد ${blockedMinutes} دقيقة`);
        return { success: false };
      }

      const foundUser = await getUserByUsername(username);

      if (!foundUser) {
        recordLoginAttempt(username, false);
        recordGlobalFailedAttempt();
        setRateLimitInfo(checkRateLimit(username));
        await delay(800); // throttle to slow brute-force attempts
        return { success: false };
      }

      const match = bcrypt.compareSync(password, foundUser.passwordHash);

      if (!match) {
        recordLoginAttempt(username, false);
        recordGlobalFailedAttempt();
        setRateLimitInfo(checkRateLimit(username));
        const remaining = checkRateLimit(username).remainingAttempts;
        if (remaining > 0 && remaining <= 2) {
          notify.warning(`متبقي ${remaining} محاولات قبل الحظر`);
        }
        await delay(800); // throttle to slow brute-force attempts
        return { success: false };
      }

      // Success
      recordLoginAttempt(username, true);
      resetGlobalFailedAttempts();
      setRateLimitInfo(null);

      const sessionUser = toSessionUser(foundUser);
      setUser(sessionUser);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
      sessionStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());

      // Check if must change password (forced flag OR still using default password)
      const isDefaultPassword = bcrypt.compareSync('admin123', foundUser.passwordHash);
      if (foundUser.mustChangePassword || isDefaultPassword) {
        sessionStorage.setItem(MUST_CHANGE_PASSWORD_KEY, 'true');
      }

      // Audit log
      addAuditEntry({
        userId: foundUser.id,
        username: foundUser.username,
        action: 'login',
        entity: 'session',
        details: `تسجيل دخول ناجح - الدور: ${foundUser.role}`,
      });

      return { success: true, mustChangePassword: foundUser.mustChangePassword || isDefaultPassword };
    } catch (e) {
      console.error('login error:', e);
      return { success: false };
    }
  }

  function logout() {
    if (user) {
      addAuditEntry({
        userId: user.id,
        username: user.username,
        action: 'logout',
        entity: 'session',
      });
    }
    setUser(null);
    clearSession();
    sessionStorage.removeItem(MUST_CHANGE_PASSWORD_KEY);
    notify.info('تم تسجيل الخروج');
  }

  function isAdmin(): boolean {
    return user?.role === 'admin';
  }

  function isTeacher(): boolean {
    return user?.role === 'teacher';
  }

  async function changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    if (!user) return false;

    const foundUser = await getUserByUsername(user.username);
    if (!foundUser) return false;

    const match = bcrypt.compareSync(oldPassword, foundUser.passwordHash);
    if (!match) {
      notify.error('كلمة المرور الحالية غير صحيحة');
      return false;
    }

    const strength = checkPasswordStrength(newPassword);
    if (strength.score < 2) {
      notify.error(`كلمة المرور ضعيفة: ${strength.suggestions.join('، ')}`);
      return false;
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await dbPut('users', { ...foundUser, passwordHash, mustChangePassword: false, updatedAt: new Date().toISOString() });

    sessionStorage.removeItem(MUST_CHANGE_PASSWORD_KEY);

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
  }

  async function addUser(username: string, password: string, role: UserRole): Promise<void> {
    // Check duplicate
    const existing = await getUserByUsername(username);
    if (existing) throw new Error('اسم المستخدم موجود بالفعل');

    const strength = checkPasswordStrength(password);
    if (strength.score < 2) {
      throw new Error(`كلمة المرور ضعيفة: ${strength.suggestions.join('، ')}`);
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const newUser: User = {
      id: generateId(),
      username,
      passwordHash,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dbAdd('users', newUser);
    await refreshUsers();

    addAuditEntry({
      userId: user?.id || 'system',
      username: user?.username || 'system',
      action: 'create',
      entity: 'user',
      entityId: newUser.id,
      details: `إضافة مستخدم جديد: ${username} (${role})`,
    });

    notify.success('تم إضافة المستخدم بنجاح');
  }

  async function deleteUser(id: string): Promise<void> {
    // Cannot delete last admin
    const admins = allUsers.filter(u => u.role === 'admin' && !u.deleted);
    const target = allUsers.find(u => u.id === id);
    if (target?.role === 'admin' && admins.length <= 1) {
      throw new Error('لا يمكن حذف آخر مسؤول في النظام');
    }
    await dbSoftDelete('users', id);
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

  async function resetPassword(id: string, newPassword: string): Promise<void> {
    const userToUpdate = allUsers.find(u => u.id === id);
    if (!userToUpdate) throw new Error('المستخدم غير موجود');

    const strength = checkPasswordStrength(newPassword);
    if (strength.score < 2) {
      throw new Error(`كلمة المرور ضعيفة: ${strength.suggestions.join('، ')}`);
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await dbPut('users', { ...userToUpdate, passwordHash, mustChangePassword: true, updatedAt: new Date().toISOString() });
    await refreshUsers();

    addAuditEntry({
      userId: user?.id || 'system',
      username: user?.username || 'system',
      action: 'update',
      entity: 'user',
      entityId: id,
      details: `إعادة تعيين كلمة مرور: ${userToUpdate.username}`,
    });

    notify.success('تم تغيير كلمة المرور بنجاح');
  }

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout,
      isAdmin, isTeacher,
      allUsers, addUser, deleteUser, resetPassword, refreshUsers,
      changePassword, rateLimitInfo,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}


