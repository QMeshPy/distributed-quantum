import type { RunKind } from "@/shared/spreadsheets/model";
export type WorkbookSheet = { name: string; room: string; source: boolean };
export type SourceRun = {
  kind: RunKind;
  runId: string;
  version: string;
  ownerId: string;
  json: string;
};
export type Workbook = {
  _id: string;
  key: string;
  ownerId: string;
  title: string;
  members: { userId: string; role: "viewer" | "editor" }[];
  invitations: { email: string; role: "viewer" | "editor" }[];
  sheets: WorkbookSheet[];
  runs: SourceRun[];
  state: "creating" | "ready" | "failed";
  error?: string;
  createdAt: string;
};
