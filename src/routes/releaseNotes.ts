import { Router } from "express";
import { z } from "zod";
import { ReleaseNoteStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { approveReleaseNote, sendReleaseNote } from "../services/releaseNoteService.js";

export const releaseNotesRouter = Router();

const statusQuerySchema = z.nativeEnum(ReleaseNoteStatus).optional();

// Review queue: defaults to DRAFT (needs review), pass ?status=APPROVED etc. for others.
releaseNotesRouter.get(
  "/release-notes",
  asyncRoute(async (req, res) => {
    const status = statusQuerySchema.parse(
      (req.query.status as string | undefined)?.toUpperCase()
    );
    const notes = await prisma.releaseNote.findMany({
      where: { status: status ?? "DRAFT" },
      orderBy: { generatedAt: "desc" },
      include: {
        requirement: {
          include: { linkedWorkItems: true, phase: { include: { client: true } } },
        },
      },
    });
    res.json(notes);
  })
);

releaseNotesRouter.get(
  "/release-notes/:id",
  asyncRoute(async (req, res) => {
    const note = await prisma.releaseNote.findUnique({
      where: { id: req.params.id },
      include: {
        requirement: { include: { linkedWorkItems: true, phase: { include: { client: true } } } },
        deliveries: { orderBy: { attemptedAt: "desc" } },
      },
    });
    if (!note) return res.status(404).json({ error: "Release note not found" });
    res.json(note);
  })
);

const editSchema = z.object({
  problemStatement: z.string().optional(),
  objective: z.string().nullable().optional(),
  stepsToUse: z.string().nullable().optional(),
  acceptanceCriteria: z.string().optional(),
  category: z.string().optional(),
  screens: z.array(z.string()).optional(),
});

// Editing is only meaningful pre-send; the route doesn't hard-block by status so
// you can still fix a typo on something that failed to send, but the UI should
// only expose this for DRAFT/APPROVED/FAILED notes.
releaseNotesRouter.patch(
  "/release-notes/:id",
  asyncRoute(async (req, res) => {
    const body = editSchema.parse(req.body);
    const note = await prisma.releaseNote.update({ where: { id: req.params.id }, data: body });
    res.json(note);
  })
);

releaseNotesRouter.post(
  "/release-notes/:id/approve",
  asyncRoute(async (req, res) => {
    const note = await approveReleaseNote(req.params.id);
    res.json(note);
  })
);

releaseNotesRouter.post(
  "/release-notes/:id/send",
  asyncRoute(async (req, res) => {
    const note = await sendReleaseNote(req.params.id);
    res.json(note);
  })
);
