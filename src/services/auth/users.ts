import { getDB } from '../../data/database';
import { readAll } from '../../data/readers';
import type { User, UserRole } from '../../domain/models';
import { generateId } from '../../lib/ids';
import { hashNewPassword, passwordMatches } from './passwords';

export const listUsers = () => readAll('users');

/** Duplicate checks and writes share the transaction; does not change existing user roles. */
export async function createUser(
  username: string,
  password: string,
  role: UserRole,
  teacherId?: string,
): Promise<User> {
  const hash = hashNewPassword(password);
  const tx = (await getDB()).transaction('users', 'readwrite');
  try {
    const users = await tx.store.getAll();
    if (users.some(user => user.username === username)) throw new Error('اسم المستخدم موجود بالفعل');
    const now = new Date().toISOString();
    const user: User = {
      id: generateId(),
      username,
      passwordHash: hash,
      role,
      teacherId: role === 'teacher' && teacherId ? teacherId : undefined,
      createdAt: now,
      updatedAt: now,
    };
    await tx.store.add(user);
    await tx.done;
    return user;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* finished */
    }
    await tx.done.catch(() => {});
    throw error;
  }
}

/** Re-read the active admins, not a React snapshot that may be out of date. */
export async function removeUser(id: string): Promise<User | undefined> {
  const tx = (await getDB()).transaction('users', 'readwrite');
  try {
    const users = (await tx.store.getAll()).filter(user => !user.deleted);
    const target = users.find(user => user.id === id);
    if (target?.role === 'admin' && users.filter(user => user.role === 'admin').length <= 1) {
      throw new Error('لا يمكن حذف آخر مسؤول في النظام');
    }
    if (target) {
      const now = new Date().toISOString();
      const deleted = { ...target, deleted: true, updatedAt: now, deletedAt: now };
      await tx.store.put(deleted);
    }
    await tx.done;
    return target;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* finished */
    }
    await tx.done.catch(() => {});
    throw error;
  }
}

export async function resetUserPassword(id: string, password: string): Promise<User> {
  return changeStoredPassword(id, hashNewPassword(password), true);
}

export async function changeOwnPassword(id: string, oldPassword: string, newPassword: string): Promise<User> {
  const hash = hashNewPassword(newPassword);
  return changeStoredPassword(id, hash, false, oldPassword);
}

async function changeStoredPassword(
  id: string,
  hash: string,
  mustChangePassword: boolean,
  oldPassword?: string,
): Promise<User> {
  const tx = (await getDB()).transaction('users', 'readwrite');
  try {
    const current = await tx.store.get(id);
    if (!current || current.deleted) throw new Error('المستخدم غير موجود');
    if (oldPassword !== undefined && !passwordMatches(oldPassword, current.passwordHash)) {
      throw new Error('كلمة المرور الحالية غير صحيحة');
    }
    const updated = { ...current, passwordHash: hash, mustChangePassword, updatedAt: new Date().toISOString() };
    await tx.store.put(updated);
    await tx.done;
    return updated;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* finished */
    }
    await tx.done.catch(() => {});
    throw error;
  }
}
