import { prisma } from "../db.js";
import { buildAdoClientFor, isAdoConfigured } from "./adoConnection.js";
import { generateDraftReleaseNote } from "./releaseNoteService.js";
import type { RequirementStatus } from "@prisma/client";

// Boards that don't set adoDoneStates on the Client still need *some* signal that
// an item hasn't been picked up yet, so a Requirement with all-untouched items
// reads as NOT_STARTED rather than IN_PROGRESS. Tune per client later if needed.
const DEFAULT_NOT_STARTED_STATES = ["New", "To Do", "Backlog", "Proposed"];

function deriveStatus(
  linkedStates: string[],
  doneStates: string[]
): RequirementStatus {
  if (!linkedStates.length) return "NOT_STARTED";
  const allDone = linkedStates.every((s) => doneStates.includes(s));
  if (allDone) return "DONE";
  const anyStarted = linkedStates.some((s) => !DEFAULT_NOT_STARTED_STATES.includes(s));
  return anyStarted ? "IN_PROGRESS" : "NOT_STARTED";
}

export interface SyncResult {
  syncRunId: string;
  clientsSynced: number;
  linkedItemsUpdated: number;
  requirementsCompleted: number;
  errors: string[];
}

// The EOD sync: pull current ADO state for every linked work item, recompute each
// requirement's derived status, and generate a draft release note for any
// requirement that just became fully DONE. Never sends anything -- that's a
// separate, explicit review+approve+send step (see releaseNoteService).
export async function runEodSync(): Promise<SyncResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let clientsSynced = 0;
  let linkedItemsUpdated = 0;
  let requirementsCompleted = 0;

  const clients = await prisma.client.findMany({
    include: {
      trackers: {
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

    for (const tracker of client.trackers) {
      for (const requirement of tracker.requirements) {
        if (!requirement.linkedWorkItems.length) continue;

        const updatedStates: string[] = [];
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
              await prisma.statusEvent.create({
                data: {
                  requirementId: requirement.id,
                  scope: "linked_item",
                  adoId: li.adoId,
                  fromStatus: li.adoState,
                  toStatus: details.state,
                  actor: "system:eod_sync",
                },
              });
            }
            updatedStates.push(details.state);
          } catch (err) {
            errors.push(
              `[${client.name}] requirement ${requirement.id} / ADO#${li.adoId}: ${(err as Error).message}`
            );
            // Keep the last-known state so one flaky item doesn't wrongly flip the
            // whole requirement's derived status back to NOT_STARTED.
            updatedStates.push(li.adoState ?? "");
          }
        }

        const newStatus = deriveStatus(updatedStates, client.adoDoneStates);
        if (newStatus !== requirement.status) {
          await prisma.requirement.update({
            where: { id: requirement.id },
            data: { status: newStatus, doneAt: newStatus === "DONE" ? new Date() : null },
          });
          await prisma.statusEvent.create({
            data: {
              requirementId: requirement.id,
              scope: "requirement",
              fromStatus: requirement.status,
              toStatus: newStatus,
              actor: "system:eod_sync",
            },
          });

          if (newStatus === "DONE") {
            try {
              await generateDraftReleaseNote(requirement.id);
              requirementsCompleted++;
            } catch (err) {
              errors.push(
                `[${client.name}] requirement ${requirement.id}: release note generation failed: ${(err as Error).message}`
              );
            }
          }
        }
      }
    }

    clientsSynced++;
  }

  const run = await prisma.syncRun.create({
    data: {
      startedAt,
      finishedAt: new Date(),
      clientsSynced,
      linkedItemsUpdated,
      requirementsCompleted,
      errors,
    },
  });

  return {
    syncRunId: run.id,
    clientsSynced,
    linkedItemsUpdated,
    requirementsCompleted,
    errors,
  };
}
