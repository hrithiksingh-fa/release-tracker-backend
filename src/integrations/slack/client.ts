import { WebClient, type KnownBlock } from "@slack/web-api";
import { env } from "../../env.js";

export interface ReleaseNoteSlackPayload {
  requirementTitle: string;
  category: string;
  screens: string[];
  problemStatement: string;
  objective: string | null;
  stepsToUse: string | null;
  acceptanceCriteria: string;
  linkedAdoIds: number[];
}

function buildBlocks(payload: ReleaseNoteSlackPayload): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: payload.requirementTitle, emoji: true },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*${payload.category}* · Screens: ${payload.screens.join(", ")} · Work items: ${payload.linkedAdoIds
            .map((id) => `#${id}`)
            .join(", ")}`,
        },
      ],
    },
    { type: "section", text: { type: "mrkdwn", text: `*Problem*\n${payload.problemStatement}` } },
  ];
  if (payload.objective) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*What changed*\n${payload.objective}` } });
  }
  if (payload.stepsToUse) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*How to use it*\n${payload.stepsToUse}` } });
  }
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*Acceptance criteria*\n${payload.acceptanceCriteria}` },
  });
  return blocks;
}

export async function sendReleaseNoteToSlack(channelId: string, payload: ReleaseNoteSlackPayload) {
  if (!env.slackBotToken) {
    throw new Error("SLACK_BOT_TOKEN is not configured.");
  }
  const client = new WebClient(env.slackBotToken);
  return client.chat.postMessage({
    channel: channelId,
    text: `${payload.category}: ${payload.requirementTitle}`, // fallback for notifications
    blocks: buildBlocks(payload),
  });
}
