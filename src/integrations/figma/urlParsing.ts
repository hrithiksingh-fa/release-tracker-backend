// Figma file URLs look like:
//   https://www.figma.com/file/ABC123xyz/My-File?node-id=1%3A2      (older /file/ links)
//   https://www.figma.com/design/ABC123xyz/My-File?node-id=1-2      (newer /design/ links)
export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId: string | null;
}

export function parseFigmaUrl(url: string): ParsedFigmaUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!parsed.hostname.endsWith("figma.com")) return null;

  const match = parsed.pathname.match(/\/(file|design)\/([^/]+)/);
  if (!match) return null;
  const fileKey = match[2];

  const rawNodeId = parsed.searchParams.get("node-id");
  const nodeId = rawNodeId ? rawNodeId.replace("-", ":") : null;

  return { fileKey, nodeId };
}
