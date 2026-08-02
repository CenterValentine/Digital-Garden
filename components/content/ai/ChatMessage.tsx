/**
 * ChatMessage Component — Sprint 38 Phase 4
 *
 * Renders a single chat message (user, assistant, or tool invocation).
 * Uses AI SDK v6 parts-based message model for rich content rendering.
 *
 * Assistant messages render full markdown via react-markdown + remark-gfm:
 * headings, code blocks (syntax-highlighted via lowlight), tables,
 * lists, blockquotes, links, strikethrough, and inline formatting.
 */

"use client";

import { memo, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { common, createLowlight } from "lowlight";
import {
  Activity,
  Bot,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleStop,
  Copy,
  ExternalLink,
  File,
  FileCode2,
  FileOutput,
  FileText,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Globe,
  GripVertical,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  MessageSquare,
  Pencil,
  RotateCcw,
  ShieldAlert,
  Table2,
  User,
  Volume2,
  Wrench,
  X,
} from "lucide-react";
import { MediaInjectFlyout, type InjectMedia } from "./MediaInjectFlyout";
import { FlashcardDeckProposalCard } from "./FlashcardDeckProposalCard";
import { FlashcardCardProposalList } from "./FlashcardCardProposalList";
import { cn } from "@/lib/core/utils";
import { useContentStore } from "@/state/content-store";
import { ArtifactContextMenu, openArtifactInSplitPane } from "./artifact-open";
import { useSettingsStore } from "@/state/settings-store";
import { useNotesPanelStore } from "@/state/notes-panel-store";
import { useImagePreviewStore } from "@/state/image-preview-store";
import { useTypewriter } from "@/lib/domain/ai/use-typewriter";
import type { UIMessage } from "ai";
import type { Components } from "react-markdown";
import type { ExtraProps } from "react-markdown";
import {
  getProviderTheme,
  type ProviderTheme,
} from "@/lib/design/system/ai-providers";
import { useResolvedTheme } from "@/lib/features/theme/useResolvedTheme";
import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";
import { ReasoningRouter } from "./reasoning/ReasoningRouter";
import { parsePlaybookMessageAttachment } from "@/lib/domain/ai/playbooks/message-binding";
import {
  parseContentWriteReceipts,
  type ContentWriteReceipt,
} from "@/lib/domain/ai/content-write-receipts";
import {
  getOutputTargetLabel,
  type OutputTarget,
} from "@/lib/domain/ai/output-target";
import { inferReplyExportTitle } from "@/lib/domain/ai/reply-export";
import { toast } from "sonner";

/**
 * Detect tool parts in AI SDK v6 UIMessage.
 *
 * Static tools have type "tool-{toolName}" with toolCallId, but NO toolName property.
 * Dynamic tools have type "dynamic-tool" with both toolCallId and toolName.
 * This helper detects both and extracts the tool name from wherever it lives.
 */
interface DetectedToolPart {
  toolCallId: string;
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  /** Present when state is approval-requested (needsApproval pause). */
  approvalId?: string;
}

function detectToolPart(part: unknown): DetectedToolPart | null {
  const p = part as Record<string, unknown>;
  if (!p || typeof p !== "object") return null;
  if (!("toolCallId" in p)) return null;

  const type = p.type as string | undefined;
  let toolName: string | undefined;

  // Static tools: type is "tool-{name}", no toolName property
  if (type && typeof type === "string" && type.startsWith("tool-")) {
    toolName = type.slice(5); // strip "tool-" prefix
  }

  // Dynamic tools: type is "dynamic-tool", has toolName property
  if ("toolName" in p && typeof p.toolName === "string") {
    toolName = p.toolName;
  }

  if (!toolName) return null;

  return {
    toolCallId: p.toolCallId as string,
    toolName,
    state: (p.state as string) || "unknown",
    input: p.input,
    output: p.output,
    errorText: typeof p.errorText === "string" ? p.errorText : undefined,
    approvalId: (p.approval as { id?: string } | undefined)?.id,
  };
}

/** Shape of the note payload returned by createNote / updateNote tools. */
interface NotePayload {
  __notePayload: true;
  kind: "created" | "updated";
  /** What was created — defaults to "note"; propose_workflow sends "workflow" (S6). */
  noun?: string;
  contentId: string;
  title: string;
  parentId?: string | null;
  wordCount?: number;
}

/** Shape of the image payload returned by generate_image tool */
interface ImagePayload {
  __imagePayload: true;
  contentId: string;
  url: string;
  prompt: string;
  revisedPrompt?: string | null;
  providerId: string;
  modelId: string;
  width: number;
  height: number;
  fileName: string;
}

/** Shape of the audio payload returned by the generate_speech tool */
interface AudioPayload {
  __audioPayload: true;
  contentId: string;
  url: string;
  text: string;
  mimeType: string;
  durationSeconds?: number | null;
  providerId: string;
  modelId: string;
  fileName: string;
}

/**
 * Shape of the deck proposal payload returned by propose_deck.
 * Session 1: renders a read-only stub with a DISABLED commit button so
 * the affordance is visible before Session 2 wires up the POST.
 */
interface DeckProposalPayload {
  __deckProposal: true;
  name: string;
  parentDeckPath: string | null;
  parentDeckId: string | null;
  parentResolved: boolean;
  proposedPath: string;
  rationale: string;
  similarExistingPaths: string[];
}

/**
 * Shape of the card proposal payload returned by propose_cards.
 * Carries `requestedCount` and `batchLimit` so the rendered card can
 * display the truncation honestly (e.g. "10 of 15 requested").
 */
/**
 * Stage 3 — propose_deck_with_cards payload. Replaces the old
 * __deckWithCardsProposal sentinel. The deck info is embedded so the commit
 * step is self-sufficient: if `deck.deckExists` is false, the client
 * creates the deck (using deck.name + deck.parentDeckId) before
 * posting the cards. When the parent deck doesn't exist yet either
 * (deck.parentResolved === false), the card waits for a sibling
 * propose_deck card to fire `flashcard-deck-created` for the parent
 * path before "Add selected" enables.
 */
interface DeckWithCardsProposalPayload {
  __deckWithCardsProposal: true;
  deck: {
    name: string;
    proposedPath: string;
    parentDeckPath: string | null;
    parentDeckId: string | null;
    parentResolved: boolean;
    rationale: string | null;
    similarExistingPaths: string[];
    deckExists: boolean;
    deckId: string | null;
    existingName: string | null;
  };
  cards: Array<{
    front: string;
    back: string;
    frontLabel?: string;
    backLabel?: string;
  }>;
  requestedCount: number;
  batchLimit: number;
  sourceContentId: string | null;
}

// Shared lowlight instance — same config as TipTap editor
const lowlight = createLowlight(common);

interface ChatMessageProps {
  message: UIMessage;
  isStreaming?: boolean;
  /**
   * True when this streaming message is a resumed stream (reload / second
   * tab), so the buffered flood settles in full instead of re-typing
   * already-generated content (AI 3.3). Inert unless `isStreaming`.
   */
  resumedStream?: boolean;
  /**
   * Provider id that produced this message. Drives per-message theming
   * (bubble shape, code-block chrome, typography). Falls back to the
   * surface's active provider when undefined — Session 4 will pass the
   * stamped provider once messages flow through the Conversation entity.
   */
  providerId?: string | null;
  /**
   * Model id that produced this message. Shown in the avatar hover
   * tooltip together with the provider name.
   */
  modelId?: string | null;
  /**
   * Edit a user message (Session 5a). When provided, user bubbles show a
   * hover pencil that swaps the bubble for an inline editor; confirming
   * supersedes this turn and re-runs from here.
   */
  onEdit?: (messageId: string, newText: string) => void;
  /**
   * Respond to a `needsApproval` tool pause (AI v3 core S1). When provided,
   * approval-requested tool parts render an approval card whose
   * Approve/Reject call this; the engine's sendAutomaticallyWhen resumes
   * the loop once all pending approvals are answered.
   */
  /**
   * AI v3.1 R1 — mid-run review. When true (full-page chat while the run
   * is streaming or parked on an approval), artifact cards default-click
   * into a SPLIT PANE so review never displaces the conversation.
   * Right-click "Open in split pane" is available regardless.
   */
  midRunPaneOpen?: boolean;
  onToolApprovalResponse?: (opts: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => void;
  /**
   * False when this message is no longer the conversation's last — a
   * pending approval that far back can never execute (S4 smoke finding);
   * the card renders as expired instead of actionable.
   */
  approvalActionable?: boolean;
  /**
   * Regenerate an assistant message (Session 5a). When provided,
   * assistant messages show a hover refresh that re-runs the model.
   */
  onRegenerate?: (messageId: string) => void;
  /**
   * Branch/fork from this message. When provided, assistant messages show
   * a hover "Branch" action that forks the conversation up to here into a
   * new chat for exploring an alternate direction.
   */
  onBranch?: (messageId: string) => void;
  /** Disable edit/regenerate/branch (e.g. while a turn is streaming). */
  actionsDisabled?: boolean;
  /** Revert a specific edit by tool call ID — called when the user clicks "Undo" on an edit chip. */
  onRevertEdit?: (toolCallId: string) => void;
  /** Set of tool call IDs for which a pre-edit snapshot is available (drives undo button visibility). */
  revertableToolIds?: ReadonlySet<string>;
  /** Current chat destination used by the reply-to-note action. */
  outputTarget?: OutputTarget;
  /** Persistence context used to resolve the selected output target safely. */
  conversationId?: string | null;
  /** Rooted note/folder/chat for sidebar and full-page placement semantics. */
  contentId?: string | null;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming = false,
  resumedStream = false,
  providerId,
  modelId,
  onEdit,
  onRegenerate,
  onBranch,
  actionsDisabled = false,
  onRevertEdit,
  revertableToolIds,
  onToolApprovalResponse,
  approvalActionable = true,
  midRunPaneOpen = false,
  outputTarget,
  conversationId,
  contentId,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const theme = getProviderTheme(providerId);

  // Typewriter reveal — on by default, user-toggleable in settings.
  const typingEffect = useSettingsStore((s) => s.ai?.typingEffect);
  const typingActive = (typingEffect ?? true) && isStreaming;

  // Reasoning surface — render `reasoning` parts when the model emits
  // them. Toggleable via settings; default on. (Session 6)
  const showReasoning = useSettingsStore((s) => s.ai?.showReasoning);
  const reasoningEnabled = showReasoning ?? true;

  // Plain text of this message (joined text parts) — the edit seed.
  const messageText = useMemo(
    () =>
      message.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("")
        .trim(),
    [message.parts],
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTitle, setExportTitle] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  /**
   * Snapshot of the message's `@[Title](id)` mentions captured at edit
   * start. On commit we walk this list and re-canonicalize each plain
   * `@Title` token back to its full form so the edit doesn't strip the
   * content-id from existing mentions. Order matches first-occurrence
   * semantics — useful when the same label appears twice.
   */
  const mentionMapRef = useRef<Array<{ label: string; id: string }>>([]);

  const beginEdit = useCallback(() => {
    // Convert `@[Title](id)` → `@Title` for the textarea display. The
    // user sees readable text; we restore the canonical form on save.
    const map: Array<{ label: string; id: string }> = [];
    const cleaned = messageText.replace(
      /@\[([^\]]+)\]\(([^)]+)\)/g,
      (_, label, id) => {
        map.push({ label, id });
        return `@${label}`;
      },
    );
    mentionMapRef.current = map;
    setDraft(cleaned);
    setEditing(true);
  }, [messageText]);

  const handleCopyMessage = useCallback(async () => {
    if (!messageText) return;
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked in iframe contexts — silent */
    }
  }, [messageText]);

  const beginReplyExport = useCallback(() => {
    setExportTitle(inferReplyExportTitle(messageText));
    setExportError(null);
    setExportOpen(true);
  }, [messageText]);

  const handleReplyExport = useCallback(async () => {
    const title = exportTitle.trim();
    if (!title || !outputTarget || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const response = await fetch("/api/ai/reply-to-note", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          markdown: messageText,
          messageId: message.id,
          conversationId,
          contentId,
          outputTarget,
        }),
      });
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        data?: {
          contentId?: string;
          receipt?: ContentWriteReceipt | null;
        };
      };
      if (!response.ok || !body.success || !body.data?.contentId) {
        throw new Error(body.error || "Couldn't create the note.");
      }

      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
      window.dispatchEvent(
        new CustomEvent("dg:notes-refresh", {
          detail: { contentId: body.data.contentId },
        }),
      );
      setExportOpen(false);
      toast.success(
        body.data.receipt
          ? `Created "${title}" in ${body.data.receipt.location.title}`
          : `Created "${title}"`,
      );
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Couldn't create the note.",
      );
    } finally {
      setExporting(false);
    }
  }, [
    contentId,
    conversationId,
    exportTitle,
    exporting,
    message.id,
    messageText,
    outputTarget,
  ]);

  const commitEdit = useCallback(() => {
    let next = draft.trim();
    // Restore `@[Title](id)` for each preserved mention. Each mapping
    // consumes its first matching `@Title` substring; if the user
    // deleted that mention during edit we skip it (the canonical token
    // stays gone, which is the correct outcome).
    for (const m of mentionMapRef.current) {
      const token = `@${m.label}`;
      const idx = next.indexOf(token);
      if (idx === -1) continue;
      next =
        next.slice(0, idx) +
        `@[${m.label}](${m.id})` +
        next.slice(idx + token.length);
    }
    setEditing(false);
    if (!next || next === messageText) return;
    onEdit?.(message.id, next);
  }, [draft, messageText, onEdit, message.id]);

  // Pre-scan: extract image + note + flashcard-proposal payloads from ALL
  // tool parts at message level. More reliable than detecting inside the
  // parts loop because it handles streaming state transitions and part
  // type variations.
  const {
    imagePayloads,
    audioPayloads,
    notePayloads,
    writeReceipts,
    deckProposals,
    deckWithCardsProposals,
    hasRunningTools,
  } = useMemo(() => {
    const images: ImagePayload[] = [];
    const audios: AudioPayload[] = [];
    const notes: NotePayload[] = [];
    const writes: Array<{
      toolCallId: string;
      receipt: ContentWriteReceipt;
    }> = [];
    const deckProps: DeckProposalPayload[] = [];
    const deckWithCardsProps: DeckWithCardsProposalPayload[] = [];
    let running = false;
    const seenImageIds = new Set<string>();
    const seenAudioIds = new Set<string>();
    const seenNoteIds = new Set<string>();

    for (const part of message.parts) {
      const tp = detectToolPart(part);
      if (!tp) continue;

      if (tp.state === "input-streaming" || tp.state === "input-available") {
        running = true;
      }

      if (tp.state === "output-available" && tp.output !== undefined) {
        const receipts = parseContentWriteReceipts(tp.output);
        for (const receipt of receipts) {
          writes.push({ toolCallId: tp.toolCallId, receipt });
        }
        const image = parseImagePayload(tp.output);
        if (image && !seenImageIds.has(image.contentId)) {
          seenImageIds.add(image.contentId);
          images.push(image);
          continue;
        }
        const audio = parseAudioPayload(tp.output);
        if (audio && !seenAudioIds.has(audio.contentId)) {
          seenAudioIds.add(audio.contentId);
          audios.push(audio);
          continue;
        }
        // New results use the generic write receipt. Keep the legacy note
        // parser only for already-persisted conversations from before the
        // receipt contract landed.
        const note =
          receipts.length === 0 ? parseNotePayload(tp.output) : null;
        if (note && !seenNoteIds.has(note.contentId)) {
          seenNoteIds.add(note.contentId);
          notes.push(note);
          continue;
        }
        const deck = parseDeckProposal(tp.output);
        if (deck) {
          deckProps.push(deck);
          continue;
        }
        const cards = parseDeckWithCardsProposal(tp.output);
        if (cards) {
          deckWithCardsProps.push(cards);
        }
      }
    }

    return {
      imagePayloads: images,
      audioPayloads: audios,
      notePayloads: notes,
      writeReceipts: writes,
      deckProposals: deckProps,
      deckWithCardsProposals: deckWithCardsProps,
      hasRunningTools: running,
    };
  }, [message.parts]);

  // Coalesce text runs into single render units (v3 ship fix, 2026-07-18):
  // provider-native web-search answers stream as MANY text parts — the
  // provider emits a new part per cited span, so bubble-per-part produced
  // a wall of fragment windows (a lone "." or a bare "- " each in its own
  // bubble). One logical passage = ONE bubble. Join with "" — the split
  // points are artificial; the model's own whitespace/newlines live inside
  // the part texts, so plain concatenation reconstructs the original
  // markdown. Invisible parts (citation sources, step boundaries) must not
  // break a run either; only genuinely rendered parts (tools, files,
  // reasoning) do.
  type MessagePart = (typeof message.parts)[number];
  const renderParts = useMemo(() => {
    const units: Array<{ key: number; part: MessagePart }> = [];
    let run: { key: number; text: string } | null = null;
    const flush = () => {
      if (run !== null) {
        units.push({
          key: run.key,
          part: { type: "text", text: run.text } as MessagePart,
        });
        run = null;
      }
    };
    for (let i = 0; i < message.parts.length; i++) {
      const part = message.parts[i];
      if (part.type === "text") {
        const text = (part as { text?: string }).text ?? "";
        if (run !== null) run.text += text;
        else run = { key: i, text };
        continue;
      }
      if (
        part.type === "source-url" ||
        part.type === "source-document" ||
        part.type === "step-start"
      ) {
        continue;
      }
      flush();
      units.push({ key: i, part });
    }
    flush();
    return units;
  }, [message.parts]);

  // Native-provider web search (Anthropic/OpenAI/Google big-provider tools)
  // surfaces its sources as `source-url`/`source-document` parts rather than a
  // `search_web` tool card — those parts are skipped by the unit renderer
  // above, so the search was previously invisible. Count them so the message
  // can show "Searched the web · N sources", matching the integrated-search
  // tool-card count.
  const webSourceCount = useMemo(() => {
    let n = 0;
    for (const part of message.parts) {
      if (part.type === "source-url" || part.type === "source-document") n += 1;
    }
    return n;
  }, [message.parts]);

  // NOTE: tree-refresh + content-updated dispatch for AI note writes
  // lives in `use-conversation-engine.ts` `onFinish` — fires exactly
  // once per AI completion. Putting that logic here (in the render
  // path) re-fired every time a historical assistant message mounted,
  // which caused a refetch loop on page open. Do NOT move it back.

  return (
    <>
    <div
      // Assistant turns get aria-live="polite" so screen-reader users
      // hear streaming progress without interrupting other speech.
      // User turns are static (no SR announcement needed). aria-busy
      // on streaming so SR doesn't try to re-announce on every chunk.
      role={isAssistant ? "article" : undefined}
      aria-live={isAssistant && isStreaming ? "polite" : undefined}
      aria-busy={isAssistant && isStreaming ? true : undefined}
      aria-label={
        isAssistant
          ? `Assistant message${isStreaming ? ", in progress" : ""}`
          : "Your message"
      }
      className={cn(
        "group flex gap-3 px-4 py-3",
        isUser && "flex-row-reverse"
      )}
    >
      {/* Avatar */}
      {isUser ? (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
          <User className="h-4 w-4" />
        </div>
      ) : (
        <AssistantAvatar
          providerId={providerId}
          modelId={modelId}
          metadata={
            (message as { metadata?: Record<string, unknown> }).metadata
          }
        />
      )}

      {/* Message content. User bubbles are positioned right via flex-row-reverse
          (line ~267) and the action row uses its own justify-end, so we do NOT
          add text-right here — keeping text-left makes line-wrapped bullet
          lists / multi-line prompts read left-to-right while the bubble still
          sits on the right side of the column. */}
      <div
        className={cn(
          "min-w-0 space-y-2",
          theme.bubble.columnClassName,
        )}
      >
        {/* Inline editor for user messages (Session 5a) */}
        {editing && isUser ? (
          <div className="space-y-1.5">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              rows={Math.min(8, Math.max(1, draft.split("\n").length))}
              // Visually mirror the view-mode bubble. Three pieces:
              //   - matching bg / border / padding / radius (so the
              //     bubble appears to become editable in place);
              //   - `field-sizing: content` lets the textarea shrink
              //     to its text width like the view's `inline-block`
              //     bubble (Chromium 123+, Firefox 124+); fallback is
              //     `w-full` which is still legible just wider;
              //   - `max-w-full` keeps it from overflowing the column.
              style={{ fieldSizing: "content" } as React.CSSProperties}
              className="w-full max-w-full resize-y rounded-xl border border-blue-500/20 bg-blue-600/10 text-blue-950 dark:bg-blue-600/30 dark:text-blue-100 px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/30 align-top"
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                onClick={() => setEditing(false)}
                className="rounded-md px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-black/[0.04] dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={commitEdit}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 transition-colors"
                title="Save & re-run (⌘/Ctrl+Enter)"
              >
                Save &amp; submit
              </button>
            </div>
          </div>
        ) : (
        <>
        {/* Render message parts (text runs pre-coalesced — see renderParts) */}
        {renderParts.map(({ key: i, part }) => {
          // Reasoning / "thinking" parts (Session 6). Routed to a
          // provider-themed renderer keyed on this message's stamped
          // providerId — not the panel's active provider — so branched
          // chats with mixed providers stay coherent.
          if (part.type === "reasoning" && reasoningEnabled) {
            const reasoningText =
              (part as { type: "reasoning"; text?: string }).text ?? "";
            if (!reasoningText) return null;
            return (
              <ReasoningRouter
                key={i}
                providerId={providerId}
                text={reasoningText}
                streaming={isStreaming && isAssistant}
              />
            );
          }

          // Playbook attachments are durable data parts bound to the user
          // turn, rather than composer-only state. They render as a sent
          // attachment and are ignored by the SDK's model conversion; the
          // server adds independently validated model context.
          if (part.type === "data-playbook") {
            const playbook = parsePlaybookMessageAttachment(part);
            if (!playbook) return null;
            const phaseLabel =
              playbook.phaseCount > 0
                ? ` · Phase ${Math.min(playbook.phaseIndex + 1, playbook.phaseCount)}/${playbook.phaseCount}`
                : "";
            return (
              <div
                key={i}
                title="Playbook attached to this message"
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/[0.08] px-2.5 py-1.5 text-xs text-indigo-700 dark:text-indigo-300"
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{playbook.title}</span>
                {phaseLabel && (
                  <span className="shrink-0 text-indigo-500/80 dark:text-indigo-300/70">
                    {phaseLabel}
                  </span>
                )}
              </div>
            );
          }

          // Attached files (Session 5b) — image thumbnail or file pill.
          // Clicking opens the backing referenced ContentNode in the
          // content viewer (the id rides in providerMetadata.app).
          if (part.type === "file") {
            const filePart = part as {
              type: "file";
              url?: string;
              mediaType?: string;
              filename?: string;
              providerMetadata?: { app?: { contentNodeId?: string } };
            };
            const nodeId = filePart.providerMetadata?.app?.contentNodeId;
            const openContent = nodeId
              ? () =>
                  useContentStore.getState().setSelectedContentId(nodeId)
              : undefined;
            const isImg = filePart.mediaType?.startsWith("image/");
            if (isImg && filePart.url) {
              const imgUrl = filePart.url;
              return (
                // eslint-disable-next-line @next/next/no-img-element -- user-attached image, arbitrary host
                <img
                  key={i}
                  src={imgUrl}
                  alt={filePart.filename ?? "attachment"}
                  onClick={() =>
                    useImagePreviewStore.getState().open([
                      {
                        src: imgUrl,
                        alt: filePart.filename ?? "image",
                        downloadUrl: imgUrl,
                      },
                    ])
                  }
                  title="Preview image"
                  className="max-h-64 max-w-full cursor-zoom-in rounded-lg border border-black/10 dark:border-white/10 inline-block hover:opacity-90 transition-opacity"
                />
              );
            }
            // Audio attachment → inline player so the user can replay the clip.
            if (filePart.mediaType?.startsWith("audio/") && filePart.url) {
              return (
                <audio
                  key={i}
                  controls
                  src={filePart.url}
                  preload="metadata"
                  className="my-1 max-w-full rounded-lg"
                />
              );
            }
            return (
              <button
                key={i}
                type="button"
                onClick={openContent}
                disabled={!openContent}
                title={openContent ? "Open attachment" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5 px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300",
                  openContent && "hover:bg-black/[0.06] dark:hover:bg-white/10 transition-colors cursor-pointer",
                )}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="truncate max-w-[200px]">
                  {filePart.filename ?? "Attachment"}
                </span>
              </button>
            );
          }

          if (part.type === "text") {
            if (!part.text) {
              if (isStreaming && isAssistant) {
                return (
                  <StreamingIndicator key={i} indicator={theme.streamingIndicator} />
                );
              }
              return null;
            }

            // User messages: simple bubble, no markdown — but DO render
            // mention pills so @[Title](id) tokens (rewritten in handleSend)
            // don't show as raw markdown syntax.
            if (isUser) {
              return (
                <div
                  key={i}
                  className="inline-block rounded-xl px-3.5 py-2.5 text-sm leading-relaxed bg-blue-600/10 text-blue-950 dark:bg-blue-600/30 dark:text-blue-100 border border-blue-500/20"
                >
                  <UserMessageText text={part.text} />
                </div>
              );
            }

            // Assistant messages: full markdown rendering, theme-driven,
            // with the subtle typewriter reveal while streaming.
            return (
              <div
                key={i}
                className={cn(
                  "text-sm",
                  theme.bubble.assistantClassName,
                  theme.bubble.paddingClassName,
                  theme.bubble.proseClassName,
                )}
                style={{ fontFamily: theme.typography.fontFamily }}
              >
                <AssistantText
                  text={part.text}
                  theme={theme}
                  active={typingActive}
                  settleInitial={resumedStream}
                />
              </div>
            );
          }

          // Tool parts: detect via detectToolPart helper (handles both static and dynamic)
          // Image generation tool results render as GeneratedImageCard at message level below.
          // Note creation/update tool results render as NotePayloadCard at message level below.
          // Flashcard proposals render as DeckProposalCard / CardProposalList at message level below.
          const toolPart = detectToolPart(part);
          if (toolPart) {
            // needsApproval pause: the loop is parked until the user
            // responds. Render the approval card instead of the bubble.
            if (
              toolPart.state === "approval-requested" &&
              toolPart.approvalId &&
              toolPart.toolName === "phase_checkpoint"
            ) {
              return (
                <PhaseCheckpointCard
                  key={i}
                  input={toolPart.input}
                  approvalId={toolPart.approvalId}
                  onRespond={
                    approvalActionable ? onToolApprovalResponse : undefined
                  }
                  expired={!approvalActionable}
                />
              );
            }
            if (
              toolPart.state === "approval-requested" &&
              toolPart.approvalId
            ) {
              return (
                <ToolApprovalCard
                  key={i}
                  toolName={toolPart.toolName}
                  args={toolPart.input}
                  approvalId={toolPart.approvalId}
                  onRespond={
                    approvalActionable ? onToolApprovalResponse : undefined
                  }
                  expired={!approvalActionable}
                />
              );
            }
            if (toolPart.state === "output-available") {
              if (parseImagePayload(toolPart.output) !== null) return null;
              if (parseAudioPayload(toolPart.output) !== null) return null;
              if (parseNotePayload(toolPart.output) !== null) return null;
              if (parseDeckProposal(toolPart.output) !== null) return null;
              if (parseDeckWithCardsProposal(toolPart.output) !== null) return null;
            }

            return (
              <ToolCallBubble
                key={i}
                toolName={toolPart.toolName}
                toolCallId={toolPart.toolCallId}
                state={toolPart.state}
                args={toolPart.input}
                result={toolPart.output}
                errorText={toolPart.errorText}
                isRevertable={revertableToolIds?.has(toolPart.toolCallId) ?? false}
                onRevertEdit={onRevertEdit}
              />
            );
          }

          return null;
        })}

        {/* Native-provider web search summary (AI 3.4 smoke finding): big
            providers cite via source parts, not a search_web card, so show
            how many sources the search consulted. */}
        {webSourceCount > 0 && (
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-black/[0.03] px-2 py-1 text-[11px] text-gray-500 dark:bg-white/5 dark:text-gray-400">
            <Globe className="h-3 w-3 shrink-0 opacity-70" />
            <span>
              Searched the web · {webSourceCount} source
              {webSourceCount === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {/* Image cards — rendered at message level for reliability */}
        {imagePayloads.map((payload) => (
          <GeneratedImageCard key={payload.contentId} payload={payload} />
        ))}

        {/* Audio cards — inline player for generate_speech results */}
        {audioPayloads.map((payload) => (
          <GeneratedAudioCard key={payload.contentId} payload={payload} />
        ))}

        {/* Note cards — clickable link affordance for createNote / updateNote */}
        {notePayloads.map((payload) => (
          <NotePayloadCard
            key={payload.contentId}
            payload={payload}
            midRunPaneOpen={midRunPaneOpen}
          />
        ))}

        {/* Durable write receipts — every AI tool that persists content
            declares both the written node and its effective tree location.
            Flow + wrap as compact chips (smoke finding) rather than a
            full-width vertical stack. */}
        {writeReceipts.length > 0 && (
          <div className="my-1 flex flex-wrap gap-1.5">
            {writeReceipts.map(({ toolCallId, receipt }, index) => (
              <ContentWriteReceiptCard
                key={`${toolCallId}-${receipt.contentId}-${index}`}
                receipt={receipt}
                midRunPaneOpen={midRunPaneOpen}
              />
            ))}
          </div>
        )}

        {/* Deck proposals — Session 2: interactive card with POST commit */}
        {deckProposals.map((payload, i) => (
          <FlashcardDeckProposalCard key={`deck-${i}`} payload={payload} />
        ))}

        {/* Card proposals — Session 2: inline editing + per-row checkboxes + bulk POST.
            `proposalId` threads through to localStorage so the "already-added"
            row state persists across chat reloads — without it, reloading would
            re-enable "Add selected" and let the user duplicate the batch. */}
        {deckWithCardsProposals.map((payload, i) => (
          <FlashcardCardProposalList
            key={`cards-${i}`}
            payload={payload}
            proposalId={`${message.id}-cards-${i}`}
          />
        ))}

        {/* Thinking indicator — shows during tool execution */}
        {isStreaming && isAssistant && hasRunningTools && (
          <ThinkingIndicator />
        )}

        {/* Fallback: streaming indicator when parts is empty */}
        {isStreaming &&
          isAssistant &&
          message.parts.length === 0 && (
            <StreamingIndicator indicator={theme.streamingIndicator} />
          )}

        {/* Hover actions — icon-only, with tooltip + aria-label for a11y.
            Copy on every message; edit (user); regenerate + branch
            (assistant). Hidden until row hover; suppressed while streaming. */}
        {!isStreaming && messageText && (
          <div
            // `focus-within` keeps the action bar visible when a button
            // inside it has keyboard focus — without this, keyboard users
            // tab into invisible (opacity-0) buttons that they can't
            // see they've focused.
            className={cn(
              "flex items-center gap-0.5 group-hover:opacity-100 focus-within:opacity-100 transition-opacity text-gray-500",
              isAssistant ? "opacity-60" : "opacity-0",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            <MessageActionButton
              onClick={() => void handleCopyMessage()}
              label={copied ? "Copied" : "Copy"}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </MessageActionButton>

            {isAssistant && outputTarget && (
              <MessageActionButton
                onClick={beginReplyExport}
                disabled={actionsDisabled}
                label={`Send reply to output target: ${getOutputTargetLabel(outputTarget)}`}
              >
                <FileOutput className="h-3.5 w-3.5" />
              </MessageActionButton>
            )}

            {isUser && onEdit && (
              <MessageActionButton
                onClick={() => onEdit(message.id, messageText)}
                disabled={actionsDisabled}
                label="Re-run this message"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </MessageActionButton>
            )}
            {isUser && onEdit && (
              <MessageActionButton
                onClick={beginEdit}
                disabled={actionsDisabled}
                label="Edit & re-run"
              >
                <Pencil className="h-3.5 w-3.5" />
              </MessageActionButton>
            )}
            {isAssistant && onRegenerate && (
              <MessageActionButton
                onClick={() => onRegenerate(message.id)}
                disabled={actionsDisabled}
                label="Regenerate response"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </MessageActionButton>
            )}
            {isAssistant && onBranch && (
              <MessageActionButton
                onClick={() => onBranch(message.id)}
                disabled={actionsDisabled}
                label="Branch a new chat from here"
              >
                <GitBranch className="h-3.5 w-3.5" />
              </MessageActionButton>
            )}
          </div>
        )}
        </>
        )}
      </div>
    </div>
    {exportOpen &&
      outputTarget &&
      createPortal(
        <ReplyExportDialog
          title={exportTitle}
          targetLabel={getOutputTargetLabel(outputTarget)}
          busy={exporting}
          error={exportError}
          onTitleChange={setExportTitle}
          onCancel={() => {
            if (!exporting) setExportOpen(false);
          }}
          onSubmit={() => void handleReplyExport()}
        />,
        document.body,
      )}
    </>
  );
});

function ReplyExportDialog({
  title,
  targetLabel,
  busy,
  error,
  onTitleChange,
  onCancel,
  onSubmit,
}: {
  title: string;
  targetLabel: string;
  busy: boolean;
  error: string | null;
  onTitleChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="reply-export-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="w-full max-w-md rounded-xl border border-black/10 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-[#1b1b1d]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="reply-export-title"
              className="text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              Send reply to output target
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Destination: {targetLabel}.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            className="rounded-md p-1 text-gray-500 hover:bg-black/5 hover:text-gray-800 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label
          htmlFor="reply-export-name"
          className="mt-4 block text-xs font-medium text-gray-700 dark:text-gray-300"
        >
          Note name
        </label>
        <input
          id="reply-export-name"
          autoFocus
          value={title}
          maxLength={255}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Name this note"
          disabled={busy}
          className="mt-1.5 w-full rounded-lg border border-black/15 bg-black/[0.025] px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.04] dark:text-gray-100"
        />
        {error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-black/5 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-default disabled:opacity-40"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create note
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Icon-only message action with an accessible tooltip. `label` drives
 * both the native hover tooltip (`title`) and the screen-reader name
 * (`aria-label`), so the row stays compact without losing affordance.
 */
function MessageActionButton({
  onClick,
  label,
  disabled = false,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center rounded-md p-1 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-black/[0.04] dark:hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
    >
      {children}
    </button>
  );
}

// ─── Markdown Renderer ───────────────────────────────────────

const MENTION_PATTERN = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** Pre-process @[Title](id) mentions into markdown-safe placeholders */
function preprocessMentions(text: string): string {
  return text.replace(
    MENTION_PATTERN,
    (_, title, id) => `[@@${title}](mention:${id})`
  );
}

/**
 * Render a user message bubble: plain text outside of mention syntax,
 * MentionPill for each `@[Title](id)` match. Intentionally does NOT
 * process markdown — user-typed `**bold**` should stay literal.
 */
function UserMessageText({ text }: { text: string }) {
  const segments = useMemo(() => {
    const out: Array<
      | { kind: "text"; value: string }
      | { kind: "mention"; title: string; id: string }
    > = [];
    let cursor = 0;
    // Clone the regex so iteration state doesn't leak between renders.
    const re = new RegExp(MENTION_PATTERN.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (match.index > cursor) {
        out.push({ kind: "text", value: text.slice(cursor, match.index) });
      }
      out.push({ kind: "mention", title: match[1], id: match[2] });
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) {
      out.push({ kind: "text", value: text.slice(cursor) });
    }
    return out;
  }, [text]);

  return (
    <span className="whitespace-pre-wrap">
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <MentionPill key={i} title={seg.title} contentId={seg.id} />
        ),
      )}
    </span>
  );
}

/**
 * Assistant text with optional typewriter reveal. When `active` (the
 * message is streaming and the setting is on), the text is revealed
 * progressively; otherwise it renders in full immediately. Lives in its
 * own component so the typewriter hook can run per text-part without
 * violating the rules of hooks.
 */
function AssistantText({
  text,
  theme,
  active,
  settleInitial = false,
}: {
  text: string;
  theme: ProviderTheme;
  active: boolean;
  settleInitial?: boolean;
}) {
  const revealed = useTypewriter(text, active, settleInitial);
  return <MarkdownContent text={revealed} theme={theme} />;
}

/** Full markdown renderer for assistant messages */
function MarkdownContent({ text, theme }: { text: string; theme: ProviderTheme }) {
  const processed = useMemo(() => preprocessMentions(text), [text]);
  const components = useMemo(() => buildMarkdownComponents(theme), [theme]);

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {processed}
    </ReactMarkdown>
  );
}

/**
 * Build the react-markdown component map. Most elements are theme-
 * neutral; only `code` (fenced) consumes the provider theme so its
 * header chrome / wrapper styling matches the active provider.
 */
function buildMarkdownComponents(theme: ProviderTheme): Components {
  return {
  ...themeNeutralMarkdownComponents,
  code: (props: React.JSX.IntrinsicElements["code"] & ExtraProps) => {
    const { children, className, node, ...rest } = props;
    void node;
    const match = /language-(\w+)/.exec(className || "");

    // Fenced code block (wrapped in <pre> by react-markdown)
    if (match) {
      return (
        <CodeBlock language={match[1]} theme={theme}>
          {String(children).replace(/\n$/, "")}
        </CodeBlock>
      );
    }

    // Inline code
    return (
      <code
        {...rest}
        className="rounded bg-black/[0.06] text-amber-700 dark:bg-white/10 dark:text-amber-300 px-1 py-0.5 text-xs font-mono"
      >
        {children}
      </code>
    );
  },
  };
}

/**
 * Theme-neutral subset of the markdown component map — extracted so
 * `buildMarkdownComponents` can spread it alongside the theme-dependent
 * `code` handler.
 */
const themeNeutralMarkdownComponents: Components = {
  // ── Headings ──
  h1: ({ children }) => (
    <h1 className="text-xl font-bold mt-4 mb-2 text-gray-900 dark:text-white/90 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold mt-3.5 mb-2 text-gray-900 dark:text-white/90 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold mt-3 mb-1.5 text-gray-900/90 dark:text-white/85 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold mt-2.5 mb-1 text-gray-900/85 dark:text-white/80 first:mt-0">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="text-sm font-medium mt-2 mb-1 text-gray-800/85 dark:text-white/75 first:mt-0">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-xs font-medium mt-2 mb-1 text-gray-700 dark:text-white/70 uppercase tracking-wide first:mt-0">
      {children}
    </h6>
  ),

  // ── Images — suppress AI-generated images already shown as GeneratedImageCards ──
  img: ({ src, alt }) => {
    const srcStr = typeof src === "string" ? src : "";
    if (srcStr && (srcStr.includes("r2.cloudflarestorage.com") || srcStr.includes("/ai-gen-"))) {
      return null;
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={srcStr} alt={alt || ""} className="max-w-full rounded-lg my-2" />;
  },

  // ── Paragraphs ──
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,

  // ── Links — detect mention pills ──
  a: ({ href, children }) => {
    if (href?.startsWith("mention:")) {
      const contentId = href.slice(8);
      const title = String(children ?? "").replace(/^@@/, "");
      return <MentionPill title={title} contentId={contentId} />;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2 transition-colors"
      >
        {children}
      </a>
    );
  },

  // ── Lists ──
  ul: ({ children }) => (
    <ul className="mb-2 ml-4 list-disc space-y-0.5 marker:text-gray-500 dark:text-gray-400 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-0.5 marker:text-gray-500 dark:text-gray-400 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,

  // ── Blockquotes ──
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-gray-600 dark:text-gray-400 italic">
      {children}
    </blockquote>
  ),

  // ── Inline formatting ──
  strong: ({ children }) => (
    <strong className="font-semibold text-[#8A6A00] dark:text-[#FFD700]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="text-gray-500 dark:text-gray-400 line-through">{children}</del>
  ),
  pre: ({ children }) => <>{children}</>,

  // ── Tables ──
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-black/[0.03] dark:bg-white/5 border-b border-black/10 dark:border-white/10">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-black/5 dark:border-white/5 last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left font-medium text-gray-700 dark:text-gray-300">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{children}</td>
  ),

  // ── Horizontal Rule ──
  hr: () => <hr className="my-3 border-black/10 dark:border-white/10" />,

  // ── Task list checkbox (from remark-gfm) ──
  input: (props: React.JSX.IntrinsicElements["input"]) => {
    if (props.type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={props.checked}
          readOnly
          className="mr-1.5 accent-primary"
        />
      );
    }
    return <input {...props} />;
  },
};

// ─── Code Block with Syntax Highlighting + Copy ───────────────

function CodeBlock({
  language,
  children,
  theme,
}: {
  language: string;
  children: string;
  theme: ProviderTheme;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [children]);

  // Syntax highlight via lowlight
  const highlighted = useMemo(() => {
    try {
      if (lowlight.registered(language)) {
        const tree = lowlight.highlight(language, children);
        return renderHast(tree);
      }
    } catch {
      // Fall through to plain text
    }
    return null;
  }, [language, children]);

  return (
    <div className={cn("group/code relative my-2", theme.codeBlock.wrapperClassName)}>
      {/* Header bar */}
      <div className={theme.codeBlock.headerClassName}>
        {theme.codeBlock.showLanguagePill ? (
          <span className="uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
            {language}
          </span>
        ) : (
          <span />
        )}
        {theme.codeBlock.showCopyButton && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                <span className="text-green-600 dark:text-green-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        )}
      </div>
      {/* Code content */}
      <pre className="overflow-x-auto p-3 text-xs font-mono leading-relaxed text-gray-700 dark:text-gray-300">
        <code>{highlighted ?? children}</code>
      </pre>
    </div>
  );
}

/**
 * Render lowlight HAST tree to React elements.
 * Lowlight returns a hast (HTML AST) tree; we convert it to React nodes.
 */
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function renderHast(tree: { children: HastNode[] }): React.ReactNode[] {
  return tree.children.map((node, i) => renderHastNode(node, i));
}

function renderHastNode(node: HastNode, key: number): React.ReactNode {
  if (node.type === "text") {
    return node.value;
  }
  if (node.type === "element" && node.tagName === "span") {
    const className = Array.isArray(node.properties?.className)
      ? (node.properties.className as string[]).join(" ")
      : (node.properties?.className as string) ?? "";
    return (
      <span key={key} className={className}>
        {node.children?.map((child, ci) => renderHastNode(child, ci))}
      </span>
    );
  }
  // Fallback: render children
  if (node.children) {
    return node.children.map((child, ci) => renderHastNode(child, ci));
  }
  return null;
}

// ─── Existing Sub-Components ─────────────────────────────────

/**
 * Assistant avatar with provider/model/usage tooltip.
 *
 * Tooltip:
 *   - shows after a 1-second deliberate hover (cursor-pass-through guard)
 *   - rendered in a body-level portal anchored to the avatar's
 *     getBoundingClientRect, so message-bubble overflow:hidden / rounded
 *     corners can't clip or reflow it
 *   - displays provider name + model name + this turn's input/output
 *     tokens when present in message.metadata.usage
 *
 * Background tints to the producing provider's brand color so the
 * avatar itself is an at-a-glance provider indicator.
 */
type UsageShape = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} | undefined;

function extractUsage(metadata: Record<string, unknown> | undefined): UsageShape {
  if (!metadata || typeof metadata !== "object") return undefined;
  const usage = (metadata as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as Record<string, unknown>;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  return {
    inputTokens: num(u.inputTokens),
    outputTokens: num(u.outputTokens),
    totalTokens: num(u.totalTokens),
  };
}

function AssistantAvatar({
  providerId,
  modelId,
  metadata,
}: {
  providerId?: string | null;
  modelId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const [tooltipAnchor, setTooltipAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  const theme = getProviderTheme(providerId, useResolvedTheme());
  const provider = PROVIDER_CATALOG.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);
  const providerName = provider?.name ?? "AI assistant";
  const modelName = model?.name ?? modelId ?? null;
  const usage = useMemo(() => extractUsage(metadata), [metadata]);

  useEffect(() => {
    // One-shot SSR/hydration boundary marker so we only render the
    // portal once `document.body` is present. The React Compiler flags
    // "setState in effect" defensively here; this is the same one-shot
    // pattern used by the right-sidebar hydration hook, not a render-
    // synchronization bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot post-mount marker
    setPortalReady(typeof document !== "undefined");
  }, []);

  const handleEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Anchor just below the avatar, aligned to its left — keeps the tooltip
      // at the hover point instead of drifting off to the right in narrow
      // surfaces like the browser side panel.
      setTooltipAnchor({
        top: rect.bottom + 6,
        left: rect.left,
      });
    }, 1000);
  }, []);

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTooltipAnchor(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      ref={anchorRef}
      className="shrink-0"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full"
        style={{
          background: theme.bubbleTint,
          color: theme.brandColor,
          border: `1px solid ${theme.brandColor}33`,
        }}
      >
        <Bot className="h-4 w-4" />
      </div>
      {portalReady && tooltipAnchor &&
        createPortal(
          <div
            role="tooltip"
            // Fixed positioning relative to the viewport — no ancestor
            // overflow / transform can clip or reflow this.
            style={{
              position: "fixed",
              top: tooltipAnchor.top,
              left: tooltipAnchor.left,
              zIndex: 9999,
            }}
            className="pointer-events-none whitespace-nowrap rounded-md border border-black/10 bg-white text-gray-700 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-gray-200 px-2.5 py-1.5 text-[10px] shadow-xl"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: theme.brandColor }}
              />
              <span className="font-medium">{providerName}</span>
            </div>
            {modelName && (
              <div className="mt-0.5 text-gray-500 dark:text-gray-400">
                {modelName}
              </div>
            )}
            {usage && (usage.inputTokens != null || usage.outputTokens != null) && (
              <div className="mt-1 flex items-center gap-2 border-t border-black/10 dark:border-white/10 pt-1 text-gray-500">
                {usage.inputTokens != null && (
                  <span>
                    <span className="text-gray-500">in</span>{" "}
                    <span className="tabular-nums text-gray-700 dark:text-gray-300">
                      {usage.inputTokens.toLocaleString()}
                    </span>
                  </span>
                )}
                {usage.outputTokens != null && (
                  <span>
                    <span className="text-gray-500">out</span>{" "}
                    <span className="tabular-nums text-gray-700 dark:text-gray-300">
                      {usage.outputTokens.toLocaleString()}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Clickable mention pill — navigates to the referenced content */
function MentionPill({ title, contentId }: { title: string; contentId: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        useContentStore.getState().setSelectedContentId(contentId);
      }}
      className="inline-flex items-center gap-0.5 rounded bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 px-1.5 py-0.5 text-xs font-medium hover:bg-blue-500/25 dark:hover:bg-blue-500/30 transition-colors cursor-pointer"
    >
      @{title}
    </button>
  );
}

/** Parse an image payload from a tool result string */
function parseImagePayload(result: unknown): ImagePayload | null {
  if (result === undefined) return null;
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (!str.includes('"__imagePayload"')) return null;
  try {
    const parsed = JSON.parse(str);
    if (parsed.__imagePayload) return parsed as ImagePayload;
  } catch {
    // not valid JSON
  }
  return null;
}

/** Parse an audio payload from a generate_speech tool result string */
function parseAudioPayload(result: unknown): AudioPayload | null {
  if (result === undefined) return null;
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (!str.includes('"__audioPayload"')) return null;
  try {
    const parsed = JSON.parse(str);
    if (parsed.__audioPayload) return parsed as AudioPayload;
  } catch {
    // not valid JSON
  }
  return null;
}

/** Parse a note payload (createNote / updateNote) from a tool result. */
function parseNotePayload(result: unknown): NotePayload | null {
  if (result === undefined) return null;
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (!str.includes('"__notePayload"')) return null;
  try {
    const parsed = JSON.parse(str);
    if (parsed.__notePayload) return parsed as NotePayload;
  } catch {
    /* not valid JSON */
  }
  return null;
}

/** Parse a deck proposal payload from a propose_deck tool result. */
function parseDeckProposal(result: unknown): DeckProposalPayload | null {
  if (result === undefined) return null;
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (!str.includes('"__deckProposal"')) return null;
  try {
    const parsed = JSON.parse(str);
    if (parsed.__deckProposal) return parsed as DeckProposalPayload;
  } catch {
    /* not valid JSON */
  }
  return null;
}

/** Parse a card proposal payload from a propose_cards tool result. */
function parseDeckWithCardsProposal(result: unknown): DeckWithCardsProposalPayload | null {
  if (result === undefined) return null;
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (!str.includes('"__deckWithCardsProposal"')) return null;
  try {
    const parsed = JSON.parse(str);
    if (parsed.__deckWithCardsProposal) return parsed as DeckWithCardsProposalPayload;
  } catch {
    /* not valid JSON */
  }
  return null;
}

/**
 * Tool call indicator bubble — collapsed-by-default disclosure.
 *
 * The previous implementation dumped a 200-char slice of the raw tool
 * output directly into the bubble, which looks chaotic when tools
 * return concatenated text (e.g. `read_first_chunk` returns the doc's
 * stripped text). The new design:
 *
 *   - Header row: status icon, tool name, one-line summary chip
 *     (e.g. "425 chars" / "12 items" / "ok"), chevron disclosure.
 *   - Body (hidden until expanded): monospace pre-block with proper
 *     wrapping, a max-height scroll, and a copy-to-clipboard button.
 *
 * The summary chip is derived heuristically from the result shape
 * (string length, array length, object keys, edit-payload action)
 * so the user sees *something* informative without expanding.
 */

/**
 * Approval card for `needsApproval` tool pauses (AI v3 core S1).
 *
 * The tool loop is parked in `approval-requested` state server-side; the
 * user's Approve/Reject answers via useChat's addToolApprovalResponse and
 * the engine's sendAutomaticallyWhen re-sends so the loop resumes. The
 * card shows the tool's input so the user knows exactly what they are
 * approving. After responding it collapses to a status line — the SDK
 * flips the part to approval-responded on the next render, but keeping
 * local state makes the transition instant.
 */
/**
 * Tri-verdict phase checkpoint (AI v3 core S4d, umbrella "Approvals,
 * verdicts & background runs"). Maps natively onto SDK approvals:
 * Approve → approved; Revise → denied + reason (the model redoes the
 * phase incorporating it); Approve with tweaks → approved + reason (the
 * model applies the changes, then continues). Free text still works —
 * this card just formalizes the common verdicts.
 */
function PhaseCheckpointCard({
  input,
  approvalId,
  onRespond,
  expired = false,
}: {
  input: unknown;
  approvalId: string;
  onRespond?: (opts: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => void;
  expired?: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "revise" | "tweaks">("idle");
  const [feedback, setFeedback] = useState("");
  const [verdict, setVerdict] = useState<string | null>(null);

  const data = (input ?? {}) as {
    phase?: string;
    summary?: string;
    artifacts?: string[];
    openQuestions?: string[];
    next?: string;
  };

  // Verdict channels (SDK constraint discovered 2026-07-18): approval
  // responses for client-executed tools are DROPPED from model messages —
  // only denial reasons reach the model (as execution-denied results). So
  // both feedback verdicts ride the denial channel with framing prefixes;
  // the model re-runs or adjusts, then checkpoints again (which also gives
  // tweaked phases a fresh ledger entry).
  const respond = (
    kind: "approve" | "revise" | "tweaks",
    feedbackText?: string,
  ) => {
    if (verdict || !onRespond) return;
    if (kind === "approve") {
      onRespond({ id: approvalId, approved: true });
      setVerdict("Approved — continuing…");
      return;
    }
    const framed =
      kind === "revise"
        ? `REVISE THIS PHASE — redo it incorporating this feedback, then call phase_checkpoint again: ${feedbackText}`
        : `APPROVED WITH TWEAKS — apply these changes to this phase's output, then call phase_checkpoint again: ${feedbackText}`;
    onRespond({ id: approvalId, approved: false, reason: framed });
    setVerdict(
      kind === "revise"
        ? "Revision requested — redoing the phase…"
        : "Tweaks sent — applying, then re-checkpointing…",
    );
  };

  return (
    <div className="rounded-lg border border-indigo-400/40 bg-indigo-500/[0.06] text-xs overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <GitBranch className="h-3 w-3 shrink-0 text-indigo-400" />
        <span className="font-medium text-gray-700 dark:text-gray-300 truncate">
          {data.phase
            ? `Phase checkpoint: ${data.phase}`
            : "Phase checkpoint"}
        </span>
      </div>
      {data.summary && (
        <div className="mx-3 mb-2 whitespace-pre-wrap text-[11px] leading-snug text-gray-600 dark:text-gray-400">
          {data.summary}
        </div>
      )}
      {(data.artifacts?.length ?? 0) > 0 && (
        <div className="mx-3 mb-2 text-[11px] text-gray-500 dark:text-gray-500">
          Artifacts: {data.artifacts!.join(" · ")}
        </div>
      )}
      {expired ? (
        <div className="px-3 pb-2 text-[11px] text-gray-500 dark:text-gray-400">
          Expired — the conversation moved on past this checkpoint.
        </div>
      ) : verdict ? (
        <div className="px-3 pb-2 text-[11px] text-gray-500 dark:text-gray-400">
          {verdict}
        </div>
      ) : (
        <>
          {mode !== "idle" && (
            <div className="mx-3 mb-2">
              <textarea
                autoFocus
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={
                  mode === "revise"
                    ? "What should change? The phase will be redone with this feedback…"
                    : "What tweaks should be applied before continuing?"
                }
                className="w-full rounded-md border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400/50 min-h-[52px] resize-y"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
            {mode === "idle" ? (
              <>
                <button
                  type="button"
                  onClick={() => respond("approve")}
                  disabled={!onRespond}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600/90 hover:bg-emerald-600 disabled:opacity-50 text-white px-2.5 py-1 text-[11px] font-medium transition-colors"
                >
                  <Check className="h-3 w-3" /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => setMode("revise")}
                  disabled={!onRespond}
                  className="inline-flex items-center gap-1 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" /> Revise
                </button>
                <button
                  type="button"
                  onClick={() => setMode("tweaks")}
                  disabled={!onRespond}
                  className="inline-flex items-center gap-1 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <Pencil className="h-3 w-3" /> Approve with tweaks
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => respond(mode, feedback.trim())}
                  disabled={!onRespond || feedback.trim().length === 0}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-600/90 hover:bg-indigo-600 disabled:opacity-50 text-white px-2.5 py-1 text-[11px] font-medium transition-colors"
                >
                  <Check className="h-3 w-3" />
                  {mode === "revise" ? "Send revision" : "Approve with tweaks"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("idle");
                    setFeedback("");
                  }}
                  className="rounded-md px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Approval previews (owner request 2026-07-18: "no JSON, or less JSON") ──
// Per-tool renderers show the action as it will actually LAND — a note
// preview for document tools, a graph summary for workflow tools, labeled
// rows otherwise. Raw JSON stays available in a collapsible <details> so
// nothing is hidden, just demoted.

const approvalMarkdownComponents: Components = {
  h1: ({ children }) => (
    <div className="mt-1.5 text-[12px] font-bold">{children}</div>
  ),
  h2: ({ children }) => (
    <div className="mt-1.5 text-[11.5px] font-bold">{children}</div>
  ),
  h3: ({ children }) => (
    <div className="mt-1 text-[11px] font-semibold">{children}</div>
  ),
  p: ({ children }) => <p className="my-1">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-1 list-disc pl-4 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1 list-decimal pl-4 space-y-0.5">{children}</ol>
  ),
  code: ({ children }) => (
    <code className="rounded bg-black/[0.06] dark:bg-white/[0.08] px-1 text-[10.5px]">
      {children}
    </code>
  ),
  a: ({ children }) => <span className="underline">{children}</span>,
  table: ({ children }) => (
    <table className="my-1 text-[10.5px] border-collapse">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border border-black/10 dark:border-white/10 px-1.5 py-0.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-black/10 dark:border-white/10 px-1.5 py-0.5">
      {children}
    </td>
  ),
};

/** Collapsible raw JSON — the honest fallback, demoted not removed. */
function ApprovalRawJson({ args }: { args: unknown }) {
  const json = useMemo(() => {
    if (args === undefined || args === null) return null;
    try {
      return typeof args === "string" ? args : JSON.stringify(args, null, 2);
    } catch {
      return null;
    }
  }, [args]);
  if (!json) return null;
  return (
    <details className="mx-3 mb-2">
      <summary className="cursor-pointer text-[10.5px] text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 select-none">
        Raw JSON
      </summary>
      <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-black/[0.04] dark:bg-white/[0.05] px-2 py-1.5 text-[11px] leading-snug whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400">
        {json}
      </pre>
    </details>
  );
}

/** Bare hostname (no www.) from a tool call's `url` arg, or "" if absent/bad. */
function hostFromToolArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const url = (args as { url?: unknown }).url;
  if (typeof url !== "string" || !url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** camelCase / snake_case tool-arg key → a human "Spaced Label". */
function humanizeApprovalKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** Labeled key→value rows for shallow primitive args. */
function ApprovalFieldRows({ fields }: { fields: Array<[string, string]> }) {
  if (fields.length === 0) return null;
  return (
    <div className="mx-3 mb-1.5 space-y-0.5">
      {fields.map(([label, value]) => (
        <div key={label} className="flex gap-2 text-[11px]">
          <span className="shrink-0 w-28 text-gray-500 dark:text-gray-500">
            {label}
          </span>
          <span className="min-w-0 break-words text-gray-700 dark:text-gray-300">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ApprovalPreview({
  toolName,
  args,
}: {
  toolName: string;
  args: unknown;
}) {
  const a = (
    typeof args === "object" && args !== null ? args : {}
  ) as Record<string, unknown>;
  const str = (key: string): string | undefined =>
    typeof a[key] === "string" && (a[key] as string).length > 0
      ? (a[key] as string)
      : undefined;

  // Document tools: render the note/document as it will actually look.
  if (
    toolName === "createNote" ||
    toolName === "updateNote" ||
    toolName === "create_docx"
  ) {
    const title = str("title") ?? str("fileName") ?? "(untitled)";
    const abstract = str("abstract");
    const content = str("content") ?? str("markdown");
    return (
      <>
        <div className="mx-3 mb-1.5 rounded-md border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/25 px-3 py-2">
          <div className="text-[12.5px] font-semibold text-gray-800 dark:text-gray-200">
            {title}
            {toolName === "create_docx" && (
              <span className="ml-1.5 text-[10px] font-normal text-gray-500">
                .docx
              </span>
            )}
          </div>
          {abstract && (
            <div className="mt-0.5 text-[11px] italic text-gray-500 dark:text-gray-400">
              {abstract}
            </div>
          )}
          {content && (
            <div className="mt-1.5 max-h-52 overflow-auto border-t border-black/[0.06] dark:border-white/[0.08] pt-1.5 text-[11px] leading-snug text-gray-700 dark:text-gray-300">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={approvalMarkdownComponents}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        <ApprovalRawJson args={args} />
      </>
    );
  }

  // Workflow authoring: graph summary, not the graph JSON.
  if (toolName === "propose_workflow" || toolName === "update_workflow") {
    const graph = (
      typeof a.graph === "object" && a.graph !== null ? a.graph : {}
    ) as {
      nodes?: Array<{ id?: string; type?: string; label?: string }>;
      edges?: unknown[];
    };
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    const fields: Array<[string, string]> = [];
    const wfName = str("name") ?? str("newName");
    if (wfName) fields.push(["Name", wfName]);
    fields.push([
      "Engine",
      str("engine") ??
        (toolName === "propose_workflow" ? "n8n (default)" : "keeps current"),
    ]);
    fields.push([
      "Shape",
      `${nodes.length} node${nodes.length === 1 ? "" : "s"} · ${edges.length} connection${edges.length === 1 ? "" : "s"}`,
    ]);
    return (
      <>
        <ApprovalFieldRows fields={fields} />
        {nodes.length > 0 && (
          <div className="mx-3 mb-1.5 rounded-md border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/25 px-3 py-1.5 max-h-40 overflow-auto">
            {nodes.map((node, idx) => (
              <div
                key={node.id ?? idx}
                className="flex items-baseline gap-1.5 text-[11px] leading-relaxed"
              >
                <span className="text-gray-400 dark:text-gray-600">
                  {idx + 1}.
                </span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {node.label ?? node.id ?? "node"}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-500">
                  {node.type}
                </span>
              </div>
            ))}
          </div>
        )}
        <ApprovalRawJson args={args} />
      </>
    );
  }

  // Generic: labeled rows for primitive fields, raw JSON for the rest.
  const fields: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(a)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      const text = String(value);
      fields.push([
        humanizeApprovalKey(key),
        text.length > 140 ? `${text.slice(0, 140)}…` : text,
      ]);
    }
  }
  const hasComplexArgs = Object.values(a).some(
    (value) => typeof value === "object" && value !== null,
  );
  return (
    <>
      <ApprovalFieldRows fields={fields} />
      {(hasComplexArgs || fields.length === 0) && (
        <ApprovalRawJson args={args} />
      )}
    </>
  );
}

function ToolApprovalCard({
  toolName,
  args,
  approvalId,
  onRespond,
  expired = false,
}: {
  toolName: string;
  args: unknown;
  approvalId: string;
  onRespond?: (opts: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => void;
  /** Stale pause (message superseded) — render status, not buttons. */
  expired?: boolean;
}) {
  const [responded, setResponded] = useState<"approved" | "rejected" | null>(
    null,
  );
  const prettyName = toolName.replace(/_/g, " ");

  const respond = (approved: boolean) => {
    if (responded || !onRespond) return;
    onRespond({ id: approvalId, approved });
    setResponded(approved ? "approved" : "rejected");
  };

  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-500/[0.06] text-xs overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <ShieldAlert className="h-3 w-3 shrink-0 text-amber-500" />
        <span className="font-medium text-gray-700 dark:text-gray-300 truncate">
          Approval needed: {prettyName}
        </span>
      </div>
      <ApprovalPreview toolName={toolName} args={args} />
      {expired ? (
        <div className="px-3 pb-2 text-[11px] text-gray-500 dark:text-gray-400">
          Expired — this action never ran. Ask again if it&apos;s still wanted.
        </div>
      ) : responded === null ? (
        <div className="flex items-center gap-2 px-3 pb-2">
          <button
            type="button"
            onClick={() => respond(true)}
            disabled={!onRespond}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600/90 hover:bg-emerald-600 disabled:opacity-50 text-white px-2.5 py-1 text-[11px] font-medium transition-colors"
          >
            <Check className="h-3 w-3" /> Approve
          </button>
          <button
            type="button"
            onClick={() => respond(false)}
            disabled={!onRespond}
            className="inline-flex items-center gap-1 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-300 transition-colors"
          >
            <X className="h-3 w-3" /> Reject
          </button>
        </div>
      ) : (
        <div className="px-3 pb-2 text-[11px] text-gray-500 dark:text-gray-400">
          {responded === "approved" ? "Approved — resuming…" : "Rejected."}
        </div>
      )}
    </div>
  );
}

function ToolCallBubble({
  toolName,
  toolCallId,
  state,
  args,
  result,
  errorText,
  isRevertable = false,
  onRevertEdit,
}: {
  toolName: string;
  toolCallId?: string;
  state: string;
  args: unknown;
  result?: unknown;
  errorText?: string;
  isRevertable?: boolean;
  onRevertEdit?: (toolCallId: string) => void;
}) {
  const isRunning = state === "input-streaming" || state === "input-available";
  const hasResult = state === "output-available";
  const hasError = state === "output-error";
  const wasStopped =
    hasError && errorText?.startsWith("Stopped by the user") === true;
  const hasDetails = hasResult || (hasError && Boolean(errorText));
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reverted, setReverted] = useState(false);

  // Canonical string form of the result for display + clipboard.
  const resultString = useMemo(() => {
    if (hasError) return errorText ?? null;
    if (!hasResult || result === undefined) return null;
    return typeof result === "string"
      ? result
      : JSON.stringify(result, null, 2);
  }, [hasError, hasResult, result, errorText]);

  // One-line summary used in the collapsed header. Tells the user what
  // came back without forcing them to expand — char counts for text,
  // item counts for arrays, "edit applied" for orchestrator payloads.
  const summary = useMemo<string | null>(() => {
    if (isRunning) return "running…";
    if (wasStopped) return "stopped";
    if (hasError) return "failed";
    if (!hasResult || result === undefined) return null;
    // Edit-payload JSON → render the action verb only.
    if (
      typeof result === "string" &&
      result.startsWith("{") &&
      result.includes('"__editPayload"')
    ) {
      try {
        const parsed = JSON.parse(result) as { action?: string };
        return parsed.action ?? "edit applied";
      } catch {
        /* fall through to default summary */
      }
    }
    if (typeof result === "string") {
      const len = result.length;
      return `${len.toLocaleString()} char${len === 1 ? "" : "s"}`;
    }
    if (Array.isArray(result)) {
      return `${result.length} item${result.length === 1 ? "" : "s"}`;
    }
    if (result && typeof result === "object") {
      const keys = Object.keys(result as Record<string, unknown>);
      return `${keys.length} field${keys.length === 1 ? "" : "s"}`;
    }
    return "ok";
  }, [isRunning, wasStopped, hasError, hasResult, result]);

  // Human action phrase — describes what the tool is *doing* (present
  // tense while running, past tense when done) rather than echoing the
  // raw tool identifier.
  const prettyName = useMemo(
    () => {
      if (toolName === "phase_checkpoint") {
        const phase =
          args &&
          typeof args === "object" &&
          typeof (args as { phase?: unknown }).phase === "string"
            ? (args as { phase: string }).phase.trim()
            : "";
        if (phase) return `Phase checkpoint: ${phase}`;
      }
      // Name the note being read (smoke finding: "Read a note" didn't say
      // WHICH note). The getCurrentNote result is "Title: <title>\n…".
      if (toolName === "getCurrentNote" && typeof result === "string") {
        const m = result.match(/^Title:\s*(.+)$/m);
        if (m?.[1]?.trim()) {
          return `${isRunning ? "Reading" : "Read"} note: ${m[1].trim()}`;
        }
      }
      // Web search: surface how many results/sources came back (integrated
      // app-executed search returns untrustedWebResults).
      if (
        (toolName === "search_web" || toolName === "web_search") &&
        result &&
        typeof result === "object"
      ) {
        const r = result as { untrustedWebResults?: unknown };
        if (Array.isArray(r.untrustedWebResults)) {
          const n = r.untrustedWebResults.length;
          return `Searched the web · ${n} result${n === 1 ? "" : "s"}`;
        }
      }
      // Name the page being fetched by its domain.
      if (
        (toolName === "read_page" || toolName === "read_url") &&
        args &&
        typeof args === "object"
      ) {
        const url = (args as { url?: unknown }).url;
        if (typeof url === "string" && url) {
          try {
            const host = new URL(url).hostname.replace(/^www\./, "");
            return `${isRunning ? "Reading" : "Read"} page: ${host}`;
          } catch {
            /* not a parseable URL — fall through */
          }
        }
      }
      // Agentic Browsing — the single reader and the explicit launcher: express
      // the ACTION taken (headless fetch vs. a background browser tab vs.
      // escalated to a VISIBLE tab) so the chip shows what actually happened,
      // not just the tool name.
      if (toolName === "read_page_headless_or_browser") {
        const host = hostFromToolArgs(args);
        const suffix = host ? `: ${host}` : "";
        if (isRunning) return `Reading page${suffix}`;
        const r =
          result && typeof result === "object"
            ? (result as { via?: string; escalationNote?: string })
            : null;
        if (r?.escalationNote) return `Read page — opened a browser tab${suffix}`;
        if (r?.via === "session-tab") return `Read page in a browser tab${suffix}`;
        return `Read page (headless)${suffix}`;
      }
      if (toolName === "open_tab_and_read") {
        const host = hostFromToolArgs(args);
        const suffix = host ? `: ${host}` : "";
        return `${isRunning ? "Opening" : "Opened"} a browser tab${suffix}`;
      }
      // A stopped card names the action that was in progress rather than
      // claiming the tool completed successfully.
      return toolActionLabel(toolName, isRunning || wasStopped);
    },
    [toolName, isRunning, wasStopped, args, result],
  );

  // True when this tool result is an edit payload (apply_diff, replace_document, insert_image).
  const isEditPayload = useMemo(
    () =>
      hasResult &&
      typeof result === "string" &&
      result.startsWith("{") &&
      result.includes('"__editPayload"'),
    [hasResult, result],
  );

  const handleRevert = useCallback(() => {
    if (!toolCallId) return;
    onRevertEdit?.(toolCallId);
    setReverted(true);
  }, [toolCallId, onRevertEdit]);

  const handleCopy = useCallback(async () => {
    if (!resultString) return;
    try {
      await navigator.clipboard.writeText(resultString);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked in iframe contexts — silent */
    }
  }, [resultString]);

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        disabled={!hasDetails}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left",
          hasDetails && "hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors cursor-pointer",
          !hasDetails && "cursor-default",
        )}
        title={hasDetails ? (expanded ? "Hide details" : "Show details") : undefined}
      >
        {isRunning ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-400" />
        ) : wasStopped ? (
          <CircleStop className="h-3 w-3 shrink-0 text-gray-500 dark:text-gray-400" />
        ) : hasError ? (
          <ShieldAlert className="h-3 w-3 shrink-0 text-red-500/80" />
        ) : (
          <Wrench className="h-3 w-3 shrink-0 text-emerald-400/80" />
        )}
        <span className="font-medium text-gray-700 dark:text-gray-300 truncate">
          {prettyName}
        </span>
        {summary && (
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-mono",
              isRunning
                ? "bg-amber-500/10 text-amber-400/80"
                : wasStopped
                  ? "bg-black/[0.04] dark:bg-white/[0.06] text-gray-500 dark:text-gray-400"
                  : hasError
                    ? "bg-red-500/10 text-red-500/80"
                    : "bg-black/[0.04] dark:bg-white/[0.06] text-gray-500 dark:text-gray-400",
            )}
          >
            {summary}
          </span>
        )}
        {hasDetails && (
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 text-gray-500 transition-transform",
              expanded && "rotate-90",
              !summary && "ml-auto",
            )}
          />
        )}
      </button>
      {hasDetails && expanded && resultString && (
        <div className="border-t border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-black/20">
          <div className="flex items-center justify-between px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-500">
            <span>{hasError ? (wasStopped ? "Stopped" : "Error") : "Result"}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-black/[0.04] dark:hover:bg-white/5 transition-colors"
              title="Copy result"
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
          <pre className="max-h-60 overflow-auto px-3 pb-2 text-[11px] font-mono leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words">
            {resultString}
          </pre>
        </div>
      )}
      {isEditPayload && (
        <div className="border-t border-black/[0.06] dark:border-white/[0.06] flex items-center gap-2 px-3 py-1.5">
          {!reverted ? (
            <button
              type="button"
              onClick={handleRevert}
              disabled={!isRevertable}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] transition-colors",
                isRevertable
                  ? "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                  : "text-gray-400 dark:text-gray-600 cursor-default",
              )}
              title={isRevertable ? "Restore document to its state before this edit" : "Applying edit…"}
            >
              <RotateCcw className="h-3 w-3 shrink-0" />
              Undo
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3 shrink-0" />
              Reverted
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Friendly action phrasing per tool — `[runningLabel, doneLabel]`. Reads
 * as "what the assistant is doing" instead of the code identifier. Tools
 * without an entry fall back to a humanized name.
 */
const TOOL_ACTION_LABELS: Record<string, [running: string, done: string]> = {
  read_first_chunk: ["Reading the document", "Read the document"],
  read_next_chunk: ["Reading further", "Read further"],
  read_previous_chunk: ["Reading the earlier section", "Read the earlier section"],
  apply_diff: ["Editing the document", "Edited the document"],
  replace_document: ["Rewriting the document", "Rewrote the document"],
  insert_image: ["Inserting an image", "Inserted an image"],
  plan: ["Planning the approach", "Planned the approach"],
  ask_user: ["Asking you a question", "Asked a question"],
  finish_with_summary: ["Wrapping up", "Wrapped up"],
  searchNotes: ["Searching your notes", "Searched your notes"],
  getCurrentNote: ["Reading a note", "Read a note"],
  createNote: ["Creating a note", "Created a note"],
  generate_image: ["Generating an image", "Generated an image"],
};

function toolActionLabel(toolName: string, isRunning: boolean): string {
  const entry = TOOL_ACTION_LABELS[toolName];
  if (entry) return isRunning ? entry[0] : entry[1];
  // Fallback: humanize snake_case / kebab-case → "Sentence case".
  const cleaned = toolName.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return toolName;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

// ─── Generated Image Card ─────────────────────────────────────

/**
 * Renders an AI-generated image with insert + drag actions.
 *
 * - "Insert into document" dispatches a CustomEvent that the
 *   MarkdownEditor listens for and inserts at cursor position.
 * - Draggable via HTML5 drag with image URL in dataTransfer,
 *   compatible with TipTap's image drop handler.
 */
/**
 * Clickable receipt for every ContentNode write performed by an AI tool.
 * The second line names the effective tree container after persistence, so
 * referenced outputs and folder-targeted outputs are distinguishable.
 */
function ContentWriteReceiptCard({
  receipt,
  midRunPaneOpen = false,
}: {
  receipt: ContentWriteReceipt;
  midRunPaneOpen?: boolean;
}) {
  const selectedContentId = useContentStore((s) => s.selectedContentId);
  const isSelfNotes =
    selectedContentId === receipt.contentId && receipt.noun === "notes";
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const handleClick = useCallback(() => {
    if (isSelfNotes) {
      useNotesPanelStore.getState().setExpanded(true);
      setTimeout(() => {
        document
          .getElementById("notes-panel-anchor")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
      return;
    }
    if (midRunPaneOpen) {
      openArtifactInSplitPane({
        contentId: receipt.contentId,
        title: receipt.title,
        contentType: receipt.contentType,
      });
      return;
    }
    useContentStore.getState().setSelectedContentId(receipt.contentId);
  }, [
    isSelfNotes,
    midRunPaneOpen,
    receipt.contentId,
    receipt.contentType,
    receipt.title,
  ]);

  const operation =
    receipt.operation.charAt(0).toUpperCase() + receipt.operation.slice(1);
  const location =
    receipt.location.kind === "reference"
      ? `under ${receipt.location.title}`
      : receipt.location.kind === "folder"
        ? `in ${receipt.location.title}`
        : `in ${receipt.location.title}`;
  const tooltipText = `${operation} ${receipt.noun} "${receipt.title}" ${location}. Click to ${midRunPaneOpen ? "open in a split pane" : "open"}; right-click for options.`;
  const noun = receipt.noun.toLowerCase();
  const ReceiptIcon =
    receipt.contentType === "folder"
      ? FolderOpen
      : receipt.contentType === "external"
        ? ExternalLink
        : receipt.contentType === "workflow"
          ? GitBranch
          : receipt.contentType === "chat"
            ? MessageSquare
            : receipt.contentType === "visualization"
              ? Activity
              : receipt.contentType === "data"
                ? Table2
                : receipt.contentType === "code" ||
                    receipt.contentType === "html" ||
                    receipt.contentType === "template"
                  ? FileCode2
                  : receipt.contentType === "file" && noun.includes("image")
                    ? ImageIcon
                    : receipt.contentType === "file" &&
                        (noun.includes("audio") || noun.includes("speech"))
                      ? Volume2
                      : receipt.contentType === "file"
                        ? File
                        : FileText;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuPos({ x: event.clientX, y: event.clientY });
        }}
        className="group inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/[0.07] px-2 py-1 text-left text-xs transition-colors hover:border-emerald-500/45 hover:bg-emerald-500/[0.11]"
        title={tooltipText}
      >
        <ReceiptIcon className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        {/* Compact single-line chip (smoke finding: the old two-line cards
            ate the panel). The operation + location moved to the tooltip;
            the icon + green tone already signal "AI wrote this". */}
        <span className="truncate font-medium text-gray-800 group-hover:text-emerald-800 dark:text-gray-100 dark:group-hover:text-emerald-300">
          {receipt.title}
        </span>
      </button>
      {menuPos && (
        <ArtifactContextMenu
          position={menuPos}
          artifact={{
            contentId: receipt.contentId,
            title: receipt.title,
            contentType: receipt.contentType,
          }}
          onClose={() => setMenuPos(null)}
        />
      )}
    </>
  );
}

/**
 * Inline card rendered when createNote / updateNote tool returns. Replaces
 * the raw "Created note (id: …)" string with a clickable affordance that
 * opens the note in the main panel. Compact so it doesn't dominate the
 * assistant turn — Bug C target.
 */
function NotePayloadCard({
  payload,
  midRunPaneOpen = false,
}: {
  payload: NotePayload;
  midRunPaneOpen?: boolean;
}) {
  // Self-edit detection: the AI updated this very chat's own sidecar
  // notes (same contentId as the open content). In that case clicking
  // "open" doesn't make sense — you're already here — so instead we
  // expand + scroll to the Notes editor panel below the chat. For
  // non-self payloads (a different note got created or updated), the
  // click navigates to that content as before.
  const selectedContentId = useContentStore((s) => s.selectedContentId);
  // Self-edit only applies to the chat's own sidecar NOTES. A workflow
  // payload matching the open content means the AI updated the workflow
  // the user is looking at — that's not a notes-panel affair (S6).
  const isSelfEdit =
    selectedContentId === payload.contentId && (payload.noun ?? "note") === "note";
  // Right-click menu anchor (R1) — null when closed.
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const noun = payload.noun ?? "note";
  const artifactContentType = noun === "workflow" ? "workflow" : "note";

  const handleClick = useCallback(() => {
    if (isSelfEdit) {
      useNotesPanelStore.getState().setExpanded(true);
      // Defer scroll until React has had a chance to render the
      // newly-expanded panel.
      setTimeout(() => {
        document
          .getElementById("notes-panel-anchor")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
      return;
    }
    // Mid-run review (v3.1 R1): while the run is active, the artifact
    // opens BESIDE the conversation, never over it.
    if (midRunPaneOpen) {
      openArtifactInSplitPane({
        contentId: payload.contentId,
        title: payload.title,
        contentType: artifactContentType,
      });
      return;
    }
    useContentStore.getState().setSelectedContentId(payload.contentId);
  }, [
    isSelfEdit,
    midRunPaneOpen,
    payload.contentId,
    payload.title,
    artifactContentType,
  ]);

  const verb = payload.kind === "updated" ? "Updated" : "Created";
  const wordCount =
    typeof payload.wordCount === "number" && payload.wordCount > 0
      ? ` · ${payload.wordCount.toLocaleString()} word${payload.wordCount === 1 ? "" : "s"}`
      : "";
  const subline = isSelfEdit
    ? `${verb} this chat's notes${wordCount} · click to view`
    : `${verb} ${noun}${wordCount} · click to ${midRunPaneOpen ? "open in split pane" : "open"}`;
  const tooltipText = isSelfEdit
    ? "View the updated notes for this chat"
    : `Open "${payload.title}"${midRunPaneOpen ? " in a split pane" : ""} — right-click for options`;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuPos({ x: e.clientX, y: e.clientY });
        }}
        className="group inline-flex max-w-full items-center gap-2 rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2 text-left text-sm transition-colors hover:border-blue-400/40 hover:bg-blue-500/5 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        title={tooltipText}
      >
        <FileText className="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-gray-900 group-hover:text-blue-700 dark:text-gray-100 dark:group-hover:text-blue-300">
            {payload.title}
          </span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {subline}
          </span>
        </span>
      </button>
      {menuPos && (
        <ArtifactContextMenu
          position={menuPos}
          artifact={{
            contentId: payload.contentId,
            title: payload.title,
            contentType: artifactContentType,
          }}
          onClose={() => setMenuPos(null)}
        />
      )}
    </>
  );
}

function GeneratedImageCard({ payload }: { payload: ImagePayload }) {
  const [inserted, setInserted] = useState(false);
  const selectedContentType = useContentStore((s) => s.selectedContentType);
  const canInsert = selectedContentType === "note";
  // "Add to…" flyout — inject this image into ANY content's note.
  const [injectAnchor, setInjectAnchor] = useState<{ x: number; y: number } | null>(null);
  const imageMedia: InjectMedia = {
    kind: "image",
    url: payload.url,
    contentId: payload.contentId,
    alt: payload.revisedPrompt || payload.prompt,
    filename: payload.fileName,
  };

  const handleInsertIntoDocument = useCallback(() => {
    // Dispatch CustomEvent for the editor to handle
    window.dispatchEvent(
      new CustomEvent("insert-ai-image", {
        detail: {
          src: payload.url,
          alt: payload.revisedPrompt || payload.prompt,
          contentId: payload.contentId,
          source: "ai-generated",
        },
      })
    );
    setInserted(true);
    setTimeout(() => setInserted(false), 3000);
  }, [payload]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      // Set image URL for TipTap drop handler
      e.dataTransfer.setData("text/uri-list", payload.url);
      e.dataTransfer.setData("text/plain", payload.url);
      // Also pass structured data for richer handling
      e.dataTransfer.setData(
        "application/x-dg-ai-image",
        JSON.stringify({
          src: payload.url,
          alt: payload.revisedPrompt || payload.prompt,
          contentId: payload.contentId,
          source: "ai-generated",
        })
      );
      e.dataTransfer.effectAllowed = "copy";
    },
    [payload]
  );

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5 overflow-hidden max-w-sm">
      {/* Image */}
      <div
        className="relative group cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={handleDragStart}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={payload.url}
          alt={payload.revisedPrompt || payload.prompt}
          className="w-full h-auto"
          loading="lazy"
        />
        {/* Drag handle overlay — always visible for discoverability */}
        <div className="absolute top-2 right-2">
          <div className="rounded bg-black/60 p-1" title="Drag to editor">
            <GripVertical className="h-4 w-4 text-white/70" />
          </div>
        </div>
        {/* AI badge */}
        <div className="absolute top-2 left-2">
          <span className="rounded bg-indigo-500/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
            AI
          </span>
        </div>
      </div>

      {/* Info + Actions */}
      <div className="px-3 py-2 space-y-2">
        {/* Prompt summary */}
        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
          {payload.revisedPrompt || payload.prompt}
        </p>

        {/* Provider badge */}
        <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
          <span className="rounded bg-black/[0.03] dark:bg-white/5 px-1.5 py-0.5">
            {payload.providerId}/{payload.modelId}
          </span>
          {payload.width > 0 && payload.height > 0 && (
            <span>{payload.width}×{payload.height}</span>
          )}
        </div>

        {/* Actions */}
        <button
          type="button"
          onClick={handleInsertIntoDocument}
          disabled={inserted || !canInsert}
          title={canInsert ? "Insert at cursor position" : "Open a note to insert images"}
          className={cn(
            "flex items-center gap-1.5 w-full justify-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            inserted
              ? "bg-green-500/20 text-green-300 border border-green-500/20"
              : canInsert
                ? "bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-500/20 hover:bg-blue-500/25 dark:hover:bg-blue-500/30"
                : "bg-black/[0.03] dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-white/5 cursor-not-allowed"
          )}
        >
          {inserted ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Inserted
            </>
          ) : (
            <>
              <ImagePlus className="h-3.5 w-3.5" />
              Insert into document
            </>
          )}
        </button>

        {/* Add to… — inject into any content's note */}
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setInjectAnchor({ x: r.left, y: r.bottom });
          }}
          title="Add this image to a note, chat, or any content"
          className="flex items-center gap-1.5 w-full justify-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors bg-black/[0.03] dark:bg-white/5 text-gray-600 dark:text-gray-300 border border-black/10 dark:border-white/10 hover:bg-black/[0.06] dark:hover:bg-white/10"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          Add to…
        </button>
      </div>
      {injectAnchor && (
        <MediaInjectFlyout
          media={imageMedia}
          anchor={injectAnchor}
          onClose={() => setInjectAnchor(null)}
        />
      )}
    </div>
  );
}

/**
 * Inline player for an AI-generated speech clip (generate_speech tool).
 * Mirrors GeneratedImageCard: native playback + an "Insert into document"
 * action that drops an `audioEmbed` block at the editor cursor.
 */
function GeneratedAudioCard({ payload }: { payload: AudioPayload }) {
  const [inserted, setInserted] = useState(false);
  const selectedContentType = useContentStore((s) => s.selectedContentType);
  // Notes target the full-page editor; chats target their sidecar "Add notes"
  // TipTap doc (the ExpandableEditor), so both can receive the audio block.
  const canInsert =
    selectedContentType === "note" || selectedContentType === "chat";
  // "Add to…" flyout — inject this clip into ANY content's note.
  const [injectAnchor, setInjectAnchor] = useState<{ x: number; y: number } | null>(null);
  const [transcriptCopied, setTranscriptCopied] = useState(false);
  const audioMedia: InjectMedia = {
    kind: "audio",
    url: payload.url,
    contentId: payload.contentId,
    mimeType: payload.mimeType,
    filename: payload.fileName,
    durationSeconds: payload.durationSeconds ?? null,
  };

  const handleInsertIntoDocument = useCallback(() => {
    const dispatch = () =>
      window.dispatchEvent(
        new CustomEvent("insert-ai-audio", {
          detail: {
            src: payload.url,
            filename: payload.fileName,
            mimeType: payload.mimeType,
            durationSeconds: payload.durationSeconds ?? null,
            autoplayOnFlip: false,
          },
        })
      );

    // A chat's note editor (ExpandableEditor → MarkdownEditor) only mounts —
    // and only then registers its insert-ai-audio listener — when the notes
    // panel is expanded. Expand it first, then dispatch once the lazily-loaded
    // editor has had time to mount and subscribe. If already expanded (or a
    // plain note), dispatch immediately.
    if (selectedContentType === "chat") {
      const notesPanel = useNotesPanelStore.getState();
      if (!notesPanel.isExpanded) {
        notesPanel.setExpanded(true);
        setTimeout(dispatch, 400);
      } else {
        dispatch();
      }
    } else {
      dispatch();
    }
    setInserted(true);
    setTimeout(() => setInserted(false), 3000);
  }, [payload, selectedContentType]);

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5 overflow-hidden max-w-sm">
      <div className="px-3 py-2 space-y-2">
        {/* Spoken text summary + subtle copy-transcript affordance */}
        <div className="group flex items-start gap-2">
          <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-500 dark:text-teal-300" />
          <p className="flex-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
            {payload.text}
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(payload.text);
              setTranscriptCopied(true);
              setTimeout(() => setTranscriptCopied(false), 2000);
            }}
            title="Copy transcript"
            aria-label="Copy transcript"
            className="mt-0.5 shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition-opacity hover:text-gray-600 group-hover:opacity-100 dark:hover:text-gray-200"
          >
            {transcriptCopied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {/* Native audio player */}
        <audio controls src={payload.url} className="w-full" preload="metadata">
          <track kind="captions" />
        </audio>

        {/* Provider badge */}
        <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
          <span className="rounded bg-black/[0.03] dark:bg-white/5 px-1.5 py-0.5">
            {payload.providerId}/{payload.modelId}
          </span>
        </div>

        {/* Insert action */}
        <button
          type="button"
          onClick={handleInsertIntoDocument}
          disabled={inserted || !canInsert}
          title={canInsert ? "Insert into the document's notes" : "Open a note or chat to insert audio"}
          className={cn(
            "flex items-center gap-1.5 w-full justify-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            inserted
              ? "bg-green-500/20 text-green-300 border border-green-500/20"
              : canInsert
                ? "bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-500/20 hover:bg-blue-500/25 dark:hover:bg-blue-500/30"
                : "bg-black/[0.03] dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-white/5 cursor-not-allowed"
          )}
        >
          {inserted ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Inserted
            </>
          ) : (
            <>
              <Volume2 className="h-3.5 w-3.5" />
              Insert into document
            </>
          )}
        </button>

        {/* Add to… — inject into any content's note */}
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setInjectAnchor({ x: r.left, y: r.bottom });
          }}
          title="Add this audio to a note, chat, or any content"
          className="flex items-center gap-1.5 w-full justify-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors bg-black/[0.03] dark:bg-white/5 text-gray-600 dark:text-gray-300 border border-black/10 dark:border-white/10 hover:bg-black/[0.06] dark:hover:bg-white/10"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          Add to…
        </button>
      </div>
      {injectAnchor && (
        <MediaInjectFlyout
          media={audioMedia}
          anchor={injectAnchor}
          onClose={() => setInjectAnchor(null)}
        />
      )}
    </div>
  );
}

/**
 * Streaming indicator. Variant matches the active provider's preferred
 * pre-response animation:
 *   • cursor   — single pulsing block (ChatGPT-style)
 *   • smooth   — soft fading bar (Claude-style)
 *   • shimmer  — gradient sweep (Gemini-style)
 *   • dots     — classic three-dot pulse (generic fallback)
 */
function StreamingIndicator({
  indicator = "dots",
}: {
  indicator?: "cursor" | "smooth" | "shimmer" | "dots";
}) {
  if (indicator === "cursor") {
    return (
      <div className="inline-flex items-center px-1 py-2">
        <span className="inline-block h-4 w-[2px] bg-gray-200 animate-pulse" />
      </div>
    );
  }
  if (indicator === "smooth") {
    return (
      <div className="inline-flex items-center px-3.5 py-2.5">
        <span className="inline-block h-1 w-12 rounded-full bg-gray-400 animate-pulse" />
      </div>
    );
  }
  if (indicator === "shimmer") {
    return (
      <div className="inline-flex items-center rounded-xl border border-white/10 bg-black/[0.05] dark:bg-white/5 px-3.5 py-2.5 overflow-hidden">
        <span className="relative inline-block h-1 w-16 rounded-full bg-gradient-to-r from-blue-400/30 via-blue-200/60 to-purple-400/30 animate-pulse" />
      </div>
    );
  }
  // dots (default)
  return (
    <div className="inline-flex items-center gap-1.5 rounded-xl bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 px-3.5 py-2.5">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:300ms]" />
    </div>
  );
}

/** Thinking indicator — shown while tools are executing */
function ThinkingIndicator() {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-2 text-xs text-indigo-300">
      <BrainCircuit className="h-3.5 w-3.5 animate-pulse" />
      <span>Thinking</span>
      <span className="inline-flex gap-0.5">
        <span className="animate-bounce [animation-delay:0ms]">.</span>
        <span className="animate-bounce [animation-delay:150ms]">.</span>
        <span className="animate-bounce [animation-delay:300ms]">.</span>
      </span>
    </div>
  );
}
