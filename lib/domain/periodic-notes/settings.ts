import type { UserSettings } from "@/lib/features/settings/validation";
import { DEFAULT_SETTINGS } from "@/lib/features/settings/validation";
import type {
  PeriodicNoteKind,
  PeriodicNoteKindSettings,
  PeriodicNotesSettings,
} from "./types";

export const PERIODIC_NOTES_DEFAULTS =
  DEFAULT_SETTINGS.periodicNotes as PeriodicNotesSettings;

export function getPeriodicNotesSettings(
  settings: Pick<UserSettings, "periodicNotes"> | null | undefined
): PeriodicNotesSettings {
  return {
    daily: normalizeKindSettings(settings?.periodicNotes?.daily, "daily"),
    weekly: normalizeKindSettings(settings?.periodicNotes?.weekly, "weekly"),
  };
}

export function getPeriodicNoteSettings(
  settings: Pick<UserSettings, "periodicNotes"> | null | undefined,
  kind: PeriodicNoteKind
): PeriodicNoteKindSettings {
  return getPeriodicNotesSettings(settings)[kind];
}

function normalizeKindSettings(
  value: Partial<PeriodicNoteKindSettings> | undefined,
  kind: PeriodicNoteKind
): PeriodicNoteKindSettings {
  const defaults = PERIODIC_NOTES_DEFAULTS[kind];
  const filenameFormat = value?.filenameFormat?.trim() || defaults.filenameFormat;

  return {
    enabled: value?.enabled ?? defaults.enabled,
    folderId: value?.folderId ?? defaults.folderId,
    filenameFormat,
    templateId: value?.templateId ?? defaults.templateId,
    autoCreateOnOpen:
      value?.autoCreateOnOpen ?? defaults.autoCreateOnOpen,
  };
}
