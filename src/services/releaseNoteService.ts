import { prisma } from "../db.js";
import { generateReleaseNoteForRequirement } from "../lib/releaseNotes/generate.js";
import { sendReleaseNoteToSlack } from "../integrations/slack/client.js";

// Generates a DRAFT release note for a requirement that has just transitioned to
// DONE (all linked work items terminal). Always lands as a draft -- nothing here
// sends anything; sending requires an explicit approve + send (see below).
export async function generateDraftReleaseNote(requirementId: string) {
  const requirement = await prisma.requirement.findUniqueOrThrow({
    where: { id: requirementId },
    include: { linkedWorkItems: true, releaseNotes: true },
  });

  if (!requirement.linkedWorkItems.length) {
    throw new Error(`Requirement ${requirementId} has no linked work items -- cannot generate a release note.`);
  }

  const generated = await generateReleaseNoteForRequirement(
    requirement.title,
    requirement.linkedWorkItems.map((li) => ({
      adoId: li.adoId,
      title: li.title ?? "",
      descriptionText: li.descriptionText,
      acceptanceCriteriaText: li.acceptanceCriteriaText,
    }))
  );

  const nextVersion = requirement.releaseNotes.length
    ? Math.max(...requirement.releaseNotes.map((n) => n.version)) + 1
    : 1;

  return prisma.releaseNote.create({
    data: {
      requirementId,
      version: nextVersion,
      status: "DRAFT",
      category: generated.category,
      screens: generated.screens,
      problemStatement: generated.problemStatement,
      objective: generated.objective,
      stepsToUse: generated.stepsToUse,
      acceptanceCriteria: generated.acceptanceCriteria,
    },
  });
}

export async function approveReleaseNote(releaseNoteId: string) {
  return prisma.releaseNote.update({
    where: { id: releaseNoteId },
    data: { status: "APPROVED", approvedAt: new Date() },
  });
}

export async function sendReleaseNote(releaseNoteId: string) {
  const note = await prisma.releaseNote.findUniqueOrThrow({
    where: { id: releaseNoteId },
    include: { requirement: { include: { linkedWorkItems: true, tracker: { include: { client: true } } } } },
  });

  if (note.status !== "APPROVED") {
    throw new Error(`Release note ${releaseNoteId} must be APPROVED before it can be sent (current: ${note.status}).`);
  }

  const client = note.requirement.tracker.client;
  if (!client.slackChannelId) {
    throw new Error(`Client "${client.name}" has no Slack channel configured.`);
  }

  try {
    await sendReleaseNoteToSlack(client.slackChannelId, {
      requirementTitle: note.requirement.title,
      category: note.category ?? "Update",
      screens: note.screens,
      problemStatement: note.problemStatement ?? "",
      objective: note.objective,
      stepsToUse: note.stepsToUse,
      acceptanceCriteria: note.acceptanceCriteria ?? "",
      linkedAdoIds: note.requirement.linkedWorkItems.map((li) => li.adoId),
    });

    await prisma.deliveryLog.create({
      data: { releaseNoteId, channel: "slack", target: client.slackChannelId, status: "success" },
    });
    return prisma.releaseNote.update({
      where: { id: releaseNoteId },
      data: { status: "SENT", sentAt: new Date() },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.deliveryLog.create({
      data: {
        releaseNoteId,
        channel: "slack",
        target: client.slackChannelId,
        status: "failed",
        errorMessage: message,
      },
    });
    await prisma.releaseNote.update({ where: { id: releaseNoteId }, data: { status: "FAILED" } });
    throw err;
  }
}
