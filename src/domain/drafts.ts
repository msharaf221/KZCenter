/** Copy only editable fields actually supplied; never replace identity, ledger or tombstone metadata. */
export function pickDraft<T extends object, K extends keyof T>(draft: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(
    keys.filter(key => Object.prototype.hasOwnProperty.call(draft, key)).map(key => [key, draft[key]]),
  ) as Pick<T, K>;
}
