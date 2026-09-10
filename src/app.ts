import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { clientsRouter } from "./routes/clients.js";
import { trackersRouter } from "./routes/trackers.js";
import { requirementsRouter } from "./routes/requirements.js";
import { releaseNotesRouter } from "./routes/releaseNotes.js";
import { syncRouter } from "./routes/sync.js";
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
  app.use("/", trackersRouter);
  app.use("/", requirementsRouter);
  app.use("/", releaseNotesRouter);
  app.use("/", syncRouter);

  app.use(errorHandler);
  return app;
}
