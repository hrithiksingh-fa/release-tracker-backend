// Ported from ado-release-notes-toolkit/scripts/build_release_notes.py.
//
// CUSTOMIZE ME: these keyword lists are tuned to Field Assist's CST Kanban
// product surface (screen names, title conventions). When onboarding a new
// client whose product vocabulary differs, override these via the
// `ClassificationConfig` param rather than editing this file.

export interface ClassificationConfig {
  screenKeywords: Array<[string, string]>;
  titleSuffixMap: Record<string, string>;
  bugfixKeywords: string[];
  featureKeywords: string[];
  enhancementKeywords: string[];
}

export const DEFAULT_CLASSIFICATION_CONFIG: ClassificationConfig = {
  screenKeywords: [
    ["dashboard", "Dashboard"],
    ["backend", "Backend"],
    ["bulk upload", "Bulk Upload"],
    ["portal", "Portal"],
    ["mobile app", "Mobile App"],
    ["api", "API"],
  ],
  titleSuffixMap: {
    dashboard: "Dashboard",
    app: "App",
    "app api": "App API",
    backend: "Backend",
    "bulk upload": "Bulk Upload",
    api: "API",
  },
  bugfixKeywords: [
    "fix", "defect", "bug", "issue", "isn't", "is not reflecting", "incorrect",
    "not reflecting", "not visible", "not populating", "not working",
    "wrong", "loss", "correction", "mismatch", "not showing", "error",
    "should be 0", "not saved", "not saving", "failing", "fails",
  ],
  featureKeywords: [
    "creation of", "creating a", "creating an", "implement", "implementing",
    "introduc", "new approval", "expose", "enable ", "addition of",
    "add ", "display of", "display ", "develop",
  ],
  enhancementKeywords: [
    "enhancement", "enhance", "improve", "extend", "extending", "optimization",
    "upgrade", "ui enhancement", "rename", "renaming",
  ],
};

export type Category = "New Features" | "Enhancements" | "Bug Fixes";

export function classify(title: string, config: ClassificationConfig = DEFAULT_CLASSIFICATION_CONFIG): Category {
  const t = title.toLowerCase();
  if (config.bugfixKeywords.some((k) => t.includes(k))) return "Bug Fixes";
  if (config.enhancementKeywords.some((k) => t.includes(k))) return "Enhancements";
  if (config.featureKeywords.some((k) => t.includes(k))) return "New Features";
  if (["add ", "display ", "allow ", "creating", "creation"].some((p) => t.startsWith(p))) {
    return "New Features";
  }
  return "Enhancements";
}

const URL_RE = /https?:\/\/[^\s)]+/g;

export function extractScreens(
  title: string,
  desc: string,
  ac: string,
  tags: string,
  config: ClassificationConfig = DEFAULT_CLASSIFICATION_CONFIG
): { screens: Set<string>; urls: string[] } {
  const screens = new Set<string>();
  const parts = title.split(" - ");
  if (parts.length > 1) {
    const suffix = parts[parts.length - 1].trim().toLowerCase();
    const suffixClean = suffix.replace(/\.$/, "");
    if (config.titleSuffixMap[suffixClean]) {
      screens.add(config.titleSuffixMap[suffixClean]);
    } else if (suffixClean.length < 30) {
      screens.add(parts[parts.length - 1].trim());
    }
  }
  const lowdesc = `${desc} ${ac} ${title ?? ""} ${tags ?? ""}`.toLowerCase();
  for (const [kw, label] of config.screenKeywords) {
    if (lowdesc.includes(kw)) screens.add(label);
  }
  const urls = [...(desc.match(URL_RE) ?? []), ...(ac.match(URL_RE) ?? [])]
    .map((u) => u.replace(/[.,)]+$/, ""))
    .filter((u) => !u.includes("dev.azure.com") && !u.includes("app.asana.com") && !u.includes("figma.com"));
  return { screens, urls: urls.slice(0, 3) };
}
