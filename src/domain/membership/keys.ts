/** Compound IDs are encoded, not concatenated with an ambiguous separator. */
export const membershipKey = (studentId: string, groupId: string) => JSON.stringify([studentId, groupId]);
