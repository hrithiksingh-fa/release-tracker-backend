import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { buildAdoClientFor } from "../services/adoConnection.js";

export const requirementsRouter = Router();

requirementsRouter.get(
  "/trackers/:trackerId/requirements",
  asyncRoute(async (req, res) => {
    const requirements = await prisma.requirement.findMany({
      where: { trackerId: req.params.trackerId },
      orderBy: { createdAt: "desc" },
      include: { linkedWorkItems: true, releaseNotes: { orderBy: { version: "desc" }, take: 1 } },
    });
    res.json(requirements);
  })
);

const createRequirementSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

requirementsRouter.post(
  "/trackers/:trackerId/requirements",
  asyncRoute(async (req, res) => {
    const body = createRequirementSchema.parse(req.body);
    const requirement = await prisma.requirement.create({
      data: { ...body, trackerId: req.params.trackerId },
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
        statusEvents: { orderBy: { occurredAt: "desc" } },
      },
    });
    if (!requirement) return res.status(404).json({ error: "Requirement not found" });
    res.json(requirement);
  })
);

requirementsRouter.patch(
  "/requirements/:id",
  asyncRoute(async (req, res) => {
    const body = createRequirementSchema.partial().parse(req.body);
    const requirement = await prisma.requirement.update({ where: { id: req.params.id }, data: body });
    res.json(requirement);
  })
);

requirementsRouter.delete(
  "/requirements/:id",
  asyncRoute(async (req, res) => {
    await prisma.requirement.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// --- Linked work items -----------------------------------------------------
// Two ways to attach an ADO work item to a Requirement:
//  1. Link an existing one by ADO id (fetches its current details immediately).
//  2. Create a brand new PBI in ADO and link the returned id -- the "push" side
//     of the two-way integration.

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
      include: { tracker: { include: { client: true } } },
    });
    if (!requirement) return res.status(404).json({ error: "Requirement not found" });

    const ado = buildAdoClientFor(requirement.tracker.client);

    let adoId: number;
    if (req.body?.adoId) {
      adoId = linkExistingSchema.parse(req.body).adoId;
    } else {
      const created = await ado.createWorkItem({
        ...createInAdoSchema.parse(req.body),
        areaPath: requirement.tracker.client.adoAreaPath!,
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
