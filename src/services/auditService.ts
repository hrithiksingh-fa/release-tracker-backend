import { prisma } from "../db.js";

// Generic field-level audit trail. Call logDiff after any update with the
// row as it was before and after -- it writes one AuditLog row per field
// that actually changed, so routes don't have to hand-pick what to log.

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function logChange(
  entityType: string,
  entityId: string,
  field: string,
  oldValue: unknown,
  newValue: unknown,
  actor = "admin"
) {
  await prisma.auditLog.create({
    data: { entityType, entityId, field, oldValue: stringify(oldValue), newValue: stringify(newValue), actor },
  });
}

// Compares `before`/`after` on each of `fields` and logs one row per field
// that changed (by stringified value, so a Date vs. same Date is a no-op).
export async function logDiff<T extends Record<string, unknown>>(
  entityType: string,
  entityId: string,
  before: T,
  after: T,
  fields: readonly (keyof T)[],
  actor = "admin"
) {
  const rows = fields
    .filter((f) => stringify(before[f]) !== stringify(after[f]))
    .map((f) => ({
      entityType,
      entityId,
      field: String(f),
      oldValue: stringify(before[f]),
      newValue: stringify(after[f]),
      actor,
    }));
  if (rows.length) await prisma.auditLog.createMany({ data: rows });
}

export async function getTimeline(entityType: string, entityId: string) {
  return prisma.auditLog.findMany({ where: { entityType, entityId }, orderBy: { occurredAt: "desc" } });
}
