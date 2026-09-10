import axios, { type AxiosInstance } from "axios";
import { env } from "../../env.js";

export interface FigmaFileSummary {
  name: string;
  thumbnailUrl: string | null;
  lastModified: string;
  version: string;
}

export interface FigmaProject {
  id: string;
  name: string;
}

export interface FigmaProjectFile {
  key: string;
  name: string;
  thumbnail_url: string;
  last_modified: string;
}

function client(): AxiosInstance {
  if (!env.figmaAccessToken) {
    throw new Error("FIGMA_ACCESS_TOKEN is not configured.");
  }
  return axios.create({
    baseURL: "https://api.figma.com/v1",
    headers: { "X-Figma-Token": env.figmaAccessToken },
    timeout: 15_000,
  });
}

export async function getFile(fileKey: string): Promise<FigmaFileSummary> {
  const { data } = await client().get(`/files/${fileKey}`, {
    params: { depth: 1 }, // we only need top-level metadata, not the full node tree
  });
  return {
    name: data.name,
    thumbnailUrl: data.thumbnailUrl ?? null,
    lastModified: data.lastModified,
    version: data.version,
  };
}

// Renders a specific frame/node to an image URL (Figma generates these on demand
// and they expire after a while -- fine for "show a thumbnail now", not for
// permanent storage; re-fetch if a stored thumbnailUrl 404s later).
export async function getNodeImageUrl(fileKey: string, nodeId: string): Promise<string | null> {
  const { data } = await client().get(`/images/${fileKey}`, {
    params: { ids: nodeId, format: "png" },
  });
  return data.images?.[nodeId] ?? null;
}

export async function listTeamProjects(teamId: string): Promise<FigmaProject[]> {
  const { data } = await client().get(`/teams/${teamId}/projects`);
  return data.projects ?? [];
}

export async function listProjectFiles(projectId: string): Promise<FigmaProjectFile[]> {
  const { data } = await client().get(`/projects/${projectId}/files`);
  return data.files ?? [];
}
