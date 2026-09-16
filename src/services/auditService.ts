import { prisma } from "../db.js";

export type ActivityType = "create" | "update" | "stage_change" | "comment" | "pbi" | "figma";

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
  actor = "admin",
  activityType: ActivityType = "update"
) {
  await prisma.auditLog.create({
    data: {
      entityType,
      entityId,
      activityType,
      field,
      oldValue: stringify(oldValue),
      newValue: stringify(newValue),
      actor,
    },
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
  actor = "admin",
  activityType: ActivityType = "update"
) {
  const rows = fields
    .filter((f) => stringify(before[f]) !== stringify(after[f]))
    .map((f) => ({
      entityType,
      entityId,
      activityType,
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

export interface TimelineNode {
  entityType: string;
  entityId: string;
  label: string;
  logs: Awaited<ReturnType<typeof getTimeline>>;
  children?: TimelineNode[];
}

// A Client's or Phase's timeline rolls up its descendants' rows too -- "did
// anything change anywhere under this" -- rendered as a nested accordion on
// the frontend (see Timeline.tsx). Requirements are leaves (no children).
export async function getRollup(entityType: "client" | "phase", entityId: string): Promise<TimelineNode> {
  if (entityType === "phase") {
    const phase = await prisma.phase.findUniqueOrThrow({ where: { id: entityId }, include: { requirements: true } });
    const [logs, children] = await Promise.all([
      getTimeline("phase", entityId),
      Promise.all(
        phase.requirements.map(async (r) => ({
          entityType: "requirement",
          entityId: r.id,
          label: r.title,
          logs: await getTimeline("requirement", r.id),
        }))
      ),
    ]);
    return { entityType: "phase", entityId, label: phase.name, logs, children };
  }

  const client = await prisma.client.findUniqueOrThrow({
    where: { id: entityId },
    include: { phases: { include: { requirements: true } } },
  });
  const [logs, children] = await Promise.all([
    getTimeline("client", entityId),
    Promise.all(
      client.phases.map(async (p) => {
        const [phaseLogs, reqChildren] = await Promise.all([
          getTimeline("phase", p.id),
          Promise.all(
            p.requirements.map(async (r) => ({
              entityType: "requirement",
              entityId: r.id,
              label: r.title,
              logs: await getTimeline("requirement", r.id),
            }))
          ),
        ]);
        return { entityType: "phase", entityId: p.id, label: p.name, logs: phaseLogs, children: reqChildren };
      })
    ),
  ]);
  return { entityType: "client", entityId, label: client.name, logs, children };
}
