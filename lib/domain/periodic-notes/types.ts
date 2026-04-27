import type { JSONContent } from "@tiptap/core";

export type PeriodicNoteKind = "daily" | "weekly";

export interface PeriodicNoteKindSettings {
  enabled: boolean;
  folderId: string | null;
  filenameFormat: string;
  templateId: string | null;
  autoCreateOnOpen: boolean;
}

export interface PeriodicNotesSettings {
  daily: PeriodicNoteKindSettings;
  weekly: PeriodicNoteKindSettings;
}

export interface PeriodicNotePeriod {
  kind: PeriodicNoteKind;
  periodKey: string;
  title: string;
}

export interface ResolvePeriodicNoteResponse {
  id: string;
  title: string;
  contentType: "note";
  created: boolean;
  kind: PeriodicNoteKind;
  periodKey: string;
}

export const EMPTY_TIPTAP_NOTE: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
