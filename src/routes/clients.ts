import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { encryptSecret } from "../lib/crypto.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { getProjectWorkflow, getDefaultRequirementTemplate, cloneWorkflow } from "../services/workflowService.js";
import type { Client, WorkflowStage, Stage, Workflow } from "@prisma/client";

export const clientsRouter = Router();

type ClientWithRelations = Client & {
  currentStage?: (WorkflowStage & { stage: Stage }) | null;
  requirementWorkflow?: Workflow | null;
};

function sanitize(client: ClientWithRelations) {
  const { adoPatEncrypted, ...rest } = client;
  return { ...rest, adoPatConfigured: Boolean(adoPatEncrypted) };
}

const clientInclude = {
  currentStage: { include: { stage: true } },
  requirementWorkflow: true,
} as const;

const createSchema = z.object({
  name: z.string().min(1),
  slackChannelId: z.string().optional(),
  slackChannelName: z.string().optional(),
  adoOrgUrl: z.string().url().optional(),
  adoProject: z.string().optional(),
  adoAreaPath: z.string().optional(),
  adoPat: z.string().optional(), // plaintext in, encrypted before storage
  adoDoneStates: z.array(z.string()).optional(),
  // Clone this client's requirement workflow instead of the default template.
  cloneRequirementWorkflowFrom: z.string().optional(),
});

clientsRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const clients = await prisma.client.findMany({ orderBy: { name: "asc" }, include: clientInclude });
    res.json(clients.map(sanitize));
  })
);

clientsRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: { trackers: true, ...clientInclude },
    });
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json(sanitize(client));
  })
);

clientsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { adoPat, cloneRequirementWorkflowFrom, ...rest } = body;

    const projectWorkflow = await getProjectWorkflow();
    const firstStage = projectWorkflow.stages[0];
    if (!firstStage) {
      return res.status(500).json({ error: "PROJECT workflow has no stages configured." });
    }

    const client = await prisma.client.create({
      data: {
        ...rest,
        adoPatEncrypted: adoPat ? encryptSecret(adoPat) : undefined,
        currentStageId: firstStage.id,
      },
    });

    try {
      let sourceWorkflowId: string;
      if (cloneRequirementWorkflowFrom) {
        const sourceClient = await prisma.client.findUniqueOrThrow({
          where: { id: cloneRequirementWorkflowFrom },
          include: { requirementWorkflow: true },
        });
        if (!sourceClient.requirementWorkflow) {
          throw new Error(`Client "${sourceClient.name}" has no requirement workflow to clone.`);
        }
        sourceWorkflowId = sourceClient.requirementWorkflow.id;
      } else {
        sourceWorkflowId = (await getDefaultRequirementTemplate()).id;
      }
      await cloneWorkflow({ sourceWorkflowId, name: `${client.name} Requirements`, ownerClientId: client.id });
    } catch (err) {
      // Don't leave a client stranded without a requirement workflow -- roll back.
      await prisma.client.delete({ where: { id: client.id } });
      throw err;
    }

    const full = await prisma.client.findUniqueOrThrow({ where: { id: client.id }, include: clientInclude });
    res.status(201).json(sanitize(full));
  })
);

clientsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = createSchema.omit({ cloneRequirementWorkflowFrom: true }).partial().parse(req.body);
    const { adoPat, ...rest } = body;
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(adoPat ? { adoPatEncrypted: encryptSecret(adoPat) } : {}),
      },
      include: clientInclude,
    });
    res.json(sanitize(client));
  })
);

const stageSchema = z.object({ stageId: z.string().min(1) }); // a WorkflowStage id

clientsRouter.patch(
  "/:id/stage",
  asyncRoute(async (req, res) => {
    const { stageId } = stageSchema.parse(req.body);
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { currentStageId: stageId },
      include: clientInclude,
    });
    res.json(sanitize(client));
  })
);

clientsRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
