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
import { Bot, User, Wrench, Loader2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { useContentStore } from "@/state/content-store";
import type { UIMessage } from "ai";
import type { Components } from "react-markdown";
import type { ExtraProps } from "react-markdown";

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

          if (part.type === "dynamic-tool") {
            return (
              <ToolCallBubble
                key={i}
                toolName={part.toolName}
                state={part.state}
                args={"input" in part ? part.input : undefined}
                result={"output" in part ? part.output : undefined}
              />
            );
          }

          return null;
        })}

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
      </div>
      {hasResult && result !== undefined && (
        <div className="mt-1.5 border-t border-white/5 pt-1.5 text-gray-500">
          {typeof result === "string"
            ? result.length > 200
              ? result.slice(0, 200) + "..."
              : result
            : JSON.stringify(result, null, 2).slice(0, 200)}
        </div>
      )}
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
