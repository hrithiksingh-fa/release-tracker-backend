export interface AdoConnectionConfig {
  orgUrl: string; // e.g. https://dev.azure.com/myorg
  project: string;
  areaPath: string;
  pat: string; // decrypted PAT, never persisted anywhere but memory
}

export interface AdoWorkItemDetails {
  adoId: number;
  title: string;
  state: string;
  productOwner: string | null;
  assignedTo: string | null;
  tags: string;
  iterationPath: string | null;
  createdDate: string | null;
  changedDate: string | null;
  devStartDate: string | null;
  effort: number | null;
  descriptionText: string;
  acceptanceCriteriaText: string;
}
