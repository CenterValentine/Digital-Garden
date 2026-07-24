/**
 * Client-safe contract for content-write receipts returned by AI tools.
 *
 * Every tool that persists a ContentNode adds one or more receipts to its
 * result. ChatMessage renders them as durable, clickable proof of exactly
 * what was written and where it lives in the garden.
 */

export const CONTENT_WRITE_RECEIPTS_KEY = "__contentWrites";

export type ContentWriteOperation =
  | "created"
  | "updated"
  | "cached"
  | "generated";

export interface ContentWriteLocation {
  kind: "reference" | "folder" | "root";
  contentId?: string;
  title: string;
}

export interface ContentWriteReceipt {
  operation: ContentWriteOperation;
  contentId: string;
  title: string;
  contentType: string;
  /** User-facing object name, e.g. "run ledger", "Word document", "notes". */
  noun: string;
  location: ContentWriteLocation;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function parseReceipt(value: unknown): ContentWriteReceipt | null {
  const candidate = asRecord(value);
  if (!candidate) return null;

  const operation = candidate.operation;
  if (
    operation !== "created" &&
    operation !== "updated" &&
    operation !== "cached" &&
    operation !== "generated"
  ) {
    return null;
  }

  const location = asRecord(candidate.location);
  const locationKind = location?.kind;
  if (
    !location ||
    (locationKind !== "reference" &&
      locationKind !== "folder" &&
      locationKind !== "root") ||
    typeof location.title !== "string"
  ) {
    return null;
  }

  if (
    typeof candidate.contentId !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.contentType !== "string" ||
    typeof candidate.noun !== "string"
  ) {
    return null;
  }

  return {
    operation,
    contentId: candidate.contentId,
    title: candidate.title,
    contentType: candidate.contentType,
    noun: candidate.noun,
    location: {
      kind: locationKind,
      title: location.title,
      ...(typeof location.contentId === "string"
        ? { contentId: location.contentId }
        : {}),
    },
  };
}

/** Extract validated receipts from either an object tool result or JSON text. */
export function parseContentWriteReceipts(
  output: unknown,
): ContentWriteReceipt[] {
  let candidate = output;
  if (typeof candidate === "string") {
    if (!candidate.includes(`"${CONTENT_WRITE_RECEIPTS_KEY}"`)) return [];
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return [];
    }
  }

  const record = asRecord(candidate);
  const raw = record?.[CONTENT_WRITE_RECEIPTS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseReceipt)
    .filter((receipt): receipt is ContentWriteReceipt => receipt !== null);
}

export interface ContentWriteRefreshTargets {
  tree: boolean;
  noteContentIds: string[];
  workflowContentIds: string[];
}

/**
 * Convert persisted write receipts into the client freshness signals their
 * content types require. Every write refreshes the tree; only text-bearing
 * note/folder surfaces and workflows need their narrower live-view events.
 */
export function getContentWriteRefreshTargets(
  output: unknown,
): ContentWriteRefreshTargets {
  const receipts = parseContentWriteReceipts(output);
  return {
    tree: receipts.length > 0,
    noteContentIds: Array.from(
      new Set(
        receipts
          .filter(
            (receipt) =>
              receipt.contentType === "note" ||
              receipt.contentType === "folder",
          )
          .map((receipt) => receipt.contentId),
      ),
    ),
    workflowContentIds: Array.from(
      new Set(
        receipts
          .filter((receipt) => receipt.contentType === "workflow")
          .map((receipt) => receipt.contentId),
      ),
    ),
  };
}
