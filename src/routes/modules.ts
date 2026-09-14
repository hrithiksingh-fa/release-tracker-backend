import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../middleware/errorHandler.js";

export const modulesRouter = Router();

modulesRouter.get(
  "/modules",
  asyncRoute(async (_req, res) => {
    res.json(await prisma.module.findMany({ orderBy: { name: "asc" } }));
  })
);

const createSchema = z.object({ name: z.string().min(1), description: z.string().optional() });

modulesRouter.post(
  "/modules",
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    res.status(201).json(await prisma.module.create({ data: body }));
  })
);

modulesRouter.patch(
  "/modules/:id",
  asyncRoute(async (req, res) => {
    const body = createSchema.partial().parse(req.body);
    res.json(await prisma.module.update({ where: { id: req.params.id }, data: body }));
  })
);

modulesRouter.delete(
  "/modules/:id",
  asyncRoute(async (req, res) => {
    await prisma.module.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
