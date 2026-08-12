import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import bcrypt from 'bcryptjs';
import { User, UserRole, seedDefaultData, getUserByUsername, dbGetAll, dbPut, dbAdd, dbRemove, generateId } from '../lib/db';
import { notify } from '../lib/notifications';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: () => boolean;
  isTeacher: () => boolean;
  hasPermission: (permission: string) => boolean;
  allUsers: User[];
  addUser: (username: string, password: string, role: UserRole) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  resetPassword: (id: string, newPassword: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = 'educenter_session';

const ADMIN_PERMISSIONS = [
  'students', 'teachers', 'courses', 'groups',
  'payments', 'attendance', 'reports', 'settings',
  'users', 'expenses', 'exams',
];

const TEACHER_PERMISSIONS = ['attendance', 'students_view', 'reports_view'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    initApp();
  }, []);

  async function initApp() {
    console.log('🚀 Initializing app...');
    try {
      await seedDefaultData();
      console.log('✅ Default data seeded');
      
      // Try to restore session
      const savedSession = sessionStorage.getItem(SESSION_KEY);
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          setUser(parsed);
          console.log('✅ Session restored');
        } catch {
          sessionStorage.removeItem(SESSION_KEY);
        }
      }
      await refreshUsers();
    } catch (e) {
      console.error('❌ initApp error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function refreshUsers() {
    try {
      const users = await dbGetAll<User>('users');
      setAllUsers(users);
      console.log('✅ Users loaded:', users.length);
    } catch (e) {
      console.error('refreshUsers error:', e);
    }
  }

  async function login(username: string, password: string): Promise<boolean> {
    console.log('🔐 Attempting login for:', username);
    try {
      const foundUser = await getUserByUsername(username);
      console.log('👤 Found user:', foundUser ? 'yes' : 'no');
      
      if (!foundUser) {
        console.log('❌ User not found');
        return false;
      }

      console.log('🔑 Comparing passwords...');
      const match = bcrypt.compareSync(password, foundUser.passwordHash);
      console.log('🔑 Password match:', match);
      
      if (!match) {
        console.log('❌ Password mismatch');
        return false;
      }

      setUser(foundUser);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(foundUser));
      console.log('✅ Login successful');
      return true;
    } catch (e) {
      console.error('❌ login error:', e);
      return false;
    }
  }

  function logout() {
    setUser(null);
    sessionStorage.removeItem(SESSION_KEY);
    notify.info('تم تسجيل الخروج');
  }

  function isAdmin(): boolean {
    return user?.role === 'admin';
  }

  function isTeacher(): boolean {
    return user?.role === 'teacher';
  }

  function hasPermission(permission: string): boolean {
    if (!user) return false;
    if (user.role === 'admin') return ADMIN_PERMISSIONS.includes(permission);
    if (user.role === 'teacher') return TEACHER_PERMISSIONS.includes(permission);
    return false;
  }

  async function addUser(username: string, password: string, role: UserRole): Promise<void> {
    // Check duplicate
    const existing = await getUserByUsername(username);
    if (existing) throw new Error('اسم المستخدم موجود بالفعل');

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
    notify.success('تم إضافة المستخدم بنجاح');
  }

  async function deleteUser(id: string): Promise<void> {
    // Cannot delete last admin
    const admins = allUsers.filter(u => u.role === 'admin' && !u.deleted);
    const target = allUsers.find(u => u.id === id);
    if (target?.role === 'admin' && admins.length <= 1) {
      throw new Error('لا يمكن حذف آخر مسؤول في النظام');
    }
    await dbRemove('users', id);
    await refreshUsers();
    notify.success('تم حذف المستخدم');
  }

  async function resetPassword(id: string, newPassword: string): Promise<void> {
    const userToUpdate = allUsers.find(u => u.id === id);
    if (!userToUpdate) throw new Error('المستخدم غير موجود');
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await dbPut('users', { ...userToUpdate, passwordHash, updatedAt: new Date().toISOString() });
    await refreshUsers();
    // If resetting own password, update session
    if (user?.id === id) {
      const updated = { ...user, passwordHash };
      setUser(updated);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    }
    notify.success('تم تغيير كلمة المرور بنجاح');
  }

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout,
      isAdmin, isTeacher, hasPermission,
      allUsers, addUser, deleteUser, resetPassword, refreshUsers,
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
