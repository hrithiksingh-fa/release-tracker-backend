// Ported from ado-release-notes-toolkit/scripts/build_release_notes.py (split_sections).
// Splits a free-text ADO description into labeled sections keyed by header name.

const HEADERS = [
  "user story",
  "objective",
  "problem statement",
  "solution",
  "proposed solution",
  "requirement",
  "issue",
  "note",
  "acceptance criteria",
];

export function splitSections(text: string): Record<string, string> {
  const lines = text.split("\n");
  const sections: Record<string, string[]> = {};
  let current = "_intro";
  let buf: string[] = [];

  const flush = () => {
    if (buf.length) {
      sections[current] = (sections[current] ?? []).concat(buf);
    }
  };

  for (const ln of lines) {
    const stripped = ln.trim();
    const low = stripped.toLowerCase().replace(/:$/, "").trim();
    const matched = HEADERS.find((h) => low === h);
    if (matched) {
      flush();
      current = matched;
      buf = [];
    } else {
      buf.push(ln);
    }
  }
  flush();

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sections)) {
    out[k] = v.join("\n").trim().replace(/\n{3,}/g, "\n\n");
  }
  return out;
}
