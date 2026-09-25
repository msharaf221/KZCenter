import bcrypt from 'bcryptjs';
import type { User } from '../../domain/models';
import { checkPasswordStrength } from '../../lib/security';

export function passwordMatches(value: string, hash: string): boolean {
  return bcrypt.compareSync(value, hash);
}
export function mustChangeLocalPassword(user: User): boolean {
  return !!user.mustChangePassword || passwordMatches('admin123', user.passwordHash);
}
export function hashNewPassword(password: string): string {
  const strength = checkPasswordStrength(password);
  if (strength.score < 2) throw new Error(`كلمة المرور ضعيفة: ${strength.suggestions.join('، ')}`);
  return bcrypt.hashSync(password, 10);
}
