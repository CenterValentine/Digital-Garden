/**
 * Playbook registry (AI v3.2 T3)
 *
 * A "playbook" is a NOTE OR FOLDER marked via its `NotePayload.metadata`
 * (folders can carry a `notePayload` too — the folder "Notes" editor — so a
 * folder's own notes content is a legitimate playbook source, not just a
 * dedicated note):
 *   metadata.playbook            = true            (the discoverable flag)
 *   metadata.playbookDescription = "one-liner"     (SKILL.md `description`)
 *
 * Migration-free: reuses the existing free-form `metadata` JSON column (same
 * pattern as the Run Ledger). The flag makes discovery a cheap indexed-ish JSON
 * query; the description powers the /playbook picker (the Skill-style metadata
 * the model/user see before the body loads).
 */

import "server-only";
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import { parsePlaybook } from "./parse";

export const PLAYBOOK_FLAG_KEY = "playbook";
export const PLAYBOOK_DESCRIPTION_KEY = "playbookDescription";

export interface PlaybookListItem {
  id: string;
  title: string;
  description: string;
  phaseCount: number;
}

/** Merge playbook markers into an existing metadata object (for import/marking). */
export function withPlaybookMetadata(
  metadata: Record<string, unknown> | null | undefined,
  description: string,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [PLAYBOOK_FLAG_KEY]: true,
    [PLAYBOOK_DESCRIPTION_KEY]: description,
  };
}

/**
 * Remove the playbook markers from a metadata object (the "unmark" path).
 * Returns the remaining metadata unchanged apart from the two flag keys — any
 * other note metadata (word counts, imports, etc.) is preserved. May be `{}`.
 */
export function stripPlaybookMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const rest = { ...(metadata ?? {}) };
  delete rest[PLAYBOOK_FLAG_KEY];
  delete rest[PLAYBOOK_DESCRIPTION_KEY];
  return rest;
}

/** Does this note's metadata mark it as a playbook? */
export function isPlaybookMetadata(metadata: unknown): boolean {
  return (
    !!metadata &&
    typeof metadata === "object" &&
    (metadata as Record<string, unknown>)[PLAYBOOK_FLAG_KEY] === true
  );
}

/** List the user's playbook notes/folders for the registry / picker. */
export async function listPlaybooks(userId: string): Promise<PlaybookListItem[]> {
  const rows = await prisma.contentNode.findMany({
    where: {
      ownerId: userId,
      contentType: { in: ["note", "folder"] },
      deletedAt: null,
      notePayload: { metadata: { path: [PLAYBOOK_FLAG_KEY], equals: true } },
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
    const meta = (row.notePayload?.metadata ?? {}) as Record<string, unknown>;
    const description =
      typeof meta[PLAYBOOK_DESCRIPTION_KEY] === "string"
        ? (meta[PLAYBOOK_DESCRIPTION_KEY] as string)
        : "";
    const json = row.notePayload?.tiptapJson as JSONContent | undefined;
    const phaseCount = json ? parsePlaybook(json).phases.length : 0;
    return { id: row.id, title: row.title, description, phaseCount };
  });
}
