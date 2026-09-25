import bcrypt from 'bcryptjs';
import { dbPut } from '../../data/records';
import type { User, UserRole } from '../../domain/models';
import { saveLocalSession, toSessionUser } from '../../services/auth/session';

const syntheticHash = bcrypt.hashSync('Synthetic!TestPassword123', 4);

/** Real provider tests restore an existing local account, not an unverified JSON role. */
export async function seedSession(role: UserRole): Promise<User> {
  const now = new Date().toISOString();
  const user: User = {
    id: `${role}-test`,
    username: role,
    role,
    passwordHash: syntheticHash,
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
  };
  await dbPut('users', user);
  saveLocalSession(toSessionUser(user), false);
  return user;
}
