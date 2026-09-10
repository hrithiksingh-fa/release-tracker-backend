import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../env.js";

export interface RewriteInput {
  requirementTitle: string;
  rawProblemStatement: string;
  rawObjective: string | null;
  rawStepsToUse: string | null;
  rawAcceptanceCriteria: string;
  itemCount: number;
}

export interface RewriteOutput {
  problemStatement: string;
  objective: string | null;
  stepsToUse: string | null;
  acceptanceCriteria: string;
  rewrittenByLlm: boolean;
}

const SYSTEM_PROMPT = `You are rewriting Azure DevOps work item text into a single, plain-English
release note for a non-technical business audience (the requesting client).

Rules:
- Never include code, camelCase/snake_case identifiers, SQL, API paths, or raw JSON. Translate to business terms.
- Preserve factual numbers and conditions exactly.
- If any credential, token, or secret appears in the source text, redact it as [redacted] rather than reproducing it.
- The source may combine several underlying engineering tickets that together satisfy one client requirement --
  merge them into ONE coherent note. Do not just concatenate; write it as a single narrative.
- problem_statement: 1-3 plain sentences on what problem/gap existed.
- objective: 1-3 plain sentences on what was built to address it. If it would just restate problem_statement, set to null.
- steps_to_use: 1-4 plain sentences of concrete end-user guidance. If this is a pure backend/internal change with
  nothing for a user to "do", set to null -- do not invent generic filler steps.
- acceptance_criteria: plain-English rewrite of the acceptance criteria. If genuinely empty, use the exact string
  "Not explicitly documented on the ticket."`;

const TOOL_NAME = "submit_release_note";

export async function rewriteReleaseNote(input: RewriteInput): Promise<RewriteOutput> {
  if (!env.anthropicApiKey) {
    // No LLM configured -- fall back to the raw merged text, lightly cleaned.
    // The pipeline still runs end-to-end; this just skips the plain-language pass.
    return {
      problemStatement: input.rawProblemStatement.trim(),
      objective: input.rawObjective?.trim() || null,
      stepsToUse: input.rawStepsToUse?.trim() || null,
      acceptanceCriteria: input.rawAcceptanceCriteria.trim() || "Not explicitly documented on the ticket.",
      rewrittenByLlm: false,
    };
  }

  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const userPrompt = `Requirement title: ${input.requirementTitle}
Underlying work item count: ${input.itemCount}

--- Raw problem statement(s) ---
${input.rawProblemStatement}

--- Raw objective(s) ---
${input.rawObjective ?? "(none provided)"}

--- Raw steps / requirement text ---
${input.rawStepsToUse ?? "(none provided)"}

--- Raw acceptance criteria ---
${input.rawAcceptanceCriteria}`;

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    tools: [
      {
        name: TOOL_NAME,
        description: "Submit the rewritten plain-language release note fields.",
        input_schema: {
          type: "object",
          properties: {
            problem_statement: { type: "string" },
            objective: { type: ["string", "null"] },
            steps_to_use: { type: ["string", "null"] },
            acceptance_criteria: { type: "string" },
          },
          required: ["problem_statement", "objective", "steps_to_use", "acceptance_criteria"],
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Anthropic response did not include the expected tool_use block.");
  }
  const out = toolUse.input as {
    problem_statement: string;
    objective: string | null;
    steps_to_use: string | null;
    acceptance_criteria: string;
  };

  return {
    problemStatement: out.problem_statement,
    objective: out.objective,
    stepsToUse: out.steps_to_use,
    acceptanceCriteria: out.acceptance_criteria,
    rewrittenByLlm: true,
  };
}
