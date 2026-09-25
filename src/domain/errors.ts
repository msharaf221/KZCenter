/** Expected, safe-to-display validation/permission failures, distinct from infrastructure errors. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

export function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}

export function userErrorMessage(error: unknown, fallback = 'تعذّر تنفيذ العملية. حاول مرة أخرى.'): string {
  return error instanceof RuleError ? error.message : fallback;
}
