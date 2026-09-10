import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { encryptSecret } from "../lib/crypto.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import type { Client } from "@prisma/client";

export const clientsRouter = Router();

function sanitize(client: Client) {
  const { adoPatEncrypted, ...rest } = client;
  return { ...rest, adoPatConfigured: Boolean(adoPatEncrypted) };
}

const createSchema = z.object({
  name: z.string().min(1),
  slackChannelId: z.string().optional(),
  slackChannelName: z.string().optional(),
  adoOrgUrl: z.string().url().optional(),
  adoProject: z.string().optional(),
  adoAreaPath: z.string().optional(),
  adoPat: z.string().optional(), // plaintext in, encrypted before storage
  adoDoneStates: z.array(z.string()).optional(),
});

clientsRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
    res.json(clients.map(sanitize));
  })
);

clientsRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: { trackers: true },
    });
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json(sanitize(client));
  })
);

clientsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { adoPat, ...rest } = body;
    const client = await prisma.client.create({
      data: {
        ...rest,
        adoPatEncrypted: adoPat ? encryptSecret(adoPat) : undefined,
      },
    });
    res.status(201).json(sanitize(client));
  })
);

clientsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = createSchema.partial().parse(req.body);
    const { adoPat, ...rest } = body;
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(adoPat ? { adoPatEncrypted: encryptSecret(adoPat) } : {}),
      },
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
