// Azure DevOps project URLs come in two shapes:
//   https://dev.azure.com/{org}/{project}[/_boards/...]
//   https://{org}.visualstudio.com/{project}[/_boards/...]
// We only need org + project -- area path defaults to the project name
// (ADO's own default when one isn't set), so there's no third field to ask for.
export interface ParsedAdoProjectUrl {
  orgUrl: string;
  project: string;
}

export function parseAdoProjectUrl(url: string): ParsedAdoProjectUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);

  if (parsed.hostname === "dev.azure.com") {
    const [org, project] = segments;
    if (!org || !project) return null;
    return { orgUrl: `https://dev.azure.com/${org}`, project: decodeURIComponent(project) };
  }

  if (parsed.hostname.endsWith(".visualstudio.com")) {
    const org = parsed.hostname.replace(".visualstudio.com", "");
    const [project] = segments;
    if (!org || !project) return null;
    return { orgUrl: `https://${org}.visualstudio.com`, project: decodeURIComponent(project) };
  }

  return null;
}
