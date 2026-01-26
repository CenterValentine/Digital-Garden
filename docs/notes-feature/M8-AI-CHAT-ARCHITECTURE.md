# M8 AI Chat Architecture Plan

**Date:** January 24, 2026
**Purpose:** Comprehensive architecture for AI chat integration (Phases 2 & 5)
**Dependencies:** Unified Settings System (Phase 3) must be completed first

---

## Overview

Integrate AI assistant into the Digital Garden Notes IDE via the tool belt system. AI provides context-aware help for all file types with persistent conversation history.

**Key Principles:**
1. **Context-Aware:** AI knows current file type, content, and metadata
2. **Non-Intrusive:** Accessible via tool belt, doesn't block main workflow
3. **Persistent:** Conversations saved per file and globally
4. **Cost-Conscious:** Token tracking, rate limiting, user quotas
5. **Privacy-First:** User controls what context AI sees

---

## System Architecture

### High-Level Flow

```
User clicks "Ask AI" in tool belt
  ↓
Opens AI chat panel (right sidebar)
  ↓
User types question
  ↓
System packages context: file type, content excerpt, metadata
  ↓
Sends to AI API (Anthropic Claude or OpenAI)
  ↓
AI responds with streaming text
  ↓
Response displayed in chat panel
  ↓
Conversation saved to database
  ↓
User can accept/reject/modify suggestions
```

### Component Layers

```
┌─────────────────────────────────────────────────┐
│             UI Layer (React Components)          │
│  • ToolBelt (AI action button)                  │
│  • AIChatPanel (right sidebar)                  │
│  • MessageList, ChatInput, Suggestions          │
└─────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────┐
│          State Management (Zustand)              │
│  • ai-chat-store.ts                             │
│  • conversation-store.ts                        │
│  • ai-settings-store.ts                         │
└─────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────┐
│             API Layer (Next.js Routes)           │
│  • /api/ai/chat (streaming)                     │
│  • /api/ai/conversations (CRUD)                 │
│  • /api/ai/suggestions (context-based)          │
└─────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────┐
│          AI Service Layer (lib/ai/)              │
│  • chat-service.ts (Anthropic/OpenAI SDK)       │
│  • context-builder.ts (file context extraction) │
│  • token-counter.ts (usage tracking)            │
│  • rate-limiter.ts (quota enforcement)          │
└─────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────┐
│        Database (PostgreSQL + Prisma)            │
│  • AIConversation model                         │
│  • AIMessage model                              │
│  • User.aiSettings (quota, preferences)         │
└─────────────────────────────────────────────────┘
```

---

## Database Schema

### AIConversation Model

```prisma
model AIConversation {
  id          String      @id @default(uuid()) @db.Uuid
  userId      String      @db.Uuid
  contentId   String?     @db.Uuid  // Optional: tied to specific note

  // Metadata
  title       String?     @db.VarChar(200)  // Auto-generated from first message
  context     Json?       @db.JsonB         // File context snapshot
  model       String      @db.VarChar(50)   // "claude-opus-4", "gpt-4", etc.
  totalTokens Int         @default(0)       // Running token count

  // Timestamps
  createdAt   DateTime    @default(now()) @db.Timestamptz()
  updatedAt   DateTime    @updatedAt @db.Timestamptz()

  // Relations
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  content     ContentNode? @relation(fields: [contentId], references: [id], onDelete: SetNull)
  messages    AIMessage[]

  @@index([userId, createdAt(sort: Desc)])
  @@index([contentId])
  @@index([userId, updatedAt(sort: Desc)])
}
```

**Context Field Structure:**
```typescript
interface ConversationContext {
  fileType: "markdown" | "json" | "code" | "image" | "pdf" | null;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  excerpt?: string;  // First 500 chars of content
  tags?: string[];
  category?: string;
  metadata?: Record<string, any>;
}
```

### AIMessage Model

```prisma
model AIMessage {
  id               String         @id @default(uuid()) @db.Uuid
  conversationId   String         @db.Uuid
  role             AIMessageRole  // user | assistant | system
  content          String         @db.Text

  // Metadata
  tokens           Int?           // Token count for this message
  model            String?        @db.VarChar(50)  // Model used for this response
  finishReason     String?        @db.VarChar(20)  // "stop", "length", "content_filter"

  // Timestamps
  createdAt        DateTime       @default(now()) @db.Timestamptz()

  // Relations
  conversation     AIConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}

enum AIMessageRole {
  user
  assistant
  system
}
```

### User Model Extension

```prisma
model User {
  // ... existing fields ...

  // AI Settings (nested in User.settings JSON)
  // settings.ai = {
  //   enabled: boolean
  //   model: "claude-opus-4" | "claude-sonnet-3-5" | "gpt-4"
  //   conversationHistory: boolean
  //   contextWindow: number (tokens)
  //   monthlyTokenQuota: number
  //   tokensUsedThisMonth: number
  //   autoSuggest: boolean
  //   privacyMode: "full" | "minimal" | "none"
  // }

  // Relations
  aiConversations AIConversation[]
}
```

---

## API Routes

### 1. Chat Endpoint (Streaming)

**`POST /api/ai/chat`**

**Request:**
```typescript
interface ChatRequest {
  conversationId?: string;  // Resume existing or create new
  message: string;
  context?: {
    contentId?: string;
    fileType?: string;
    content?: string;  // Current file content (limited)
  };
  stream?: boolean;  // Default true
}
```

**Response (Streaming):**
```typescript
// Server-Sent Events (SSE)
event: message
data: {"chunk": "Hello, "}

event: message
data: {"chunk": "I can help "}

event: done
data: {"conversationId": "uuid", "messageId": "uuid", "tokens": 150}
```

**Response (Non-Streaming):**
```typescript
interface ChatResponse {
  success: boolean;
  data: {
    conversationId: string;
    messageId: string;
    content: string;
    tokens: number;
    model: string;
  };
}
```

**Implementation:**
```typescript
// app/api/ai/chat/route.ts
export async function POST(request: Request) {
  const { message, conversationId, context, stream = true } = await request.json();

  // 1. Check rate limits and quotas
  const user = await getCurrentUser();
  await checkTokenQuota(user);

  // 2. Load or create conversation
  const conversation = conversationId
    ? await loadConversation(conversationId)
    : await createConversation(user.id, context);

  // 3. Build context from file and conversation history
  const messages = await buildMessageHistory(conversation);
  const systemPrompt = buildSystemPrompt(context);

  // 4. Stream response from AI
  if (stream) {
    return new Response(
      streamAIResponse({
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
          { role: "user", content: message },
        ],
        onToken: (token) => updateTokenUsage(user, token),
        onComplete: (response) => saveMessage(conversation, "assistant", response),
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      }
    );
  }

  // 5. Or return complete response
  const response = await getAIResponse({ messages, systemPrompt });
  await saveMessage(conversation, "user", message);
  await saveMessage(conversation, "assistant", response.content);

  return Response.json({
    success: true,
    data: {
      conversationId: conversation.id,
      messageId: response.messageId,
      content: response.content,
      tokens: response.tokens,
      model: response.model,
    },
  });
}
```

### 2. Conversations CRUD

**`GET /api/ai/conversations`**
- List user's conversations
- Pagination support
- Filter by contentId

**`GET /api/ai/conversations/[id]`**
- Get specific conversation with messages
- Include token count and metadata

**`POST /api/ai/conversations`**
- Create new conversation
- Optional: attach to contentId

**`DELETE /api/ai/conversations/[id]`**
- Soft delete conversation
- Cascade delete messages

**`PATCH /api/ai/conversations/[id]`**
- Update title
- Update context

### 3. AI Suggestions

**`POST /api/ai/suggestions`**

**Request:**
```typescript
interface SuggestionRequest {
  contentId: string;
  fileType: string;
  content?: string;  // Optional: current content
  action?: "summarize" | "improve" | "tags" | "related";
}
```

**Response:**
```typescript
interface SuggestionResponse {
  suggestions: Array<{
    id: string;
    type: "text" | "action" | "tag" | "link";
    title: string;
    description: string;
    content?: string;
    confidence: number;  // 0-1
  }>;
  tokens: number;
}
```

### 4. AI Settings

**`GET /api/ai/settings`**
- Get user's AI preferences
- Token quota and usage

**`PATCH /api/ai/settings`**
- Update AI model selection
- Update privacy preferences
- Update auto-suggest settings

---

## Service Layer (lib/ai/)

### 1. Chat Service

**`lib/ai/chat-service.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export class ChatService {
  private anthropic: Anthropic;
  private openai: OpenAI;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async sendMessage(params: {
    messages: Message[];
    model: string;
    stream?: boolean;
    onToken?: (token: number) => void;
  }): Promise<AIResponse> {
    if (params.model.startsWith("claude")) {
      return this.sendAnthropicMessage(params);
    } else if (params.model.startsWith("gpt")) {
      return this.sendOpenAIMessage(params);
    }
    throw new Error(`Unsupported model: ${params.model}`);
  }

  private async sendAnthropicMessage(params): Promise<AIResponse> {
    const stream = await this.anthropic.messages.create({
      model: params.model,
      max_tokens: 4096,
      messages: params.messages,
      stream: params.stream ?? false,
    });

    if (params.stream) {
      return this.handleAnthropicStream(stream, params.onToken);
    }

    return {
      content: stream.content[0].text,
      tokens: stream.usage.output_tokens,
      model: params.model,
      finishReason: stream.stop_reason,
    };
  }

  private async sendOpenAIMessage(params): Promise<AIResponse> {
    // Similar implementation for OpenAI
  }
}
```

### 2. Context Builder

**`lib/ai/context-builder.ts`**

```typescript
export async function buildFileContext(
  contentId: string
): Promise<FileContext> {
  const content = await prisma.contentNode.findUnique({
    where: { id: contentId },
    include: {
      note: true,
      file: true,
      tags: { include: { tag: true } },
    },
  });

  if (!content) return null;

  const context: FileContext = {
    fileType: content.contentType,
    fileName: content.title,
    tags: content.tags.map((t) => t.tag.name),
    category: content.category?.name,
  };

  // Add content excerpt (privacy-aware)
  if (content.note) {
    context.excerpt = extractExcerpt(content.note.tiptapJson, 500);
  } else if (content.file) {
    context.mimeType = content.file.mimeType;
    context.fileSize = content.file.size;
  }

  return context;
}

export function buildSystemPrompt(context?: FileContext): string {
  let prompt = `You are an AI assistant integrated into a Digital Garden note-taking application. `;

  if (context?.fileType === "markdown") {
    prompt += `The user is currently viewing a markdown note titled "${context.fileName}". `;
    if (context.excerpt) {
      prompt += `Here's an excerpt of the content:\n\n${context.excerpt}\n\n`;
    }
    if (context.tags?.length) {
      prompt += `This note is tagged with: ${context.tags.join(", ")}. `;
    }
    prompt += `Provide helpful suggestions for improving, organizing, or understanding this note.`;
  } else if (context?.fileType === "json") {
    prompt += `The user is editing a JSON file. Help them with formatting, validation, and transformation tasks.`;
  }
  // ... more file type prompts

  return prompt;
}
```

### 3. Token Counter

**`lib/ai/token-counter.ts`**

```typescript
import { encoding_for_model } from "tiktoken";

export function countTokens(text: string, model: string): number {
  const encoding = encoding_for_model(model as any);
  const tokens = encoding.encode(text);
  encoding.free();
  return tokens.length;
}

export async function checkTokenQuota(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const aiSettings = user.settings?.ai || {};

  const monthlyQuota = aiSettings.monthlyTokenQuota || 100000; // 100k default
  const tokensUsed = aiSettings.tokensUsedThisMonth || 0;

  if (tokensUsed >= monthlyQuota) {
    throw new Error("Monthly token quota exceeded");
  }
}

export async function updateTokenUsage(
  userId: string,
  tokens: number
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "User"
    SET settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{ai,tokensUsedThisMonth}',
      (COALESCE(settings->'ai'->>'tokensUsedThisMonth', '0')::int + ${tokens})::text::jsonb
    )
    WHERE id = ${userId}
  `;
}
```

### 4. Rate Limiter

**`lib/ai/rate-limiter.ts`**

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const aiRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"), // 10 requests per minute
  analytics: true,
});

export async function checkRateLimit(userId: string): Promise<void> {
  const { success, reset } = await aiRateLimiter.limit(`ai_chat_${userId}`);

  if (!success) {
    const resetDate = new Date(reset);
    throw new Error(
      `Rate limit exceeded. Try again at ${resetDate.toLocaleTimeString()}`
    );
  }
}
```

---

## State Management (Zustand)

### 1. AI Chat Store

**`stores/ai-chat-store.ts`**

```typescript
interface AIChatStore {
  // Current conversation
  activeConversationId: string | null;
  messages: AIMessage[];
  isStreaming: boolean;
  streamingContent: string;

  // UI state
  isChatPanelOpen: boolean;
  isLoading: boolean;
  error: string | null;

  // Context
  currentFileContext: FileContext | null;

  // Actions
  openChatPanel: () => void;
  closeChatPanel: () => void;
  setFileContext: (context: FileContext | null) => void;

  startConversation: (fileContext?: FileContext) => Promise<string>;
  sendMessage: (content: string) => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  clearConversation: () => void;

  // Streaming
  appendStreamingChunk: (chunk: string) => void;
  finalizeStream: () => void;
}

export const useAIChatStore = create<AIChatStore>()((set, get) => ({
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  streamingContent: "",
  isChatPanelOpen: false,
  isLoading: false,
  error: null,
  currentFileContext: null,

  openChatPanel: () => set({ isChatPanelOpen: true }),
  closeChatPanel: () => set({ isChatPanelOpen: false }),
  setFileContext: (context) => set({ currentFileContext: context }),

  startConversation: async (fileContext) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: fileContext }),
      });
      const data = await response.json();
      set({ activeConversationId: data.data.id, messages: [] });
      return data.data.id;
    } catch (err) {
      set({ error: err.message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  sendMessage: async (content) => {
    const { activeConversationId, currentFileContext } = get();

    // Add user message optimistically
    const userMessage: AIMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date(),
    };
    set({ messages: [...get().messages, userMessage], isStreaming: true });

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          message: content,
          context: currentFileContext,
          stream: true,
        }),
      });

      // Handle SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (data.chunk) {
              get().appendStreamingChunk(data.chunk);
            } else if (data.conversationId) {
              // Stream complete
              get().finalizeStream();
              set({
                activeConversationId: data.conversationId,
                isStreaming: false,
              });
            }
          }
        }
      }
    } catch (err) {
      set({ error: err.message, isStreaming: false });
    }
  },

  loadConversation: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`/api/ai/conversations/${id}`);
      const data = await response.json();
      set({
        activeConversationId: id,
        messages: data.data.messages,
        currentFileContext: data.data.context,
      });
    } catch (err) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  clearConversation: () => {
    set({
      activeConversationId: null,
      messages: [],
      streamingContent: "",
      currentFileContext: null,
    });
  },

  appendStreamingChunk: (chunk) => {
    set({ streamingContent: get().streamingContent + chunk });
  },

  finalizeStream: () => {
    const { streamingContent, messages } = get();
    const assistantMessage: AIMessage = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: streamingContent,
      createdAt: new Date(),
    };
    set({
      messages: [...messages, assistantMessage],
      streamingContent: "",
    });
  },
}));
```

---

## UI Components

### 1. AIChatPanel

**`components/content/chat/AIChatPanel.tsx`**

```typescript
"use client";

import { useEffect } from "react";
import { useAIChatStore } from "@/stores/ai-chat-store";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ConversationHistory } from "./ConversationHistory";
import { AISuggestions } from "./AISuggestions";

export function AIChatPanel() {
  const {
    messages,
    isStreaming,
    streamingContent,
    activeConversationId,
    sendMessage,
    startConversation,
  } = useAIChatStore();

  // Start conversation if none active
  useEffect(() => {
    if (!activeConversationId) {
      startConversation();
    }
  }, [activeConversationId]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <h2 className="text-lg font-semibold">AI Assistant</h2>
      </div>

      {/* Suggestions */}
      <AISuggestions />

      {/* Messages */}
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
```

### 2. MessageList

**`components/content/chat/MessageList.tsx`**

```typescript
export function MessageList({
  messages,
  streamingContent,
  isStreaming,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <AIMessage key={message.id} message={message} />
      ))}

      {isStreaming && streamingContent && (
        <AIMessage
          message={{
            id: "streaming",
            role: "assistant",
            content: streamingContent,
            createdAt: new Date(),
          }}
          isStreaming
        />
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
```

### 3. AI Message Bubble

**`components/content/chat/AIMessage.tsx`**

```typescript
export function AIMessage({ message, isStreaming }: AIMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`
          max-w-[80%] rounded-lg p-3
          ${isUser ? "bg-blue-500/20" : "bg-white/10"}
        `}
      >
        {/* Avatar */}
        <div className="flex items-start gap-2">
          {!isUser && <SparklesIcon className="h-4 w-4 text-blue-400" />}
          <div className="flex-1">
            {/* Content */}
            <div className="prose prose-invert prose-sm">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>

            {/* Streaming indicator */}
            {isStreaming && (
              <div className="mt-2 text-xs text-gray-400">
                <LoadingDots />
              </div>
            )}

            {/* Timestamp */}
            <div className="mt-2 text-xs text-gray-500">
              {format(message.createdAt, "HH:mm")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 4. Chat Input

**`components/content/chat/ChatInput.tsx`**

```typescript
export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 border-t border-white/10">
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI anything..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg p-2 resize-none"
          rows={2}
          disabled={disabled}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg disabled:opacity-50"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

---

## Tool Belt Integration

### Markdown Provider with AI

**`components/content/tool-belt/providers/markdown-ai-provider.tsx`**

```typescript
export function getMarkdownToolBeltConfig(
  fileContext: FileContext,
  markdownContext: MarkdownToolBeltContext
): ToolBeltConfig {
  return {
    position: "top",
    style: "expanded",
    groups: [
      // ... existing markdown actions (Bold, Italic, Link, etc.) ...

      {
        id: "ai-actions",
        label: "AI",
        separator: true,
        actions: [
          {
            id: "ai-chat",
            label: "Ask AI",
            icon: <Sparkles className="h-4 w-4" />,
            onClick: () => {
              const { openChatPanel, setFileContext } = useAIChatStore.getState();
              setFileContext(fileContext);
              openChatPanel();
            },
            variant: "primary",
            tooltip: "Open AI assistant (⌘⇧A)",
            shortcut: "⌘⇧A",
          },
          {
            id: "ai-summarize",
            label: "Summarize",
            onClick: () => markdownContext.onAISummarize(),
            tooltip: "AI summarize this note",
          },
          {
            id: "ai-improve",
            label: "Improve",
            onClick: () => markdownContext.onAIImprove(),
            tooltip: "AI writing improvements",
          },
        ],
      },
    ],
  };
}
```

---

## Privacy & Security

### Context Privacy Levels

**Full Context:**
- Sends entire file content
- All tags and metadata
- Conversation history

**Minimal Context:**
- File type only
- No content
- Limited metadata

**None:**
- AI disabled
- No data sent

### Implementation

```typescript
// lib/ai/context-builder.ts
export function buildPrivacyAwareContext(
  content: ContentNode,
  privacyMode: "full" | "minimal" | "none"
): FileContext | null {
  if (privacyMode === "none") return null;

  const context: FileContext = {
    fileType: content.contentType,
    fileName: content.title,
  };

  if (privacyMode === "full") {
    context.excerpt = extractExcerpt(content.note?.tiptapJson, 500);
    context.tags = content.tags.map((t) => t.tag.name);
    context.metadata = content.metadata;
  }

  return context;
}
```

---

## Cost Management

### Token Quotas by Tier

```typescript
const TOKEN_QUOTAS = {
  free: 100_000,        // 100k tokens/month
  basic: 1_000_000,     // 1M tokens/month
  pro: 10_000_000,      // 10M tokens/month
  enterprise: Infinity, // Unlimited
};
```

### Usage Tracking UI

**`components/settings/ai/UsageCard.tsx`**

```typescript
export function UsageCard() {
  const { tokensUsedThisMonth, monthlyQuota } = useAISettings();
  const percentage = (tokensUsedThisMonth / monthlyQuota) * 100;

  return (
    <Card>
      <h3>Token Usage</h3>
      <ProgressBar value={percentage} />
      <p>
        {tokensUsedThisMonth.toLocaleString()} / {monthlyQuota.toLocaleString()}
      </p>
      <p className="text-xs text-gray-400">Resets on {getResetDate()}</p>
    </Card>
  );
}
```

---

## Testing Strategy

### Unit Tests

- Token counting accuracy
- Context building logic
- Rate limiting behavior
- Privacy mode filtering

### Integration Tests

- Full chat flow (send → stream → save)
- Conversation persistence
- Multi-turn conversations
- Error handling and retry logic

### E2E Tests

- User opens AI chat from tool belt
- Types message and receives response
- Switches between conversations
- Exceeds rate limit (graceful error)

---

## Performance Optimization

### Streaming Response

Use Server-Sent Events (SSE) for real-time streaming:
- Immediate feedback (no waiting for full response)
- Lower perceived latency
- Cancellable mid-stream

### Conversation Caching

Cache recent conversations in memory:
- Reduce database queries
- Faster conversation switching
- Invalidate on new message

### Context Compression

Compress old messages in long conversations:
- Keep only essential information
- Reduce token usage
- Maintain conversation coherence

---

## Deployment Checklist

**Before Launch:**
- [ ] Set up Anthropic API key in environment
- [ ] Configure rate limits in Upstash
- [ ] Set default token quotas per tier
- [ ] Test streaming responses
- [ ] Add error logging and monitoring
- [ ] Create AI settings page
- [ ] Document user-facing features
- [ ] Add usage analytics

**Post-Launch Monitoring:**
- Token usage per user
- Average conversation length
- Response latency (p50, p95, p99)
- Error rates
- User feedback

---

## Success Criteria

**Phase 2 (AI Chat) Complete When:**
- ✅ AI chat accessible from all file type tool belts
- ✅ Conversations persist to database
- ✅ Streaming responses work smoothly
- ✅ Context-aware suggestions accurate
- ✅ Privacy controls implemented
- ✅ Token usage tracked and displayed

**Phase 5 (Conversation History) Complete When:**
- ✅ Users can view past conversations
- ✅ Search through conversation history
- ✅ Resume previous conversations
- ✅ Export conversations
- ✅ Delete unwanted conversations
- ✅ Token usage visible in settings

---

## Future Enhancements (M9+)

1. **Multi-Model Support** - Switch between Claude, GPT-4, Gemini
2. **Custom Instructions** - User-defined system prompts
3. **Code Execution** - AI can run code snippets
4. **Image Understanding** - Vision models for images
5. **Voice Input** - Speech-to-text for chat
6. **Collaborative AI** - Multiple users in same conversation

---

**Next:** See [M8-UNIFIED-SETTINGS-IMPLEMENTATION.md](./M8-UNIFIED-SETTINGS-IMPLEMENTATION.md) for Phase 3 details.
