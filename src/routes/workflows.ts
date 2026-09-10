import { Router } from "express";
import { z } from "zod";
import { WorkflowScope } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { cloneWorkflow } from "../services/workflowService.js";

export const workflowsRouter = Router();

workflowsRouter.get(
  "/workflows",
  asyncRoute(async (req, res) => {
    const scope = req.query.scope as string | undefined;
    const workflows = await prisma.workflow.findMany({
      where: scope ? { scope: scope.toUpperCase() as WorkflowScope } : undefined,
      orderBy: { createdAt: "asc" },
      include: { stages: { orderBy: { position: "asc" }, include: { stage: true } }, ownerClient: true },
    });
    res.json(workflows);
  })
);

workflowsRouter.get(
  "/workflows/:id",
  asyncRoute(async (req, res) => {
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: { stages: { orderBy: { position: "asc" }, include: { stage: true } }, ownerClient: true },
    });
    if (!workflow) return res.status(404).json({ error: "Workflow not found" });
    res.json(workflow);
  })
);

const cloneSchema = z.object({
  name: z.string().min(1),
  ownerClientId: z.string().optional(),
  isTemplate: z.boolean().optional(),
});

// "Create or copy from another project" -- clones another workflow's stage
// sequence (same Stage references, same order) into a brand-new Workflow.
workflowsRouter.post(
  "/workflows/:id/clone",
  asyncRoute(async (req, res) => {
    const body = cloneSchema.parse(req.body);
    const cloned = await cloneWorkflow({ sourceWorkflowId: req.params.id, ...body });
    res.status(201).json(cloned);
  })
);

const addStageSchema = z.object({
  stageId: z.string().min(1),
  position: z.number().int().positive().optional(),
});

workflowsRouter.post(
  "/workflows/:id/stages",
  asyncRoute(async (req, res) => {
    const body = addStageSchema.parse(req.body);
    const workflowId = req.params.id;
    const position =
      body.position ??
      ((await prisma.workflowStage.aggregate({ where: { workflowId }, _max: { position: true } }))._max
        .position ?? 0) + 1;
    const workflowStage = await prisma.workflowStage.create({
      data: { workflowId, stageId: body.stageId, position },
      include: { stage: true },
    });
    res.status(201).json(workflowStage);
  })
);

workflowsRouter.delete(
  "/workflows/:id/stages/:workflowStageId",
  asyncRoute(async (req, res) => {
    await prisma.workflowStage.delete({ where: { id: req.params.workflowStageId } });
    res.status(204).send();
  })
);

const reorderSchema = z.object({ orderedWorkflowStageIds: z.array(z.string()).min(1) });

workflowsRouter.put(
  "/workflows/:id/stages/reorder",
  asyncRoute(async (req, res) => {
    const { orderedWorkflowStageIds } = reorderSchema.parse(req.body);
    await prisma.$transaction(
      orderedWorkflowStageIds.map((id, index) =>
        prisma.workflowStage.update({ where: { id }, data: { position: index + 1 } })
      )
    );
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: { stages: { orderBy: { position: "asc" }, include: { stage: true } } },
    });
    res.json(workflow);
  })
);
