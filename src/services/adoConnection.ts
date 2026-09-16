import type { Client } from "@prisma/client";
import { AdoClient } from "../integrations/ado/client.js";
import { parseAdoProjectUrl } from "../integrations/ado/urlParsing.js";
import { decryptSecret } from "../lib/crypto.js";

export function isAdoConfigured(client: Client): boolean {
  if (!client.adoProjectUrl || !client.adoPatEncrypted) return false;
  return Boolean(parseAdoProjectUrl(client.adoProjectUrl));
}

export function buildAdoClientFor(client: Client): AdoClient {
  const parsed = client.adoProjectUrl ? parseAdoProjectUrl(client.adoProjectUrl) : null;
  if (!parsed || !client.adoPatEncrypted) {
    throw new Error(`Client "${client.name}" does not have Azure DevOps configured.`);
  }
  return new AdoClient({
    orgUrl: parsed.orgUrl,
    project: parsed.project,
    // ADO defaults a new item's area path to the project name when none is
    // set explicitly -- same default here, so there's no separate field to ask for.
    areaPath: parsed.project,
    pat: decryptSecret(client.adoPatEncrypted),
  });
}
