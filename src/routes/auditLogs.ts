import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { getTimeline } from "../services/auditService.js";

export const auditLogsRouter = Router();

const querySchema = z.object({ entityType: z.string().min(1), entityId: z.string().min(1) });

// Powers the "view timeline" action on Client/Phase/Requirement detail pages.
auditLogsRouter.get(
  "/audit-logs",
  asyncRoute(async (req, res) => {
    const { entityType, entityId } = querySchema.parse(req.query);
    res.json(await getTimeline(entityType, entityId));
  })
);
