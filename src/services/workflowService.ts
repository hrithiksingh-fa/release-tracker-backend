import { prisma } from "../db.js";

// There's exactly one PROJECT-scope workflow (the outer board governing every
// Client's stage) -- seeded once, see prisma/seed.ts. Throws if it's missing
// rather than silently creating one, since a missing seed means something
// went wrong with setup, not a normal empty state.
export async function getProjectWorkflow() {
  const workflow = await prisma.workflow.findFirst({
    where: { scope: "PROJECT" },
    include: { stages: { orderBy: { position: "asc" }, include: { stage: true } } },
  });
  if (!workflow) {
    throw new Error("No PROJECT-scope workflow exists. Run the seed script (prisma/seed.ts) first.");
  }
  return workflow;
}

// The workflow new clients clone their own REQUIREMENT workflow from by
// default (when the caller doesn't specify a different source to clone).
export async function getDefaultRequirementTemplate() {
  const workflow = await prisma.workflow.findFirst({
    where: { scope: "REQUIREMENT", isTemplate: true },
    include: { stages: { orderBy: { position: "asc" }, include: { stage: true } } },
  });
  if (!workflow) {
    throw new Error("No default REQUIREMENT workflow template exists. Run the seed script (prisma/seed.ts) first.");
  }
  return workflow;
}

export interface CloneWorkflowOptions {
  sourceWorkflowId: string;
  name: string;
  ownerClientId?: string | null;
  isTemplate?: boolean;
}

// Clones a workflow's stage sequence (same Stage references, same order) into
// a brand-new Workflow row. Used both for "new client -> clone the template"
// and for the explicit "copy this workflow from another project" action.
export async function cloneWorkflow({ sourceWorkflowId, name, ownerClientId, isTemplate }: CloneWorkflowOptions) {
  const source = await prisma.workflow.findUniqueOrThrow({
    where: { id: sourceWorkflowId },
    include: { stages: { orderBy: { position: "asc" } } },
  });

  return prisma.workflow.create({
    data: {
      name,
      scope: source.scope,
      isTemplate: isTemplate ?? false,
      ownerClientId: ownerClientId ?? null,
      stages: {
        create: source.stages.map((s) => ({ stageId: s.stageId, position: s.position })),
      },
    },
    include: { stages: { orderBy: { position: "asc" }, include: { stage: true } } },
  });
}
