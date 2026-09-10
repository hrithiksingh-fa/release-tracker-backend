import { Router } from "express";
import { prisma } from "../db.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { runEodSync } from "../services/syncService.js";

export const syncRouter = Router();

// Manual trigger, in addition to the scheduled EOD cron job (see jobs/eodSync.ts).
syncRouter.post(
  "/sync/run",
  asyncRoute(async (_req, res) => {
    const result = await runEodSync();
    res.json(result);
  })
);

syncRouter.get(
  "/sync/runs",
  asyncRoute(async (_req, res) => {
    const runs = await prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 });
    res.json(runs);
  })
);
