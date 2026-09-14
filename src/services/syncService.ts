import { prisma } from "../db.js";
import { buildAdoClientFor, isAdoConfigured } from "./adoConnection.js";
import { logChange } from "./auditService.js";

export interface SyncResult {
  syncRunId: string;
  clientsSynced: number;
  linkedItemsUpdated: number;
  errors: string[];
}

// The EOD sync: pull current ADO state for every linked work item and cache
// it on the LinkedWorkItem row, logging a StatusEvent for anything that
// changed. It never touches a Requirement's stage -- stage moves are fully
// manual (drag-and-drop / PATCH /requirements/:id/stage), which is also what
// triggers release note generation. Sync is purely "keep the cached ADO data
// fresh so the board has current info to look at."
export async function runEodSync(): Promise<SyncResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let clientsSynced = 0;
  let linkedItemsUpdated = 0;

  const clients = await prisma.client.findMany({
    include: {
      phases: {
        include: {
          requirements: { include: { linkedWorkItems: true } },
        },
      },
    },
  });

  for (const client of clients) {
    if (!isAdoConfigured(client)) continue;

    let adoClient;
    try {
      adoClient = buildAdoClientFor(client);
    } catch (err) {
      errors.push(`[${client.name}] failed to build ADO client: ${(err as Error).message}`);
      continue;
    }

    for (const phase of client.phases) {
      for (const requirement of phase.requirements) {
        for (const li of requirement.linkedWorkItems) {
          try {
            const details = await adoClient.getWorkItem(li.adoId);
            const changed = details.state !== li.adoState;

            await prisma.linkedWorkItem.update({
              where: { id: li.id },
              data: {
                title: details.title,
                descriptionText: details.descriptionText,
                acceptanceCriteriaText: details.acceptanceCriteriaText,
                adoState: details.state,
                productOwner: details.productOwner,
                assignedTo: details.assignedTo,
                lastSyncedAt: new Date(),
              },
            });

            if (changed) {
              linkedItemsUpdated++;
              await logChange("linked_item", li.id, "adoState", li.adoState, details.state, "system:eod_sync");
            }
          } catch (err) {
            errors.push(
              `[${client.name}] requirement ${requirement.id} / ADO#${li.adoId}: ${(err as Error).message}`
            );
          }
        }
      }
    }

    clientsSynced++;
  }

  const run = await prisma.syncRun.create({
    data: { startedAt, finishedAt: new Date(), clientsSynced, linkedItemsUpdated, errors },
  });

  return { syncRunId: run.id, clientsSynced, linkedItemsUpdated, errors };
}
