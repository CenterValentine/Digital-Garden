/**
 * Charter registry (AI v3.2 T3; renamed from "playbook", P0a 2026-09-02)
 *
 * A "charter" is a NOTE OR FOLDER marked via its `NotePayload.metadata`
 * (folders can carry a `notePayload` too — the folder "Notes" editor — so a
 * folder's own notes content is a legitimate charter source, not just a
 * dedicated note):
 *   metadata.charter            = true            (the discoverable flag)
 *   metadata.charterDescription = "one-liner"     (SKILL.md `description`)
 *
 * Storage-key compatibility (owner, 2026-09-02): notes marked before the
 * rename carry the LEGACY keys `playbook` / `playbookDescription`. Reads
 * accept EITHER key; writes stamp the new keys and strip the legacy ones
 * (migrate-on-touch). Never write the legacy keys again.
 *
 * Migration-free: reuses the existing free-form `metadata` JSON column (same
 * pattern as the Run Ledger). The flag makes discovery a cheap indexed-ish JSON
 * query; the description powers the /charter picker (the Skill-style metadata
 * the model/user see before the body loads).
 */

import "server-only";
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import { parseCharter } from "./parse";

export const CHARTER_FLAG_KEY = "charter";
export const CHARTER_DESCRIPTION_KEY = "charterDescription";
/** Pre-rename storage keys — read-only compatibility, never written. */
export const LEGACY_CHARTER_FLAG_KEY = "playbook";
export const LEGACY_CHARTER_DESCRIPTION_KEY = "playbookDescription";

export interface CharterListItem {
  id: string;
  title: string;
  description: string;
  phaseCount: number;
}

/**
 * Merge charter markers into an existing metadata object (for import/marking).
 * Also strips the legacy keys — marking or editing a pre-rename charter
 * migrates it to the new keys in the same write.
 */
export function withCharterMetadata(
  metadata: Record<string, unknown> | null | undefined,
  description: string,
): Record<string, unknown> {
  const rest = { ...(metadata ?? {}) };
  delete rest[LEGACY_CHARTER_FLAG_KEY];
  delete rest[LEGACY_CHARTER_DESCRIPTION_KEY];
  return {
    ...rest,
    [CHARTER_FLAG_KEY]: true,
    [CHARTER_DESCRIPTION_KEY]: description,
  };
}

/**
 * Remove the charter markers from a metadata object (the "unmark" path) —
 * both current and legacy key sets. Any other note metadata (word counts,
 * imports, etc.) is preserved. May be `{}`.
 */
export function stripCharterMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const rest = { ...(metadata ?? {}) };
  delete rest[CHARTER_FLAG_KEY];
  delete rest[CHARTER_DESCRIPTION_KEY];
  delete rest[LEGACY_CHARTER_FLAG_KEY];
  delete rest[LEGACY_CHARTER_DESCRIPTION_KEY];
  return rest;
}

/** Does this note's metadata mark it as a charter (either key generation)? */
export function isCharterMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const m = metadata as Record<string, unknown>;
  return m[CHARTER_FLAG_KEY] === true || m[LEGACY_CHARTER_FLAG_KEY] === true;
}

/** The charter description from metadata, whichever key generation holds it. */
export function charterDescriptionFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const m = metadata as Record<string, unknown>;
  if (typeof m[CHARTER_DESCRIPTION_KEY] === "string") {
    return m[CHARTER_DESCRIPTION_KEY] as string;
  }
  if (typeof m[LEGACY_CHARTER_DESCRIPTION_KEY] === "string") {
    return m[LEGACY_CHARTER_DESCRIPTION_KEY] as string;
  }
  return "";
}

/** List the user's charter notes/folders for the registry / picker. */
export async function listCharters(userId: string): Promise<CharterListItem[]> {
  const rows = await prisma.contentNode.findMany({
    where: {
      ownerId: userId,
      contentType: { in: ["note", "folder"] },
      deletedAt: null,
      OR: [
        {
          notePayload: {
            metadata: { path: [CHARTER_FLAG_KEY], equals: true },
          },
        },
        {
          notePayload: {
            metadata: { path: [LEGACY_CHARTER_FLAG_KEY], equals: true },
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      notePayload: { select: { metadata: true, tiptapJson: true } },
    },
    orderBy: { title: "asc" },
    take: 100,
  });

  return rows.map((row) => {
    const description = charterDescriptionFromMetadata(
      row.notePayload?.metadata,
    );
    const json = row.notePayload?.tiptapJson as JSONContent | undefined;
    const phaseCount = json ? parseCharter(json).phases.length : 0;
    return { id: row.id, title: row.title, description, phaseCount };
  });
}
