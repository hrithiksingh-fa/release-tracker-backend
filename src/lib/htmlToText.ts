// ADO description/acceptance-criteria fields are stored as HTML. Strip to plain
// text while keeping paragraph/line structure, so section headers like
// "Objective" or "Problem Statement" stay on their own line for sectionSplit.ts.

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m] ?? m);
}

export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  let text = html;
  text = text.replace(/<(br|BR)\s*\/?>/g, "\n");
  text = text.replace(/<\/(p|div|li|h[1-6])>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
