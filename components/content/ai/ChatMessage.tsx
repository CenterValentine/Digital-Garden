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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { common, createLowlight } from "lowlight";
import { Bot, User, Wrench, Loader2, Copy, Check, ImagePlus, GripVertical, BrainCircuit, ChevronRight, Pencil, RotateCcw, GitBranch, FileText } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { useContentStore } from "@/state/content-store";
import { useSettingsStore } from "@/state/settings-store";
import { useTypewriter } from "@/lib/domain/ai/use-typewriter";
import type { UIMessage } from "ai";
import type { Components } from "react-markdown";
import type { ExtraProps } from "react-markdown";
import {
  getProviderTheme,
  type ProviderTheme,
} from "@/lib/design/system/ai-providers";
import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";
import { ReasoningRouter } from "./reasoning/ReasoningRouter";

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
  };
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

// Shared lowlight instance — same config as TipTap editor
const lowlight = createLowlight(common);

interface ChatMessageProps {
  message: UIMessage;
  isStreaming?: boolean;
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
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming = false,
  providerId,
  modelId,
  onEdit,
  onRegenerate,
  onBranch,
  actionsDisabled = false,
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

  // Pre-scan: extract image payloads from ALL tool parts at message level.
  // This is more reliable than detecting inside the parts loop because it
  // handles streaming state transitions and part type variations.
  const { imagePayloads, hasRunningTools } = useMemo(() => {
    const payloads: ImagePayload[] = [];
    let running = false;
    const seenIds = new Set<string>();

    for (const part of message.parts) {
      const tp = detectToolPart(part);
      if (!tp) continue;

      if (tp.state === "input-streaming" || tp.state === "input-available") {
        running = true;
      }

      if (tp.state === "output-available" && tp.output !== undefined) {
        const payload = parseImagePayload(tp.output);
        if (payload && !seenIds.has(payload.contentId)) {
          seenIds.add(payload.contentId);
          payloads.push(payload);
        }
      }
    }

    return { imagePayloads: payloads, hasRunningTools: running };
  }, [message.parts]);

  return (
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
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
          <User className="h-4 w-4" />
        </div>
      ) : (
        <AssistantAvatar providerId={providerId} modelId={modelId} />
      )}

      {/* Message content */}
      <div
        className={cn(
          "min-w-0 space-y-2",
          theme.bubble.columnClassName,
          isUser && "text-right",
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
              className="w-full max-w-full resize-y rounded-xl border border-blue-500/20 bg-blue-600/30 px-3.5 py-2.5 text-sm leading-relaxed text-blue-100 outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/30 align-top"
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                onClick={() => setEditing(false)}
                className="rounded-md px-2 py-1 text-[11px] text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={commitEdit}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 transition-colors"
                title="Save & re-run (⌘/Ctrl+Enter)"
              >
                Save &amp; submit
              </button>
            </div>
          </div>
        ) : (
        <>
        {/* Render message parts */}
        {message.parts.map((part, i) => {
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
              return (
                // eslint-disable-next-line @next/next/no-img-element -- user-attached image, arbitrary host
                <img
                  key={i}
                  src={filePart.url}
                  alt={filePart.filename ?? "attachment"}
                  onClick={openContent}
                  title={openContent ? "Open attachment" : undefined}
                  className={cn(
                    "max-h-64 max-w-full rounded-lg border border-black/10 dark:border-white/10 inline-block",
                    openContent && "cursor-pointer hover:opacity-90 transition-opacity",
                  )}
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
                  className="inline-block rounded-xl px-3.5 py-2.5 text-sm leading-relaxed bg-blue-600/30 text-blue-100 border border-blue-500/20"
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
                />
              </div>
            );
          }

          // Tool parts: detect via detectToolPart helper (handles both static and dynamic)
          // Image generation tool results render as GeneratedImageCard at message level below.
          const toolPart = detectToolPart(part);
          if (toolPart) {
            // Skip image tool results — they render at message level
            if (toolPart.state === "output-available") {
              const isImageResult = parseImagePayload(toolPart.output) !== null;
              if (isImageResult) return null;
            }

            return (
              <ToolCallBubble
                key={i}
                toolName={toolPart.toolName}
                state={toolPart.state}
                args={toolPart.input}
                result={toolPart.output}
              />
            );
          }

          return null;
        })}

        {/* Image cards — rendered at message level for reliability */}
        {imagePayloads.map((payload) => (
          <GeneratedImageCard key={payload.contentId} payload={payload} />
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
              "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity text-gray-500",
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
  );
});

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
      className="inline-flex items-center justify-center rounded-md p-1 hover:text-gray-200 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
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
}: {
  text: string;
  theme: ProviderTheme;
  active: boolean;
}) {
  const revealed = useTypewriter(text, active);
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
        className="rounded bg-white/10 px-1 py-0.5 text-xs font-mono text-amber-300"
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
    <h1 className="text-xl font-bold mt-4 mb-2 text-white/90 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold mt-3.5 mb-2 text-white/90 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold mt-3 mb-1.5 text-white/85 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold mt-2.5 mb-1 text-white/80 first:mt-0">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="text-sm font-medium mt-2 mb-1 text-white/75 first:mt-0">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-xs font-medium mt-2 mb-1 text-white/70 uppercase tracking-wide first:mt-0">
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
        className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
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
    <strong className="font-semibold text-[#FFD700]">{children}</strong>
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
    <tr className="border-b border-white/5 last:border-0">{children}</tr>
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
            className="flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-300 transition-colors"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-green-400" />
                <span className="text-green-400">Copied</span>
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
 * Assistant avatar with provider/model tooltip.
 *
 * Tooltip shows after a 1-second deliberate hover — short hovers from
 * cursor passes don't trigger it. Background tints to the producing
 * provider's brand color so the avatar itself is an at-a-glance
 * provider indicator.
 */
function AssistantAvatar({
  providerId,
  modelId,
}: {
  providerId?: string | null;
  modelId?: string | null;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = getProviderTheme(providerId);
  const provider = PROVIDER_CATALOG.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);
  const providerName = provider?.name ?? "AI assistant";
  const modelName = model?.name ?? modelId ?? null;

  const handleEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowTooltip(true), 1000);
  }, []);

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowTooltip(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      className="relative shrink-0"
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
      {showTooltip && (
        <div
          role="tooltip"
          className="absolute left-full top-1/2 ml-2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#1a1a1a] px-2.5 py-1.5 text-[10px] text-gray-200 shadow-xl"
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
        </div>
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
      className="inline-flex items-center gap-0.5 rounded bg-blue-500/20 text-blue-300 px-1.5 py-0.5 text-xs font-medium hover:bg-blue-500/30 transition-colors cursor-pointer"
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
function ToolCallBubble({
  toolName,
  state,
  args: _args,
  result,
}: {
  toolName: string;
  state: string;
  args: unknown;
  result?: unknown;
}) {
  const isRunning = state === "input-streaming" || state === "input-available";
  const hasResult = state === "output-available";
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Canonical string form of the result for display + clipboard.
  const resultString = useMemo(() => {
    if (!hasResult || result === undefined) return null;
    return typeof result === "string"
      ? result
      : JSON.stringify(result, null, 2);
  }, [hasResult, result]);

  // One-line summary used in the collapsed header. Tells the user what
  // came back without forcing them to expand — char counts for text,
  // item counts for arrays, "edit applied" for orchestrator payloads.
  const summary = useMemo<string | null>(() => {
    if (isRunning) return "running…";
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
  }, [isRunning, hasResult, result]);

  // Human action phrase — describes what the tool is *doing* (present
  // tense while running, past tense when done) rather than echoing the
  // raw tool identifier.
  const prettyName = useMemo(
    () => toolActionLabel(toolName, isRunning),
    [toolName, isRunning],
  );

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
        onClick={() => hasResult && setExpanded((v) => !v)}
        disabled={!hasResult}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left",
          hasResult && "hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors cursor-pointer",
          !hasResult && "cursor-default",
        )}
        title={hasResult ? (expanded ? "Hide details" : "Show details") : undefined}
      >
        {isRunning ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-400" />
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
                : "bg-black/[0.04] dark:bg-white/[0.06] text-gray-500 dark:text-gray-400",
            )}
          >
            {summary}
          </span>
        )}
        {hasResult && (
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 text-gray-500 transition-transform",
              expanded && "rotate-90",
              !summary && "ml-auto",
            )}
          />
        )}
      </button>
      {hasResult && expanded && resultString && (
        <div className="border-t border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-black/20">
          <div className="flex items-center justify-between px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-500">
            <span>Result</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/5 transition-colors"
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
function GeneratedImageCard({ payload }: { payload: ImagePayload }) {
  const [inserted, setInserted] = useState(false);
  const selectedContentType = useContentStore((s) => s.selectedContentType);
  const canInsert = selectedContentType === "note";

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
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/20 hover:bg-blue-500/30"
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
      </div>
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
