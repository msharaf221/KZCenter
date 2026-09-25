// ==================== UTILS ====================

export function generateId(): string {
  // crypto.randomUUID is collision-safe (unlike Date.now + Math.random)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
