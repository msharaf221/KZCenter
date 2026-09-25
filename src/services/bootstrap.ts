import bcrypt from 'bcryptjs';
import { getDB } from '../data/database';
import type { Settings, User } from '../domain/models';
import { generateId } from '../lib/ids';

// ==================== SEED DATA ====================

export async function seedDefaultData(): Promise<void> {
  const db = await getDB();

  const users = await db.getAll('users');

  if (users.length === 0) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    const adminUser: User = {
      id: generateId(),
      username: 'admin',
      passwordHash,
      role: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.add('users', adminUser);
  }

  const settings = await db.get('settings', 'main');
  if (!settings) {
    const defaultSettings: Settings = {
      id: 'main',
      centerName: 'EduCenter Pro',
      address: '',
      phone: '',
      email: '',
      academicYear: '2024-2025',
      currency: 'EGP',
      primaryColor: '#6366f1',
      fontSize: 'md',
      darkMode: false,
      notifyNewStudent: true,
      notifyAbsence: true,
      notifyLatePayment: true,
    };
    await db.put('settings', defaultSettings);
  }
}

// ==================== USER AUTH ====================

export async function getUserByUsername(username: string): Promise<User | undefined> {
  try {
    const db = await getDB();
    const users: User[] = await db.getAllFromIndex('users', 'by-username', username);
    return users.find(u => !u.deleted);
  } catch (e) {
    console.error('getUserByUsername error:', e);
    return undefined;
  }
}
