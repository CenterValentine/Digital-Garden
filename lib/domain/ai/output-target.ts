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

/** User-facing destination copy shared by the chip and reply-export dialog. */
export function getOutputTargetLabel(target: OutputTarget): string {
  switch (target.mode) {
    case "chat":
      return "Under this chat";
    case "underContent":
      return "Under this content";
    case "besideContent":
      return "Beside this content";
    case "folder":
      return target.folderTitle || "Selected folder";
  }
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
 * instead of leaking the previous conversation's target. The sidebar's
 * transient-promotion flow explicitly writes its current selection to the new
 * conversation key before rebinding, so promotion is unambiguous here.
 */
export function resolveOutputTargetKeyChange({
  previousKey,
  nextKey,
  currentTarget,
  storedTarget,
}: {
  previousKey: string | null;
  nextKey: string | null;
  currentTarget: OutputTarget;
  storedTarget: OutputTarget | null;
}): OutputTarget {
  if (previousKey === nextKey) {
    return currentTarget;
  }
  if (storedTarget) {
    return storedTarget;
  }
  return DEFAULT_OUTPUT_TARGET;
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
