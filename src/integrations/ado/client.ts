import axios, { type AxiosInstance } from "axios";
import { htmlToPlainText } from "../../lib/htmlToText.js";
import type { AdoConnectionConfig, AdoWorkItemDetails } from "./types.js";

const API_VERSION = "7.1";

// Field name for "when dev work actually started" varies by process template.
// Try these in order, first one present wins -- see the toolkit's known gotcha
// about custom fields only appearing in the single-item get, not bulk WIQL.
const DEV_START_FIELD_CANDIDATES = ["Microsoft.VSTS.Common.ActivatedDate", "Custom.PickupDate"];

export class AdoClient {
  private http: AxiosInstance;
  private project: string;
  private areaPath: string;

  constructor(config: AdoConnectionConfig) {
    this.project = config.project;
    this.areaPath = config.areaPath;
    const token = Buffer.from(`:${config.pat}`).toString("base64");
    this.http = axios.create({
      baseURL: `${config.orgUrl.replace(/\/$/, "")}/${encodeURIComponent(config.project)}/_apis`,
      headers: {
        Authorization: `Basic ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15_000,
    });
  }

  // ADO custom fields (Effort, ActivatedDate, ProductOwner, ...) are frequently
  // missing from bulk WIQL list results -- always fetch each item individually.
  async getWorkItem(adoId: number): Promise<AdoWorkItemDetails> {
    const { data } = await this.http.get(`/wit/workitems/${adoId}`, {
      params: { "api-version": API_VERSION, $expand: "all" },
    });
    const fields = data.fields ?? {};

    let devStartDate: string | null = null;
    for (const f of DEV_START_FIELD_CANDIDATES) {
      if (fields[f]) {
        devStartDate = fields[f];
        break;
      }
    }

    return {
      adoId: data.id,
      title: fields["System.Title"] ?? "",
      state: fields["System.State"] ?? "",
      productOwner: fields["Custom.ProductOwner"]?.displayName ?? null,
      assignedTo: fields["System.AssignedTo"]?.displayName ?? null,
      tags: fields["System.Tags"] ?? "",
      iterationPath: fields["System.IterationPath"] ?? null,
      createdDate: fields["System.CreatedDate"] ?? null,
      changedDate: fields["System.ChangedDate"] ?? null,
      devStartDate,
      effort: fields["Microsoft.VSTS.Scheduling.Effort"] ?? null,
      descriptionText: htmlToPlainText(fields["System.Description"]),
      acceptanceCriteriaText: htmlToPlainText(fields["Microsoft.VSTS.Common.AcceptanceCriteria"]),
    };
  }

  async getWorkItems(adoIds: number[]): Promise<AdoWorkItemDetails[]> {
    // Sequential on purpose: ADO rate-limits aggressively, and per-item fetch is
    // already required (see getWorkItem's comment) so there's no bulk shortcut.
    const results: AdoWorkItemDetails[] = [];
    for (const id of adoIds) {
      results.push(await this.getWorkItem(id));
    }
    return results;
  }

  async createWorkItem(params: {
    workItemType: string;
    title: string;
    description?: string;
  }): Promise<AdoWorkItemDetails> {
    const patchDoc = [
      { op: "add", path: "/fields/System.Title", value: params.title },
      { op: "add", path: "/fields/System.AreaPath", value: this.areaPath },
      ...(params.description
        ? [{ op: "add", path: "/fields/System.Description", value: params.description }]
        : []),
    ];
    const { data } = await this.http.post(
      `/wit/workitems/$${encodeURIComponent(params.workItemType)}`,
      patchDoc,
      {
        params: { "api-version": API_VERSION },
        headers: { "Content-Type": "application/json-patch+json" },
      }
    );
    return this.getWorkItem(data.id);
  }
}
