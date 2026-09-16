import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { clientsRouter } from "./routes/clients.js";
import { phasesRouter } from "./routes/phases.js";
import { requirementsRouter } from "./routes/requirements.js";
import { releaseNotesRouter } from "./routes/releaseNotes.js";
import { syncRouter } from "./routes/sync.js";
import { figmaRouter } from "./routes/figma.js";
import { stagesRouter } from "./routes/stages.js";
import { workflowsRouter } from "./routes/workflows.js";
import { modulesRouter } from "./routes/modules.js";
import { categoriesRouter } from "./routes/categories.js";
import { auditLogsRouter } from "./routes/auditLogs.js";
import { requireAdmin } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" })); // descriptions + rewritten notes can get long

  app.use("/", healthRouter);

  // Everything else requires the single-admin bearer token.
  app.use(requireAdmin);
  app.use("/clients", clientsRouter);
  app.use("/", phasesRouter);
  app.use("/", requirementsRouter);
  app.use("/", releaseNotesRouter);
  app.use("/", syncRouter);
  app.use("/", figmaRouter);
  app.use("/", stagesRouter);
  app.use("/", workflowsRouter);
  app.use("/", modulesRouter);
  app.use("/", categoriesRouter);
  app.use("/", auditLogsRouter);

  app.use(errorHandler);
  return app;
}
