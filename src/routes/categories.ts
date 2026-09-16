import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../middleware/errorHandler.js";

export const categoriesRouter = Router();

categoriesRouter.get(
  "/categories",
  asyncRoute(async (_req, res) => {
    res.json(await prisma.category.findMany({ orderBy: { name: "asc" } }));
  })
);

const createSchema = z.object({ name: z.string().min(1), showByDefault: z.boolean().optional() });

categoriesRouter.post(
  "/categories",
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    res.status(201).json(await prisma.category.create({ data: body }));
  })
);

categoriesRouter.patch(
  "/categories/:id",
  asyncRoute(async (req, res) => {
    const body = createSchema.partial().parse(req.body);
    res.json(await prisma.category.update({ where: { id: req.params.id }, data: body }));
  })
);

categoriesRouter.delete(
  "/categories/:id",
  asyncRoute(async (req, res) => {
    await prisma.category.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
