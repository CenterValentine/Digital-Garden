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

import { memo, useState, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { common, createLowlight } from "lowlight";
import { Bot, User, Wrench, Loader2, Copy, Check, Code2, ImagePlus, GripVertical, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { useContentStore } from "@/state/content-store";
import type { UIMessage } from "ai";
import type { Components } from "react-markdown";
import type { ExtraProps } from "react-markdown";

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
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming = false,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

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
      className={cn(
        "group flex gap-3 px-4 py-3",
        isUser && "flex-row-reverse"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-blue-500/20 text-blue-400"
            : "bg-white/10 text-gray-400"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Message content */}
      <div
        className={cn(
          "min-w-0 max-w-[85%] space-y-2",
          isUser && "text-right"
        )}
      >
        {/* Render message parts */}
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (!part.text) {
              if (isStreaming && isAssistant) {
                return <StreamingIndicator key={i} />;
              }
              return null;
            }

            // User messages: simple bubble, no markdown
            if (isUser) {
              return (
                <div
                  key={i}
                  className="inline-block rounded-xl px-3.5 py-2.5 text-sm leading-relaxed bg-blue-600/30 text-blue-100 border border-blue-500/20"
                >
                  {part.text}
                </div>
              );
            }

            // Assistant messages: full markdown rendering
            return (
              <div
                key={i}
                className="rounded-xl px-3.5 py-2.5 text-sm leading-relaxed bg-white/5 text-[#E5D4B0] border border-white/10"
              >
                <MarkdownContent text={part.text} />
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
          message.parts.length === 0 && <StreamingIndicator />}
      </div>
    </div>
  );
});

// ─── Markdown Renderer ───────────────────────────────────────

/** Pre-process @[Title](id) mentions into markdown-safe placeholders */
function preprocessMentions(text: string): string {
  return text.replace(
    /@\[([^\]]+)\]\(([^)]+)\)/g,
    (_, title, id) => `[@@${title}](mention:${id})`
  );
}

/** Full markdown renderer for assistant messages */
function MarkdownContent({ text }: { text: string }) {
  const processed = useMemo(() => preprocessMentions(text), [text]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {processed}
    </ReactMarkdown>
  );
}

/**
 * Custom react-markdown components for styling.
 * Maps markdown elements to styled React components.
 */
const markdownComponents: Components = {
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
    <ul className="mb-2 ml-4 list-disc space-y-0.5 marker:text-gray-500 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-0.5 marker:text-gray-500 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,

  // ── Blockquotes ──
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-gray-400 italic">
      {children}
    </blockquote>
  ),

  // ── Inline formatting ──
  strong: ({ children }) => (
    <strong className="font-semibold text-[#FFD700]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="text-gray-500 line-through">{children}</del>
  ),
  code: (props: React.JSX.IntrinsicElements["code"] & ExtraProps) => {
    const { children, className, node, ...rest } = props;
    const match = /language-(\w+)/.exec(className || "");

    // Fenced code block (wrapped in <pre> by react-markdown)
    if (match) {
      return (
        <CodeBlock language={match[1]}>
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
  pre: ({ children }) => <>{children}</>,

  // ── Tables ──
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-white/5 border-b border-white/10">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-white/5 last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left font-medium text-gray-300">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-1.5 text-gray-400">{children}</td>
  ),

  // ── Horizontal Rule ──
  hr: () => <hr className="my-3 border-white/10" />,

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
}: {
  language: string;
  children: string;
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
    <div className="group/code relative my-2 rounded-lg bg-black/40 border border-white/10 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/5">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
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
      </div>
      {/* Code content */}
      <pre className="overflow-x-auto p-3 text-xs font-mono leading-relaxed text-gray-300">
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

/** Tool call indicator bubble */
function ToolCallBubble({
  toolName,
  state,
  args,
  result,
}: {
  toolName: string;
  state: string;
  args: unknown;
  result?: unknown;
}) {
  const isRunning = state === "input-streaming" || state === "input-available";
  const hasResult = state === "output-available";
  const [showRaw, setShowRaw] = useState(false);
  const isDev = process.env.NODE_ENV === "development";

  // Summarize result for display (hide JSON payloads from edit tools)
  const displayResult = useMemo(() => {
    if (!hasResult || result === undefined) return null;
    const str = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    // If it's an edit payload JSON, show a short action summary instead
    if (str.startsWith("{") && str.includes('"__editPayload"')) {
      try {
        const parsed = JSON.parse(str);
        return parsed.action || "Edit applied";
      } catch {
        // fall through
      }
    }
    return str.length > 200 ? str.slice(0, 200) + "..." : str;
  }, [hasResult, result]);

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 text-gray-400">
        {isRunning ? (
          <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
        ) : (
          <Wrench className="h-3 w-3 text-green-400" />
        )}
        <span className="font-mono font-medium">
          {toolName}
        </span>
        {isRunning && (
          <span className="text-amber-400/70">running...</span>
        )}
        {/* Dev-only: toggle raw response */}
        {isDev && hasResult && (
          <button
            onClick={() => setShowRaw((v) => !v)}
            className={cn(
              "ml-auto p-0.5 rounded transition-colors",
              showRaw
                ? "text-amber-400 bg-amber-400/10"
                : "text-gray-600 hover:text-gray-400"
            )}
            title="Toggle raw response (dev only)"
          >
            <Code2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {hasResult && displayResult && !showRaw && (
        <div className="mt-1.5 border-t border-white/5 pt-1.5 text-gray-500">
          {displayResult}
        </div>
      )}
      {/* Dev-only: full raw response */}
      {isDev && showRaw && hasResult && result !== undefined && (
        <div className="mt-1.5 border-t border-white/5 pt-1.5">
          <pre className="overflow-x-auto text-[10px] font-mono text-gray-500 whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
            {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
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
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden max-w-sm">
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
        <p className="text-xs text-gray-400 line-clamp-2">
          {payload.revisedPrompt || payload.prompt}
        </p>

        {/* Provider badge */}
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span className="rounded bg-white/5 px-1.5 py-0.5">
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
                : "bg-white/5 text-gray-500 border border-white/5 cursor-not-allowed"
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

/** Pulsing dots animation for streaming state */
function StreamingIndicator() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5">
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
