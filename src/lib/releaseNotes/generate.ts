import { splitSections } from "./sectionSplit.js";
import { classify, extractScreens, DEFAULT_CLASSIFICATION_CONFIG, type Category, type ClassificationConfig } from "./classify.js";
import { isDuplicate } from "./similarity.js";
import { rewriteReleaseNote } from "./rewrite.js";

export interface WorkItemInput {
  adoId: number;
  title: string;
  descriptionText: string | null;
  acceptanceCriteriaText: string | null;
  tags?: string | null;
}

export interface GeneratedReleaseNote {
  category: Category;
  screens: string[];
  problemStatement: string;
  objective: string | null;
  stepsToUse: string | null;
  acceptanceCriteria: string;
  rewrittenByLlm: boolean;
}

function firstNonEmpty(...vals: Array<string | undefined | null>): string {
  for (const v of vals) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

interface AnalyzedItem {
  problem: string;
  objective: string | null;
  category: Category;
  screens: Set<string>;
  steps: string | null;
  acceptanceCriteria: string;
}

function analyzeItem(item: WorkItemInput, config: ClassificationConfig): AnalyzedItem {
  const title = item.title ?? "";
  const desc = item.descriptionText ?? "";
  const ac = item.acceptanceCriteriaText ?? "";
  const tags = item.tags ?? "";

  const sections = splitSections(desc);
  let problem = firstNonEmpty(sections["problem statement"], sections["issue"], sections["_intro"]);
  let objective: string | null = firstNonEmpty(
    sections["objective"],
    sections["user story"],
    sections["solution"],
    sections["proposed solution"]
  );

  if (!problem) {
    problem = desc ? desc.slice(0, 500) : `Improvement related to: ${title}.`;
  }
  if (!objective) {
    const candidate = firstNonEmpty(problem, ac);
    if (candidate) {
      const firstSentence = candidate.trim().split(/(?<=[.!?])\s/)[0];
      objective = `Address the above by implementing: ${title}. ${firstSentence}`;
    } else {
      objective = `Implement: ${title}`;
    }
  }
  if (isDuplicate(problem, objective)) {
    objective = null;
  }

  const { screens: extractedScreens, urls } = extractScreens(title, desc, ac, tags, config);
  const screens = extractedScreens.size
    ? extractedScreens
    : new Set(["General backend change (no specific screen called out)"]);

  const category = classify(title, config);

  const req = firstNonEmpty(sections["requirement"], sections["solution"], sections["proposed solution"]);
  const stepsParts: string[] = [];
  if (req) stepsParts.push(req);
  if (urls.length) stepsParts.push("Relevant page(s): " + urls.join(", "));
  const steps = stepsParts.length ? stepsParts.join("\n\n") : null;

  return {
    problem,
    objective,
    category,
    screens,
    steps,
    acceptanceCriteria: ac.trim() || "Not explicitly documented on the ticket.",
  };
}

// A Requirement can fan out into several linked ADO work items -- pick one category
// for the merged note. Priority order below can be tuned per client later; for now
// "New Features" wins if any linked item introduces something new, since that's the
// most relevant framing for the client reading the note.
const CATEGORY_PRIORITY: Category[] = ["New Features", "Bug Fixes", "Enhancements"];

function mergeCategory(categories: Category[]): Category {
  const counts = new Map<Category, number>();
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best: Category = "Enhancements";
  let bestScore = -1;
  for (const cat of CATEGORY_PRIORITY) {
    const score = counts.get(cat) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best;
}

function dedupJoin(parts: string[]): string {
  const kept: string[] = [];
  for (const p of parts) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    if (kept.some((k) => isDuplicate(k, trimmed, 0.75))) continue;
    kept.push(trimmed);
  }
  return kept.join("\n\n");
}

export async function generateReleaseNoteForRequirement(
  requirementTitle: string,
  workItems: WorkItemInput[],
  config: ClassificationConfig = DEFAULT_CLASSIFICATION_CONFIG
): Promise<GeneratedReleaseNote> {
  if (!workItems.length) {
    throw new Error("Cannot generate a release note for a requirement with no linked work items.");
  }

  const analyzed = workItems.map((wi) => analyzeItem(wi, config));

  const rawProblemStatement = dedupJoin(analyzed.map((a) => a.problem));
  const rawObjective = dedupJoin(analyzed.map((a) => a.objective ?? "")) || null;
  const rawStepsToUse = dedupJoin(analyzed.map((a) => a.steps ?? "")) || null;
  const rawAcceptanceCriteria = dedupJoin(analyzed.map((a) => a.acceptanceCriteria));

  const screens = new Set<string>();
  analyzed.forEach((a) => a.screens.forEach((s) => screens.add(s)));
  const category = mergeCategory(analyzed.map((a) => a.category));

  const rewritten = await rewriteReleaseNote({
    requirementTitle,
    rawProblemStatement,
    rawObjective,
    rawStepsToUse,
    rawAcceptanceCriteria,
    itemCount: workItems.length,
  });

  return {
    category,
    screens: Array.from(screens).sort(),
    problemStatement: rewritten.problemStatement,
    objective: rewritten.objective,
    stepsToUse: rewritten.stepsToUse,
    acceptanceCriteria: rewritten.acceptanceCriteria,
    rewrittenByLlm: rewritten.rewrittenByLlm,
  };
}
