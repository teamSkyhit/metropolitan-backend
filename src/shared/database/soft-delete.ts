/**
 * Soft delete + audit conventions. Every business table has:
 *   created_at, updated_at, deleted_at, created_by_id, updated_by_id
 *
 * Rows are never hard deleted. Repositories must:
 *   - spread `notDeleted` into the `where` of every read,
 *   - use `softDeleteData(actorId)` instead of `delete`,
 *   - use `createdBy(actorId)` / `updatedBy(actorId)` on writes.
 */
export const notDeleted = { deletedAt: null } as const;

export function softDeleteData(actorId: string | null) {
  return { deletedAt: new Date(), updatedById: actorId };
}

export function restoreData(actorId: string | null) {
  return { deletedAt: null, updatedById: actorId };
}

export function createdBy(actorId: string | null) {
  return { createdById: actorId, updatedById: actorId };
}

export function updatedBy(actorId: string | null) {
  return { updatedById: actorId };
}
