import type { Client } from "@prisma/client";
import { AdoClient } from "../integrations/ado/client.js";
import { decryptSecret } from "../lib/crypto.js";

export function isAdoConfigured(client: Client): boolean {
  return Boolean(client.adoOrgUrl && client.adoProject && client.adoAreaPath && client.adoPatEncrypted);
}

export function buildAdoClientFor(client: Client): AdoClient {
  if (!isAdoConfigured(client)) {
    throw new Error(`Client "${client.name}" does not have Azure DevOps configured.`);
  }
  return new AdoClient({
    orgUrl: client.adoOrgUrl!,
    project: client.adoProject!,
    areaPath: client.adoAreaPath!,
    pat: decryptSecret(client.adoPatEncrypted!),
  });
}
