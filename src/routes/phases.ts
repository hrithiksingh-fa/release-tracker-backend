import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { logDiff, logChange } from "../services/auditService.js";

export const phasesRouter = Router();

const stageInclude = { stage: { include: { stage: true } } } as const;

phasesRouter.get(
  "/clients/:clientId/phases",
  asyncRoute(async (req, res) => {
    const phases = await prisma.phase.findMany({
      where: { clientId: req.params.clientId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { requirements: true } }, ...stageInclude },
    });
    res.json(phases);
  })
);

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  deliveryDate: z.string().datetime().optional(),
});

phasesRouter.post(
  "/clients/:clientId/phases",
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { deliveryDate, ...rest } = body;

    // New phases default to the first stage of their client's own PHASE workflow.
    const client = await prisma.client.findUniqueOrThrow({
      where: { id: req.params.clientId },
      include: { phaseWorkflow: { include: { stages: { orderBy: { position: "asc" } } } } },
    });
    const firstStage = client.phaseWorkflow?.stages[0];

    const phase = await prisma.phase.create({
      data: {
        ...rest,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined,
        clientId: req.params.clientId,
        stageId: firstStage?.id,
      },
      include: stageInclude,
    });
    await logChange("phase", phase.id, "phase", null, phase.name, "admin", "create");
    res.status(201).json(phase);
  })
);

phasesRouter.get(
  "/phases/:id",
  asyncRoute(async (req, res) => {
    const phase = await prisma.phase.findUnique({
      where: { id: req.params.id },
      include: {
        client: {
          include: {
            requirementWorkflow: {
              include: { stages: { orderBy: { position: "asc" }, include: { stage: true } } },
            },
          },
        },
        ...stageInclude,
      },
    });
    if (!phase) return res.status(404).json({ error: "Phase not found" });
    res.json(phase);
  })
);

phasesRouter.patch(
  "/phases/:id",
  asyncRoute(async (req, res) => {
    const body = createSchema.partial().parse(req.body);
    const { deliveryDate, ...rest } = body;

    const before = await prisma.phase.findUniqueOrThrow({ where: { id: req.params.id } });
    const phase = await prisma.phase.update({
      where: { id: req.params.id },
      data: { ...rest, ...(deliveryDate !== undefined ? { deliveryDate: deliveryDate ? new Date(deliveryDate) : null } : {}) },
      include: stageInclude,
    });

    await logDiff("phase", phase.id, before, phase, ["name", "description", "deliveryDate"]);
    res.json(phase);
  })
);

const moveStageSchema = z.object({ stageId: z.string().min(1) }); // a WorkflowStage id

phasesRouter.patch(
  "/phases/:id/stage",
  asyncRoute(async (req, res) => {
    const { stageId } = moveStageSchema.parse(req.body);
    const before = await prisma.phase.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { stage: { include: { stage: true } } },
    });
    const target = await prisma.workflowStage.findUniqueOrThrow({ where: { id: stageId }, include: { stage: true } });

    const phase = await prisma.phase.update({
      where: { id: req.params.id },
      data: { stageId },
      include: stageInclude,
    });

    await logDiff(
      "phase",
      phase.id,
      { stage: before.stage?.stage.name ?? null },
      { stage: target.stage.name },
      ["stage"],
      "admin",
      "stage_change"
    );
    res.json(phase);
  })
);

phasesRouter.delete(
  "/phases/:id",
  asyncRoute(async (req, res) => {
    await prisma.phase.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
