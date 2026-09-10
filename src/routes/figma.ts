import { Router } from "express";
import { z } from "zod";
import { asyncRoute } from "../middleware/errorHandler.js";
import { env } from "../env.js";
import * as figma from "../integrations/figma/client.js";
import { parseFigmaUrl } from "../integrations/figma/urlParsing.js";

export const figmaRouter = Router();

// Org-wide browsing needs a team id (a personal access token alone can't
// enumerate every file in an org). Defaults to FIGMA_TEAM_ID if set, but a
// query param lets you browse a different team without restarting the server.
figmaRouter.get(
  "/figma/projects",
  asyncRoute(async (req, res) => {
    const teamId = (req.query.teamId as string | undefined) ?? env.figmaTeamId;
    if (!teamId) {
      return res.status(400).json({
        error: "No Figma team id available. Set FIGMA_TEAM_ID, or pass ?teamId=... explicitly.",
      });
    }
    const projects = await figma.listTeamProjects(teamId);
    res.json(projects);
  })
);

figmaRouter.get(
  "/figma/projects/:projectId/files",
  asyncRoute(async (req, res) => {
    const files = await figma.listProjectFiles(req.params.projectId);
    res.json(files);
  })
);

const previewSchema = z.object({ url: z.string().url() });

// Lets the frontend show a preview before attaching a Figma link to a requirement.
figmaRouter.post(
  "/figma/preview",
  asyncRoute(async (req, res) => {
    const { url } = previewSchema.parse(req.body);
    const parsed = parseFigmaUrl(url);
    if (!parsed) return res.status(400).json({ error: "Not a recognizable Figma file URL." });

    const file = await figma.getFile(parsed.fileKey);
    const thumbnailUrl = parsed.nodeId
      ? (await figma.getNodeImageUrl(parsed.fileKey, parsed.nodeId)) ?? file.thumbnailUrl
      : file.thumbnailUrl;

    res.json({ fileKey: parsed.fileKey, nodeId: parsed.nodeId, fileName: file.name, thumbnailUrl });
  })
);
