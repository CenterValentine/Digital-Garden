/**
 * Where newly-created chat artifacts land when the user does not name a
 * destination in the message. The selection is scoped to a conversation in
 * localStorage; transient side chats temporarily use their rooted content id.
 */
export type OutputTarget =
  | { mode: "chat" }
  | { mode: "underContent" }
  | { mode: "besideContent" }
  | { mode: "folder"; folderId: string; folderTitle: string };

export const DEFAULT_OUTPUT_TARGET: OutputTarget = { mode: "chat" };

/**
 * Longest file name a destination label carries before it is elided. Chosen
 * against the chip's own max width — past this the truncation is doing the
 * work anyway, and a long tail crowds out the preposition that carries the
 * meaning ("Under" vs "Beside").
 */
const LABEL_NAME_MAX = 22;

/** "Portfolio Summary.md" past the cap → "Portfolio Summar…". */
export function truncateDestinationName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= LABEL_NAME_MAX) return trimmed;
  return `${trimmed.slice(0, LABEL_NAME_MAX - 1).trimEnd()}…`;
}

/**
 * User-facing destination copy shared by the chip and reply-export dialog.
 *
 * Naming the actual file beats "this content" (owner, 2026-09-13): the chat
 * panel sits beside a tree of similar-looking names, and "Under this content"
 * makes the reader reconstruct which content that is. `contentTitle` is the
 * node the chat is rooted on; without it the generic wording still applies,
 * so a surface that cannot resolve a title degrades rather than breaks.
 */
export function getOutputTargetLabel(
  target: OutputTarget,
  opts?: { contentTitle?: string | null },
): string {
  const name = opts?.contentTitle?.trim()
    ? truncateDestinationName(opts.contentTitle)
    : null;
  switch (target.mode) {
    case "chat":
      return "Under this chat";
    case "underContent":
      return name ? `Under ${name}` : "Under this content";
    case "besideContent":
      return name ? `Beside ${name}` : "Beside this content";
    case "folder":
      return target.folderTitle || "Selected folder";
  }
}

/**
 * The destination a chat starts on.
 *
 * A SIDE chat is opened on a piece of content, and its outputs almost always
 * belong to that content rather than to the conversation about it (owner,
 * 2026-09-13) — the chat is the means, the content is the subject. A
 * full-page chat has no such subject, so it keeps owning its own outputs.
 */
export function defaultOutputTargetFor(opts: {
  hasOrigin: boolean;
}): OutputTarget {
  return opts.hasOrigin ? { mode: "underContent" } : DEFAULT_OUTPUT_TARGET;
}

/**
 * Durable turn binding for output placement.
 *
 * Approval continuations are separate HTTP requests and may happen after a
 * reload. Keeping the turn-start target on the user message makes the
 * original placement contract survive when the transport's in-memory request
 * snapshot no longer exists.
 */
export interface OutputTargetMessagePart {
  type: "data-output-target";
  data: { target: OutputTarget };
}

export function createOutputTargetMessagePart(
  target: OutputTarget,
): OutputTargetMessagePart {
  return { type: "data-output-target", data: { target } };
}

export function parseOutputTargetMessagePart(
  part: unknown,
): OutputTarget | null {
  if (!part || typeof part !== "object") return null;
  const candidate = part as {
    type?: unknown;
    data?: { target?: unknown };
  };
  if (candidate.type !== "data-output-target") return null;
  return parseOutputTarget(candidate.data?.target);
}

/**
 * Read only the latest user turn. Falling back to an older turn would make a
 * newly-sent legacy message inherit placement it never selected.
 */
export function getLatestUserMessageOutputTarget(
  messages: unknown[],
): OutputTarget | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object") continue;
    const candidate = message as { role?: unknown; parts?: unknown };
    if (candidate.role !== "user") continue;
    if (!Array.isArray(candidate.parts)) return null;
    for (const part of candidate.parts) {
      const target = parseOutputTargetMessagePart(part);
      if (target) return target;
    }
    return null;
  }
  return null;
}

interface OutputTargetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function outputTargetStorageKey({
  conversationId,
  contentId,
}: {
  conversationId?: string | null;
  contentId?: string | null;
}): string | null {
  if (conversationId) return `dg:output-target:conv:${conversationId}`;
  if (contentId) return `dg:output-target:content:${contentId}`;
  return null;
}

export function parseOutputTarget(value: unknown): OutputTarget | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    mode?: unknown;
    folderId?: unknown;
    folderTitle?: unknown;
  };
  if (candidate.mode === "chat") return { mode: "chat" };
  if (candidate.mode === "underContent") return { mode: "underContent" };
  if (candidate.mode === "besideContent") return { mode: "besideContent" };
  if (
    candidate.mode === "folder" &&
    typeof candidate.folderId === "string" &&
    candidate.folderId.length > 0
  ) {
    return {
      mode: "folder",
      folderId: candidate.folderId,
      folderTitle:
        typeof candidate.folderTitle === "string"
          ? candidate.folderTitle
          : "Folder",
    };
  }
  return null;
}

export function readStoredOutputTarget(
  storage: Pick<OutputTargetStorage, "getItem">,
  key: string | null,
): OutputTarget | null {
  if (!key) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? parseOutputTarget(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeStoredOutputTarget(
  storage: Pick<OutputTargetStorage, "setItem">,
  key: string | null,
  target: OutputTarget,
): void {
  if (!key) return;
  storage.setItem(key, JSON.stringify(target));
}

/**
 * Resolve state when ChatPanel rebinds without remounting.
 *
 * Every key change hydrates the destination key (or resets to the default)
 * instead of leaking the previous conversation's target. A transient
 * promotion carries its current selection explicitly; persisted state remains
 * the fallback for remounts, reloads, and ordinary conversation switches.
 */
export function resolveOutputTargetKeyChange({
  previousKey,
  nextKey,
  currentTarget,
  storedTarget,
  promotedTarget,
  fallbackTarget,
}: {
  previousKey: string | null;
  nextKey: string | null;
  currentTarget: OutputTarget;
  storedTarget: OutputTarget | null;
  promotedTarget?: OutputTarget | null;
  /** The surface's own default — a side chat's is its rooted content. */
  fallbackTarget?: OutputTarget;
}): OutputTarget {
  if (previousKey === nextKey) {
    return currentTarget;
  }
  if (promotedTarget) {
    return promotedTarget;
  }
  if (storedTarget) {
    return storedTarget;
  }
  return fallbackTarget ?? DEFAULT_OUTPUT_TARGET;
}

export function renderOutputTargetInstruction(target: OutputTarget): string {
  const destination =
    target.mode === "chat"
      ? "under this chat"
      : target.mode === "underContent"
        ? "under the content this side chat is rooted in"
        : target.mode === "besideContent"
          ? "beside the rooted content, in that content's folder"
          : `in the folder "${target.folderTitle}" (id: ${target.folderId})`;

  return (
    `Configured output target: new notes and documents default to ${destination}. ` +
    "This preset is enforced by the tool runtime when the write tool's parentId and outputLocation are both omitted. " +
    "If the user or active playbook explicitly gives one artifact a different relative destination, pass outputLocation (`under_chat`, `under_content`, or `beside_content`) for that artifact so it overrides the preset. " +
    "Use parentId only for a specifically resolved folder UUID. Otherwise omit both placement fields — do not substitute the active file's parent, the operating-context folder, or another inferred location."
  );
}

// ── Target-folder chip seed (AI 3.8 fix sprint) ───────────────────────────

export interface TargetSeed {
  target: { id: string; title: string | null } | null;
  inherited: boolean;
}

/**
 * Single-source seed for the target-folder chip: an explicit target wins;
 * otherwise the chat's LOCATION is inherited. ChatPanel and the full-page
 * ChatViewer both derive through this, so expand-to-full-view can never
 * drop an inherited chip again (the viewer used to seed only from the
 * persisted target and rendered blank where the panel showed inheritance).
 */
export function deriveTargetSeed(input: {
  explicit: { id: string; title: string | null } | null;
  explicitInherited: boolean;
  location: { id: string; title: string | null } | null;
}): TargetSeed {
  if (input.explicit) {
    return { target: input.explicit, inherited: input.explicitInherited };
  }
  if (input.location) {
    return { target: input.location, inherited: true };
  }
  return { target: null, inherited: false };
}
