import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { getTimeline, getRollup } from "../services/auditService.js";

export const auditLogsRouter = Router();

const querySchema = z.object({ entityType: z.string().min(1), entityId: z.string().min(1) });

// Flat log for one entity -- used for Requirements (leaves, no children).
auditLogsRouter.get(
  "/audit-logs",
  asyncRoute(async (req, res) => {
    const { entityType, entityId } = querySchema.parse(req.query);
    res.json(await getTimeline(entityType, entityId));
  })
);

const rollupQuerySchema = z.object({
  entityType: z.enum(["client", "phase"]),
  entityId: z.string().min(1),
});

// Nested tree: this entity's own logs + every descendant's, grouped --
// powers the accordion timeline on Client/Phase detail pages.
auditLogsRouter.get(
  "/audit-logs/rollup",
  asyncRoute(async (req, res) => {
    const { entityType, entityId } = rollupQuerySchema.parse(req.query);
    res.json(await getRollup(entityType, entityId));
  })
);
