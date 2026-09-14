import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { encryptSecret } from "../lib/crypto.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { getClientWorkflow, getDefaultTemplate, cloneWorkflow } from "../services/workflowService.js";
import { logDiff } from "../services/auditService.js";
import type { Client, WorkflowStage, Stage, Workflow, Module } from "@prisma/client";

export const clientsRouter = Router();

type ClientWithRelations = Client & {
  currentStage?: (WorkflowStage & { stage: Stage }) | null;
  phaseWorkflow?: Workflow | null;
  requirementWorkflow?: Workflow | null;
  modules?: Module[];
};

function sanitize(client: ClientWithRelations) {
  const { adoPatEncrypted, ...rest } = client;
  return { ...rest, adoPatConfigured: Boolean(adoPatEncrypted) };
}

const clientInclude = {
  currentStage: { include: { stage: true } },
  phaseWorkflow: true,
  requirementWorkflow: true,
  modules: true,
} as const;

const AUDITED_FIELDS = [
  "name",
  "description",
  "productOwner",
  "deliveryDate",
  "slackChannelId",
  "slackChannelName",
  "adoOrgUrl",
  "adoProject",
  "adoAreaPath",
  "adoDoneStates",
] as const;

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  productOwner: z.string().optional(),
  deliveryDate: z.string().datetime().optional(),
  slackChannelId: z.string().optional(),
  slackChannelName: z.string().optional(),
  adoOrgUrl: z.string().url().optional(),
  adoProject: z.string().optional(),
  adoAreaPath: z.string().optional(),
  adoPat: z.string().optional(), // plaintext in, encrypted before storage
  adoDoneStates: z.array(z.string()).optional(),
  moduleIds: z.array(z.string()).optional(),
  // Clone this client's phase/requirement workflows instead of the default templates.
  clonePhaseWorkflowFrom: z.string().optional(),
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
      include: { phases: true, ...clientInclude },
    });
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json(sanitize(client));
  })
);

async function cloneClientWorkflow(scope: "PHASE" | "REQUIREMENT", clientName: string, sourceClientId?: string) {
  if (sourceClientId) {
    const sourceClient = await prisma.client.findUniqueOrThrow({
      where: { id: sourceClientId },
      include: { phaseWorkflow: true, requirementWorkflow: true },
    });
    const source = scope === "PHASE" ? sourceClient.phaseWorkflow : sourceClient.requirementWorkflow;
    if (!source) throw new Error(`Client "${sourceClient.name}" has no ${scope.toLowerCase()} workflow to clone.`);
    return cloneWorkflow({ sourceWorkflowId: source.id, name: `${clientName} ${scope === "PHASE" ? "Phases" : "Requirements"}` });
  }
  const template = await getDefaultTemplate(scope);
  return cloneWorkflow({
    sourceWorkflowId: template.id,
    name: `${clientName} ${scope === "PHASE" ? "Phases" : "Requirements"}`,
  });
}

clientsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { adoPat, moduleIds, clonePhaseWorkflowFrom, cloneRequirementWorkflowFrom, deliveryDate, ...rest } = body;

    const clientWorkflow = await getClientWorkflow();
    const firstStage = clientWorkflow.stages[0];
    if (!firstStage) {
      return res.status(500).json({ error: "CLIENT workflow has no stages configured." });
    }

    const phaseWorkflow = await cloneClientWorkflow("PHASE", rest.name, clonePhaseWorkflowFrom);
    const requirementWorkflow = await cloneClientWorkflow("REQUIREMENT", rest.name, cloneRequirementWorkflowFrom);

    const client = await prisma.client.create({
      data: {
        ...rest,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined,
        adoPatEncrypted: adoPat ? encryptSecret(adoPat) : undefined,
        currentStageId: firstStage.id,
        phaseWorkflowId: phaseWorkflow.id,
        requirementWorkflowId: requirementWorkflow.id,
        modules: moduleIds ? { connect: moduleIds.map((id) => ({ id })) } : undefined,
      },
      include: clientInclude,
    });
    res.status(201).json(sanitize(client));
  })
);

clientsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = createSchema
      .omit({ clonePhaseWorkflowFrom: true, cloneRequirementWorkflowFrom: true })
      .partial()
      .parse(req.body);
    const { adoPat, moduleIds, deliveryDate, ...rest } = body;

    const before = await prisma.client.findUniqueOrThrow({ where: { id: req.params.id } });

    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(deliveryDate !== undefined ? { deliveryDate: deliveryDate ? new Date(deliveryDate) : null } : {}),
        ...(adoPat ? { adoPatEncrypted: encryptSecret(adoPat) } : {}),
        ...(moduleIds ? { modules: { set: moduleIds.map((id) => ({ id })) } } : {}),
      },
      include: clientInclude,
    });

    await logDiff("client", client.id, before, client, AUDITED_FIELDS);
    res.json(sanitize(client));
  })
);

const stageSchema = z.object({ stageId: z.string().min(1) }); // a WorkflowStage id

clientsRouter.patch(
  "/:id/stage",
  asyncRoute(async (req, res) => {
    const { stageId } = stageSchema.parse(req.body);
    const before = await prisma.client.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { currentStage: { include: { stage: true } } },
    });
    const target = await prisma.workflowStage.findUniqueOrThrow({ where: { id: stageId }, include: { stage: true } });

    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { currentStageId: stageId },
      include: clientInclude,
    });

    await logDiff("client", client.id, { stage: before.currentStage?.stage.name ?? null }, { stage: target.stage.name }, ["stage"]);
    res.json(sanitize(client));
  })
);

// Attach an existing workflow (created from scratch or cloned) as this
// client's phase or requirement workflow -- the admin-panel "attach workflow
// to entity" action. Requires the workflow's scope to match.
const attachWorkflowSchema = z.object({
  scope: z.enum(["PHASE", "REQUIREMENT"]),
  workflowId: z.string().min(1),
});

clientsRouter.patch(
  "/:id/workflows",
  asyncRoute(async (req, res) => {
    const { scope, workflowId } = attachWorkflowSchema.parse(req.body);
    const workflow = await prisma.workflow.findUniqueOrThrow({ where: { id: workflowId } });
    if (workflow.scope !== scope) {
      return res.status(400).json({ error: `Workflow "${workflow.name}" is scope ${workflow.scope}, not ${scope}.` });
    }
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: scope === "PHASE" ? { phaseWorkflowId: workflowId } : { requirementWorkflowId: workflowId },
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
