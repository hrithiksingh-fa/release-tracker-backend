import { Router } from "express";
import { z } from "zod";
import { RequirementPriority } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { buildAdoClientFor } from "../services/adoConnection.js";
import * as figma from "../integrations/figma/client.js";
import { parseFigmaUrl } from "../integrations/figma/urlParsing.js";
import { generateDraftReleaseNote } from "../services/releaseNoteService.js";
import { logDiff } from "../services/auditService.js";

export const requirementsRouter = Router();

const stageInclude = { stage: { include: { stage: true } } } as const;

requirementsRouter.get(
  "/phases/:phaseId/requirements",
  asyncRoute(async (req, res) => {
    const requirements = await prisma.requirement.findMany({
      where: { phaseId: req.params.phaseId },
      orderBy: { createdAt: "desc" },
      include: {
        linkedWorkItems: true,
        releaseNotes: { orderBy: { version: "desc" }, take: 1 },
        figmaReferences: { orderBy: { addedAt: "desc" } },
        ...stageInclude,
      },
    });
    res.json(requirements);
  })
);

const createRequirementSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.nativeEnum(RequirementPriority).optional(),
  dueDate: z.string().datetime().optional(),
  revisedDueDate: z.string().datetime().optional(),
});

requirementsRouter.post(
  "/phases/:phaseId/requirements",
  asyncRoute(async (req, res) => {
    const body = createRequirementSchema.parse(req.body);
    const { dueDate, revisedDueDate, ...rest } = body;

    // New requirements default to the first stage of their client's own
    // requirement workflow -- the leftmost board column, same principle as a
    // new Client starting at the CLIENT workflow's first stage.
    const phase = await prisma.phase.findUniqueOrThrow({
      where: { id: req.params.phaseId },
      include: { client: { include: { requirementWorkflow: { include: { stages: { orderBy: { position: "asc" } } } } } } },
    });
    const firstStage = phase.client.requirementWorkflow?.stages[0];

    const requirement = await prisma.requirement.create({
      data: {
        ...rest,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        revisedDueDate: revisedDueDate ? new Date(revisedDueDate) : undefined,
        phaseId: req.params.phaseId,
        stageId: firstStage?.id,
      },
      include: stageInclude,
    });
    res.status(201).json(requirement);
  })
);

requirementsRouter.get(
  "/requirements/:id",
  asyncRoute(async (req, res) => {
    const requirement = await prisma.requirement.findUnique({
      where: { id: req.params.id },
      include: {
        linkedWorkItems: true,
        releaseNotes: { orderBy: { version: "desc" } },
        figmaReferences: { orderBy: { addedAt: "desc" } },
        phase: {
          include: {
            client: {
              include: {
                requirementWorkflow: {
                  include: { stages: { orderBy: { position: "asc" }, include: { stage: true } } },
                },
              },
            },
          },
        },
        ...stageInclude,
      },
    });
    if (!requirement) return res.status(404).json({ error: "Requirement not found" });
    res.json(requirement);
  })
);

const AUDITED_FIELDS = ["title", "description", "priority", "dueDate", "revisedDueDate"] as const;

requirementsRouter.patch(
  "/requirements/:id",
  asyncRoute(async (req, res) => {
    const body = createRequirementSchema.partial().parse(req.body);
    const { dueDate, revisedDueDate, ...rest } = body;

    const before = await prisma.requirement.findUniqueOrThrow({ where: { id: req.params.id } });
    const requirement = await prisma.requirement.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        ...(revisedDueDate !== undefined ? { revisedDueDate: revisedDueDate ? new Date(revisedDueDate) : null } : {}),
      },
      include: stageInclude,
    });

    await logDiff("requirement", requirement.id, before, requirement, AUDITED_FIELDS);
    res.json(requirement);
  })
);

const moveStageSchema = z.object({ stageId: z.string().min(1) }); // a WorkflowStage id

// The only way a Requirement's stage changes -- fully manual, never touched
// by ADO sync (see syncService.ts). Moving into a stage flagged isDoneStage
// generates a release note draft; moving out of one clears doneAt.
requirementsRouter.patch(
  "/requirements/:id/stage",
  asyncRoute(async (req, res) => {
    const { stageId } = moveStageSchema.parse(req.body);
    const previous = await prisma.requirement.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { stage: { include: { stage: true } } },
    });
    const target = await prisma.workflowStage.findUniqueOrThrow({
      where: { id: stageId },
      include: { stage: true },
    });

    const requirement = await prisma.requirement.update({
      where: { id: req.params.id },
      data: { stageId, doneAt: target.stage.isDoneStage ? new Date() : null },
      include: stageInclude,
    });

    await logDiff(
      "requirement",
      requirement.id,
      { stage: previous.stage?.stage.name ?? null },
      { stage: target.stage.name },
      ["stage"]
    );

    let releaseNoteWarning: string | null = null;
    if (target.stage.isDoneStage) {
      try {
        await generateDraftReleaseNote(req.params.id);
      } catch (err) {
        releaseNoteWarning = err instanceof Error ? err.message : "Failed to generate release note draft.";
      }
    }

    res.json({ ...requirement, releaseNoteWarning });
  })
);

requirementsRouter.delete(
  "/requirements/:id",
  asyncRoute(async (req, res) => {
    await prisma.requirement.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// --- Linked PBIs (Product Backlog Items, via Azure DevOps) ------------------
// Two ways to attach one to a Requirement:
//  1. Link an existing one by ADO id (fetches its current details immediately).
//  2. Create a brand new PBI in ADO and link the returned id -- the "push" side
//     of the two-way integration.
// A Requirement can have several linked PBIs.

const linkExistingSchema = z.object({ adoId: z.number().int().positive() });
const createInAdoSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  workItemType: z.string().default("Product Backlog Item"),
});

requirementsRouter.post(
  "/requirements/:id/linked-work-items",
  asyncRoute(async (req, res) => {
    const requirement = await prisma.requirement.findUnique({
      where: { id: req.params.id },
      include: { phase: { include: { client: true } } },
    });
    if (!requirement) return res.status(404).json({ error: "Requirement not found" });

    const ado = buildAdoClientFor(requirement.phase.client);

    let adoId: number;
    if (req.body?.adoId) {
      adoId = linkExistingSchema.parse(req.body).adoId;
    } else {
      const created = await ado.createWorkItem({
        ...createInAdoSchema.parse(req.body),
        areaPath: requirement.phase.client.adoAreaPath!,
      });
      adoId = created.adoId;
    }

    const details = await ado.getWorkItem(adoId);
    const linked = await prisma.linkedWorkItem.create({
      data: {
        requirementId: requirement.id,
        adoId,
        title: details.title,
        descriptionText: details.descriptionText,
        acceptanceCriteriaText: details.acceptanceCriteriaText,
        adoState: details.state,
        productOwner: details.productOwner,
        assignedTo: details.assignedTo,
        lastSyncedAt: new Date(),
      },
    });
    res.status(201).json(linked);
  })
);

requirementsRouter.delete(
  "/requirements/:id/linked-work-items/:linkedId",
  asyncRoute(async (req, res) => {
    await prisma.linkedWorkItem.delete({ where: { id: req.params.linkedId } });
    res.status(204).send();
  })
);

// --- Figma references -------------------------------------------------------
// Design references for a requirement -- paste a Figma file/frame URL, we
// resolve it to a file key (+ optional node id) and cache a thumbnail.

const attachFigmaSchema = z.object({ url: z.string().url() });

requirementsRouter.post(
  "/requirements/:id/figma-links",
  asyncRoute(async (req, res) => {
    const { url } = attachFigmaSchema.parse(req.body);
    const parsed = parseFigmaUrl(url);
    if (!parsed) return res.status(400).json({ error: "Not a recognizable Figma file URL." });

    const file = await figma.getFile(parsed.fileKey);
    const thumbnailUrl = parsed.nodeId
      ? (await figma.getNodeImageUrl(parsed.fileKey, parsed.nodeId)) ?? file.thumbnailUrl
      : file.thumbnailUrl;

    const reference = await prisma.figmaReference.create({
      data: {
        requirementId: req.params.id,
        fileKey: parsed.fileKey,
        nodeId: parsed.nodeId,
        fileName: file.name,
        url,
        thumbnailUrl,
      },
    });
    res.status(201).json(reference);
  })
);

requirementsRouter.delete(
  "/requirements/:id/figma-links/:referenceId",
  asyncRoute(async (req, res) => {
    await prisma.figmaReference.delete({ where: { id: req.params.referenceId } });
    res.status(204).send();
  })
);
