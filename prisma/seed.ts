// Seeds the shared Stage master list plus the two template workflows:
//   - the single PROJECT-scope workflow (outer board)
//   - the default REQUIREMENT-scope template (what new clients clone from)
//
// Run with: npx tsx prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function upsertStage(name: string, opts: { color: string; isDoneStage?: boolean }) {
  return prisma.stage.upsert({
    where: { name },
    update: { color: opts.color, isDoneStage: opts.isDoneStage ?? false },
    create: { name, color: opts.color, isDoneStage: opts.isDoneStage ?? false },
  });
}

async function main() {
  // Shared master list. "In Progress" and "Done" are deliberately reused by
  // both workflows below, to demonstrate stages are a shared pool, not
  // per-workflow copies.
  const stageNew = await upsertStage("New", { color: "#9aa1ac" });
  const stageInProgress = await upsertStage("In Progress", { color: "#5b8cff" });
  const stageOnHold = await upsertStage("On Hold", { color: "#e0a13a" });
  const stageDone = await upsertStage("Done", { color: "#33c17a", isDoneStage: true });
  const stageBacklog = await upsertStage("Backlog", { color: "#9aa1ac" });
  const stageInReview = await upsertStage("In Review", { color: "#a06be0" });

  const existingProjectWorkflow = await prisma.workflow.findFirst({ where: { scope: "PROJECT" } });
  if (!existingProjectWorkflow) {
    await prisma.workflow.create({
      data: {
        name: "Projects",
        scope: "PROJECT",
        isTemplate: true,
        stages: {
          create: [
            { stageId: stageNew.id, position: 1 },
            { stageId: stageInProgress.id, position: 2 },
            { stageId: stageOnHold.id, position: 3 },
            { stageId: stageDone.id, position: 4 },
          ],
        },
      },
    });
    console.log("Created PROJECT workflow: Projects (New -> In Progress -> On Hold -> Done)");
  } else {
    console.log("PROJECT workflow already exists, skipping.");
  }

  const existingRequirementTemplate = await prisma.workflow.findFirst({
    where: { scope: "REQUIREMENT", isTemplate: true },
  });
  if (!existingRequirementTemplate) {
    await prisma.workflow.create({
      data: {
        name: "Default Requirement Workflow",
        scope: "REQUIREMENT",
        isTemplate: true,
        stages: {
          create: [
            { stageId: stageBacklog.id, position: 1 },
            { stageId: stageInProgress.id, position: 2 },
            { stageId: stageInReview.id, position: 3 },
            { stageId: stageDone.id, position: 4 },
          ],
        },
      },
    });
    console.log("Created REQUIREMENT template: Default Requirement Workflow (Backlog -> In Progress -> In Review -> Done)");
  } else {
    console.log("Default REQUIREMENT template already exists, skipping.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
