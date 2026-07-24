import type { ModelMessage } from "ai";

interface UserTextMessage {
  role?: unknown;
  content?: unknown;
  parts?: unknown;
}

function textFromMessage(message: UserTextMessage): string {
  if (typeof message.content === "string") return message.content;
  const candidates = Array.isArray(message.parts)
    ? message.parts
    : Array.isArray(message.content)
      ? message.content
      : [];
  return candidates
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? [text] : [];
    })
    .join("\n");
}

export function getLatestUserMessageText(
  messages: UserTextMessage[],
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== "user") continue;
    return textFromMessage(messages[index]);
  }
  return "";
}

/**
 * A rooted note is ambient context until the user explicitly asks to execute
 * it as a playbook. Keep the cue narrow so ordinary questions asked while a
 * playbook-like note is open never enter execution mode.
 */
export function requestsRootedPlaybookExecution(
  messages: UserTextMessage[],
): boolean {
  const text = getLatestUserMessageText(messages);
  return (
    /\b(?:execute|run|follow|start)\s+(?:this|the\s+current)\s+(?:file|note|content|playbook)\b/i.test(
      text,
    ) ||
    /\b(?:execute|run|follow|start)\s+(?:this|the\s+current)\s+(?:file|note|content)\s+as\s+(?:a\s+)?playbook\b/i.test(
      text,
    )
  );
}

/**
 * Durable UI representation of the playbook selected for a user turn.
 *
 * This rides in a `data-playbook` UIMessage part: it is persisted and
 * rendered with the sent user message, while `convertToModelMessages`
 * ignores it. The server independently validates `playbookId` and adds the
 * authoritative message-level model context.
 */
export interface PlaybookMessageAttachment {
  id: string;
  title: string;
  phaseIndex: number;
  phaseCount: number;
}

export interface PlaybookMessageAttachmentPart {
  type: "data-playbook";
  data: PlaybookMessageAttachment;
}

export function createPlaybookMessageAttachmentPart(
  attachment: PlaybookMessageAttachment,
): PlaybookMessageAttachmentPart {
  return {
    type: "data-playbook",
    data: attachment,
  };
}

export function parsePlaybookMessageAttachment(
  part: unknown,
): PlaybookMessageAttachment | null {
  if (!part || typeof part !== "object") return null;
  const candidate = part as {
    type?: unknown;
    data?: {
      id?: unknown;
      title?: unknown;
      phaseIndex?: unknown;
      phaseCount?: unknown;
    };
  };
  if (
    candidate.type !== "data-playbook" ||
    typeof candidate.data?.id !== "string" ||
    typeof candidate.data.title !== "string"
  ) {
    return null;
  }
  return {
    id: candidate.data.id,
    title: candidate.data.title,
    phaseIndex:
      typeof candidate.data.phaseIndex === "number"
        ? candidate.data.phaseIndex
        : 0,
    phaseCount:
      typeof candidate.data.phaseCount === "number"
        ? candidate.data.phaseCount
        : 0,
  };
}

/**
 * Put the server-validated attachment immediately beside the latest user
 * request in model context. This closes the semantic gap where weaker models
 * ignored a system-only Active Playbook section and followed rooted-content
 * context instead.
 */
export function bindPlaybookToLatestUserMessage(
  messages: ModelMessage[],
  title: string,
  source: "attached" | "rooted" = "attached",
): ModelMessage[] {
  const binding =
    source === "attached"
      ? `[Attached playbook selected by the user: "${title}". ` +
        "This is the procedure to execute for the request below. Its validated current-phase instructions are in the Active Playbook system section. " +
        "Do not read rooted content to identify or discover the playbook; use rooted content only when the request or active phase actually requires it.]"
      : `[The user explicitly asked to execute the rooted content "${title}" as a playbook. ` +
        "Its validated instructions are in the Active Playbook system section. Follow that playbook directly; do not search for or substitute another one.]";
  const next = [...messages];

  for (let index = next.length - 1; index >= 0; index -= 1) {
    const message = next[index];
    if (message.role !== "user") continue;
    next[index] = {
      ...message,
      content:
        typeof message.content === "string"
          ? `${binding}\n\n${message.content}`
          : [{ type: "text", text: binding }, ...message.content],
    };
    break;
  }

  return next;
}
