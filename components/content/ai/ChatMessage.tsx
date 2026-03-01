/**
 * ChatMessage Component
 *
 * Renders a single chat message (user, assistant, or tool invocation).
 * Uses AI SDK v6 parts-based message model for rich content rendering.
 */

"use client";

import { memo } from "react";
import { Bot, User, Wrench, Loader2 } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { useContentStore } from "@/state/content-store";
import type { UIMessage } from "ai";

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
              // Empty text part during streaming — show loading indicator
              if (isStreaming && isAssistant) {
                return <StreamingIndicator key={i} />;
              }
              return null;
            }
            return (
              <div
                key={i}
                className={cn(
                  "inline-block rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                  isUser
                    ? "bg-blue-600/30 text-blue-100 border border-blue-500/20"
                    : "bg-white/5 text-[#E5D4B0] border border-white/10"
                )}
              >
                <MessageText text={part.text} />
              </div>
            );
          }

          // Tool invocation parts (dynamic-tool for untyped tools)
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

/**
 * Simple markdown-lite text renderer.
 * Handles: **bold**, *italic*, `code`, ```code blocks```, and line breaks.
 * Full markdown library deferred to avoid bundle bloat — this covers 90% of LLM output.
 */
function MessageText({ text }: { text: string }) {
  // Split by code blocks first
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      segments.push(
        <InlineText key={lastIndex} text={text.slice(lastIndex, match.index)} />
      );
    }
    // Code block
    segments.push(
      <pre
        key={match.index}
        className="mt-2 overflow-x-auto rounded-lg bg-black/30 border border-white/10 p-3 text-xs font-mono text-gray-300"
      >
        {match[1] && (
          <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">
            {match[1]}
          </div>
        )}
        <code>{match[2]}</code>
      </pre>
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last code block
  if (lastIndex < text.length) {
    segments.push(<InlineText key={lastIndex} text={text.slice(lastIndex)} />);
  }

  return <>{segments}</>;
}

/** Renders inline text with bold, italic, and inline code */
function InlineText({ text }: { text: string }) {
  // Split into paragraphs by double newline
  const paragraphs = text.split(/\n\n+/);

  return (
    <>
      {paragraphs.map((para, pi) => (
        <span key={pi}>
          {pi > 0 && <br />}
          {para.split("\n").map((line, li) => (
            <span key={li}>
              {li > 0 && <br />}
              {formatInline(line)}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}

/** Apply bold, italic, inline code, and @mention formatting */
function formatInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match: @[Title](id), `code`, **bold**, *italic*
  const regex = /(@\[([^\]]+)\]\(([^)]+)\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIdx = 0;
  let m;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(text.slice(lastIdx, m.index));
    }
    const token = m[0];
    if (token.startsWith("@[")) {
      // Mention pill — @[Title](contentId)
      parts.push(
        <MentionPill key={m.index} title={m[2]} contentId={m[3]} />
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <code
          key={m.index}
          className="rounded bg-white/10 px-1 py-0.5 text-xs font-mono text-amber-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      parts.push(
        <strong key={m.index} className="font-semibold text-[#FFD700]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      parts.push(
        <em key={m.index} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIdx = m.index + m[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts;
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
