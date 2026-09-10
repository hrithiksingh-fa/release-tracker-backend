import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../middleware/errorHandler.js";

export const stagesRouter = Router();

// The shared Stage master list -- reusable across any workflow.
stagesRouter.get(
  "/stages",
  asyncRoute(async (_req, res) => {
    const stages = await prisma.stage.findMany({ orderBy: { name: "asc" } });
    res.json(stages);
  })
);

const createStageSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  isDoneStage: z.boolean().optional(),
});

stagesRouter.post(
  "/stages",
  asyncRoute(async (req, res) => {
    const body = createStageSchema.parse(req.body);
    const stage = await prisma.stage.create({ data: body });
    res.status(201).json(stage);
  })
);

stagesRouter.patch(
  "/stages/:id",
  asyncRoute(async (req, res) => {
    const body = createStageSchema.partial().parse(req.body);
    const stage = await prisma.stage.update({ where: { id: req.params.id }, data: body });
    res.json(stage);
  })
);

stagesRouter.delete(
  "/stages/:id",
  asyncRoute(async (req, res) => {
    await prisma.stage.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
