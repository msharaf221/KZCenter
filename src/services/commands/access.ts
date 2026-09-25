import type { AuditEntry } from '../../domain/audit';
import { requireRule } from '../../domain/errors';
import type { Group, UserRole } from '../../domain/models';
import { addAuditEntry } from '../../lib/audit';
import { can, type Action, type Entity } from '../../lib/permissions';

export interface CommandActor {
  id: string;
  username: string;
  role: UserRole;
  teacherId?: string;
  mustChangePassword?: boolean;
}
export type Actor = CommandActor | null | undefined;

export function requirePermission(actor: Actor, entity: Entity, action: Action): asserts actor is CommandActor {
  requireRule(!actor?.mustChangePassword, 'يجب تغيير كلمة المرور أولاً');
  requireRule(actor?.id && can(actor.role, entity, action), 'ليس لديك صلاحية لتنفيذ هذه العملية');
}

export function requireGroupAccess(actor: CommandActor, group: Group): void {
  requireRule(
    actor.role !== 'teacher' || (!!actor.teacherId && group.teacherId === actor.teacherId),
    'ليس لديك صلاحية لهذه المجموعة',
  );
}

export function commandAudit(
  actor: CommandActor,
  entry: Omit<AuditEntry, 'id' | 'timestamp' | 'userId' | 'username'>,
): void {
  try {
    addAuditEntry({ ...entry, userId: actor.id, username: actor.username });
  } catch (error) {
    console.error('Command audit failed after commit:', error);
  }
}
