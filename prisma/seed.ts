// Seeds the shared Stage master list plus the three template workflows:
//   - the single scope=CLIENT workflow (outer board)
//   - the default scope=PHASE template (what new clients clone for their phases)
//   - the default scope=REQUIREMENT template (what new clients clone for their requirements)
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
  // Shared master list. "In Progress" and "Done" are deliberately reused
  // across all three workflows below, to demonstrate stages are a shared
  // pool, not per-workflow copies.
  const stageNew = await upsertStage("New", { color: "#9aa1ac" });
  const stageInProgress = await upsertStage("In Progress", { color: "#5b8cff" });
  const stageOnHold = await upsertStage("On Hold", { color: "#e0a13a" });
  const stageDone = await upsertStage("Done", { color: "#33c17a", isDoneStage: true });
  const stageBacklog = await upsertStage("Backlog", { color: "#9aa1ac" });
  const stageInReview = await upsertStage("In Review", { color: "#a06be0" });
  const stageOnboarding = await upsertStage("Onboarding", { color: "#33c1c1" });
  const stageScaling = await upsertStage("Scaling", { color: "#c15e33" });

  const existingClientWorkflow = await prisma.workflow.findFirst({ where: { scope: "CLIENT" } });
  if (!existingClientWorkflow) {
    await prisma.workflow.create({
      data: {
        name: "Projects",
        scope: "CLIENT",
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
    console.log("Created CLIENT workflow: Projects (New -> In Progress -> On Hold -> Done)");
  } else {
    console.log("CLIENT workflow already exists, skipping.");
  }

  const existingPhaseTemplate = await prisma.workflow.findFirst({ where: { scope: "PHASE", isTemplate: true } });
  if (!existingPhaseTemplate) {
    await prisma.workflow.create({
      data: {
        name: "Default Phase Workflow",
        scope: "PHASE",
        isTemplate: true,
        stages: {
          create: [
            { stageId: stageOnboarding.id, position: 1 },
            { stageId: stageInProgress.id, position: 2 },
            { stageId: stageScaling.id, position: 3 },
            { stageId: stageDone.id, position: 4 },
          ],
        },
      },
    });
    console.log("Created PHASE template: Default Phase Workflow (Onboarding -> In Progress -> Scaling -> Done)");
  } else {
    console.log("Default PHASE template already exists, skipping.");
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

  await prisma.category.upsert({
    where: { name: "Feasible" },
    update: {},
    create: { name: "Feasible", showByDefault: true },
  });
  await prisma.category.upsert({
    where: { name: "Not Feasible" },
    update: {},
    create: { name: "Not Feasible", showByDefault: false },
  });
  console.log("Ensured default categories: Feasible (shown), Not Feasible (hidden by default)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
