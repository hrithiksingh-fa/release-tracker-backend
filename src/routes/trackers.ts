import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../middleware/errorHandler.js";

export const trackersRouter = Router();

trackersRouter.get(
  "/clients/:clientId/trackers",
  asyncRoute(async (req, res) => {
    const trackers = await prisma.tracker.findMany({
      where: { clientId: req.params.clientId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { requirements: true } } },
    });
    res.json(trackers);
  })
);

trackersRouter.post(
  "/clients/:clientId/trackers",
  asyncRoute(async (req, res) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    const tracker = await prisma.tracker.create({
      data: { name, clientId: req.params.clientId },
    });
    res.status(201).json(tracker);
  })
);

trackersRouter.get(
  "/trackers/:id",
  asyncRoute(async (req, res) => {
    const tracker = await prisma.tracker.findUnique({
      where: { id: req.params.id },
      include: {
        client: {
          include: {
            requirementWorkflow: { include: { stages: { orderBy: { position: "asc" }, include: { stage: true } } } },
          },
        },
      },
    });
    if (!tracker) return res.status(404).json({ error: "Tracker not found" });
    res.json(tracker);
  })
);

trackersRouter.delete(
  "/trackers/:id",
  asyncRoute(async (req, res) => {
    await prisma.tracker.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
