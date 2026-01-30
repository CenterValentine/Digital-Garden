# M10: AI Chat Integration

**Status:** 📋 **PLANNED** (Not Started)
**Prerequisites:**
- ✅ M8 Phase 1 (Unified Settings System) - Complete
- ✅ Research Complete ([M8-AI-INTEGRATION-RESEARCH.md](./M8-AI-INTEGRATION-RESEARCH.md))

**Estimated Time:** 2-3 weeks
**Complexity:** High
**Priority:** High (User-facing feature, builds on M8 Phase 1)

---

## Overview

M10 integrates an AI assistant directly into the Notes IDE, accessible via the tool belt. This is the implementation phase following the comprehensive research completed in M8.

**What Users Get:**
- 🤖 AI chat panel in right sidebar
- 💬 Context-aware responses (AI understands current note)
- 📊 Multi-format document analysis (DOCX, XLSX, PDF)
- 🔒 Privacy controls (user chooses what AI sees)
- ⚡ Streaming responses with real-time feedback
- 💰 Usage tracking and monthly quotas

---

## Research Foundation

**Complete Technical Research:** [M8-AI-INTEGRATION-RESEARCH.md](./M8-AI-INTEGRATION-RESEARCH.md)

Key findings informing this implementation:
1. **Tech Stack:** Vercel AI SDK 6 + Anthropic Claude Sonnet 4.5
2. **UI Library:** Vercel AI Elements (shadcn/ui compatible)
3. **Document Processing:** xlsx for Excel, mammoth for DOCX (existing)
4. **Future-Proof DB:** Designed for multi-provider, MCP integration
5. **Capabilities:** 7+ AI features beyond summarization

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)

**Goal:** Get basic AI chat working with streaming responses

#### Database Schema

```prisma
model AIConversation {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  contentId   String?  @db.Uuid  // Optional: linked to note

  // Metadata
  title       String?  @db.VarChar(200)  // Auto-generated from first message
  description String?  @db.Text          // Optional summary
  tags        String[] @default([])       // Categorization

  // Provider info (future-proof)
  provider    String   @default("anthropic")  // "anthropic" | "openai" | "ollama"
  model       String   @db.VarChar(100)       // "claude-sonnet-4-5"
  modelVersion String? @db.VarChar(50)        // Snapshot for migration

  // Context snapshot
  contextSnapshot Json?  @db.JsonB  // What user could see at time
  privacyMode     String @default("balanced")  // "full" | "balanced" | "minimal" | "off"

  // State
  status      ConversationStatus @default(active)
  pinnedAt    DateTime?
  archivedAt  DateTime?

  // Timestamps
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)
  lastMessageAt DateTime? @db.Timestamptz(6)

  // Relations
  messages    AIMessage[]
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  content     ContentNode? @relation(fields: [contentId], references: [id], onDelete: SetNull)

  @@index([userId, lastMessageAt(sort: Desc)])
  @@index([contentId])
  @@index([status, archivedAt])
}

enum ConversationStatus {
  active
  archived
  deleted
}

model AIMessage {
  id             String   @id @default(uuid()) @db.Uuid
  conversationId String   @db.Uuid

  // Content
  role           MessageRole  // "user" | "assistant" | "system" | "tool"
  content        String       @db.Text

  // Provider-specific (flexible JSONB)
  providerData   Json?        @db.JsonB  // Tool calls, reasoning, etc.

  // Usage tracking
  tokensInput    Int?
  tokensOutput   Int?
  tokensCached   Int?
  cost           Decimal?     @db.Decimal(10, 6)

  // Performance
  latencyMs      Int?
  modelUsed      String?      @db.VarChar(100)

  // Error handling
  error          String?      @db.Text
  retryCount     Int          @default(0)

  // Timestamps
  createdAt      DateTime     @default(now()) @db.Timestamptz(6)
  editedAt       DateTime?    @db.Timestamptz(6)

  conversation   AIConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@index([role])
}

enum MessageRole {
  user
  assistant
  system
  tool
}

model AIUsageLog {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid

  // What happened
  action      AIAction  // "chat" | "summarize" | "search" | etc.
  provider    String    @db.VarChar(50)
  model       String    @db.VarChar(100)

  // Usage
  tokensInput Int
  tokensOutput Int
  tokensCached Int?
  cost        Decimal   @db.Decimal(10, 6)

  // Context
  conversationId String? @db.Uuid
  contentId      String? @db.Uuid

  timestamp   DateTime  @default(now()) @db.Timestamptz(6)

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, timestamp(sort: Desc)])
  @@index([timestamp(sort: Desc), provider])
  @@index([userId, action])
}

enum AIAction {
  chat
  summarize
  search
  suggest
  analyze
  extract
  rewrite
}

// Update User model
model User {
  // ... existing fields ...

  aiConversations  AIConversation[]
  aiUsageLogs      AIUsageLog[]
}
```

#### API Routes (Streaming)

**File:** `app/api/ai/chat/route.ts`

```typescript
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { requireAuth } from '@/lib/infrastructure/auth';
import { getUserSettings } from '@/lib/settings/utils';

export async function POST(request: Request) {
  const session = await requireAuth();
  const { messages, conversationId, context } = await request.json();

  // Get user's AI settings
  const settings = await getUserSettings(session.user.id);
  const aiSettings = settings.ai;

  // Check quota
  if (aiSettings.tokensUsedThisMonth >= aiSettings.monthlyTokenQuota) {
    return new Response(
      JSON.stringify({ error: 'Monthly quota exceeded' }),
      { status: 429 }
    );
  }

  // Stream response
  const result = streamText({
    model: anthropic(aiSettings.model),
    messages,
    system: context ? buildSystemPrompt(context, aiSettings.privacyMode) : undefined,
    onFinish: async ({ usage }) => {
      // Track usage
      await trackUsage(session.user.id, usage, conversationId);
    },
  });

  return result.toDataStreamResponse();
}
```

**File:** `app/api/ai/conversations/route.ts`

```typescript
// GET - List conversations
// POST - Create conversation
export async function GET(request: Request) {
  const session = await requireAuth();

  const conversations = await prisma.aIConversation.findMany({
    where: {
      userId: session.user.id,
      status: 'active',
      archivedAt: null,
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    include: {
      _count: { select: { messages: true } },
    },
  });

  return Response.json({ conversations });
}
```

**File:** `app/api/ai/conversations/[id]/route.ts`

```typescript
// GET - Get conversation with messages
// DELETE - Archive/delete conversation
```

#### Service Layer

**File:** `lib/ai/chat-service.ts`

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { streamText, generateObject } from 'ai';
import { z } from 'zod';

export class ChatService {
  async streamChat(params: {
    model: string;
    messages: any[];
    context?: string;
    privacyMode: string;
  }) {
    const systemPrompt = params.context
      ? buildSystemPrompt(params.context, params.privacyMode)
      : undefined;

    return streamText({
      model: anthropic(params.model),
      messages: params.messages,
      system: systemPrompt,
    });
  }

  async generateTitle(firstMessage: string): Promise<string> {
    const result = await generateObject({
      model: anthropic('claude-3-5-haiku-20241022'), // Cheap model for titles
      schema: z.object({
        title: z.string().max(200),
      }),
      prompt: `Generate a concise title (max 50 chars) for this conversation:\n\n${firstMessage}`,
    });

    return result.object.title;
  }
}

function buildSystemPrompt(context: string, privacyMode: string): string {
  switch (privacyMode) {
    case 'full':
      return `You are a helpful AI assistant. The user is currently viewing this note:\n\n${context}\n\nUse this context to provide relevant, helpful responses.`;

    case 'balanced':
      return `You are a helpful AI assistant. The user is working on a note about: ${extractTitle(context)}\n\nProvide helpful responses based on this topic.`;

    case 'minimal':
      return `You are a helpful AI assistant for a note-taking application.`;

    default:
      return `You are a helpful AI assistant.`;
  }
}
```

**File:** `lib/ai/context-builder.ts`

```typescript
export async function buildNoteContext(
  noteId: string,
  privacyMode: 'full' | 'balanced' | 'minimal' | 'off'
): Promise<string | null> {
  if (privacyMode === 'off') return null;

  const note = await prisma.contentNode.findUnique({
    where: { id: noteId },
    include: { notePayload: true },
  });

  if (!note || !note.notePayload) return null;

  switch (privacyMode) {
    case 'full':
      // Convert TipTap JSON to markdown
      return convertTipTapToMarkdown(note.notePayload.tiptapJson);

    case 'balanced':
      // Just title and excerpt
      return `Title: ${note.title}\n\nExcerpt: ${note.notePayload.searchText.slice(0, 500)}...`;

    case 'minimal':
      return `Title: ${note.title}`;

    default:
      return null;
  }
}
```

**File:** `lib/ai/token-counter.ts`

```typescript
import { encode } from 'gpt-tokenizer'; // Works for Claude too (approximate)

export function countTokens(text: string): number {
  return encode(text).length;
}

export async function trackUsage(
  userId: string,
  usage: { promptTokens: number; completionTokens: number },
  conversationId?: string
) {
  // Calculate cost (Claude Sonnet 4.5: $3 input, $15 output per 1M tokens)
  const inputCost = (usage.promptTokens / 1_000_000) * 3;
  const outputCost = (usage.completionTokens / 1_000_000) * 15;
  const totalCost = inputCost + outputCost;

  // Log usage
  await prisma.aIUsageLog.create({
    data: {
      userId,
      action: 'chat',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      tokensInput: usage.promptTokens,
      tokensOutput: usage.completionTokens,
      cost: totalCost,
      conversationId,
    },
  });

  // Update user's monthly usage
  const settings = await getUserSettings(userId);
  await updateUserSettings(userId, {
    ai: {
      ...settings.ai,
      tokensUsedThisMonth: settings.ai.tokensUsedThisMonth + usage.promptTokens + usage.completionTokens,
    },
  });
}
```

#### UI Components (Basic)

**File:** `components/ai/AIChatPanel.tsx`

```typescript
'use client';

import { useChat } from 'ai/react';
import { Send, StopCircle } from 'lucide-react';

export function AIChatPanel({ contentId }: { contentId?: string }) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, stop } = useChat({
    api: '/api/ai/chat',
    body: {
      contentId, // Send current note ID for context
    },
  });

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about this note..."
            className="flex-1 px-3 py-2 border rounded-lg"
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={stop}
              className="px-4 py-2 bg-red-500 text-white rounded-lg"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
```

**Phase 1 Deliverables:**
- ✅ Database schema (Conversation, Message, UsageLog)
- ✅ Streaming API route (POST /api/ai/chat)
- ✅ Chat service (Anthropic SDK integration)
- ✅ Token counter (usage tracking)
- ✅ Basic UI (chat panel with streaming)
- ✅ Settings integration (uses unified settings from M8)

---

### Phase 2: Document Analysis (Week 2)

**Goal:** AI can analyze DOCX/XLSX/PDF files

#### Excel Processing Integration

**File:** `lib/ai/document-processors/xlsx-processor.ts`

```typescript
import * as XLSX from 'xlsx';

export async function extractXlsxForAI(buffer: Buffer): Promise<string> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  let aiContext = `# Excel Spreadsheet Analysis\n\n`;
  aiContext += `Contains ${workbook.SheetNames.length} sheets.\n\n`;

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

    aiContext += `## Sheet: ${sheetName}\n\n`;

    if (data.length > 0) {
      // Headers
      const headers = data[0];
      aiContext += `| ${headers.join(' | ')} |\n`;
      aiContext += `|${headers.map(() => '---').join('|')}|\n`;

      // First 10 rows
      data.slice(1, 11).forEach(row => {
        aiContext += `| ${row.join(' | ')} |\n`;
      });

      if (data.length > 11) {
        aiContext += `\n... (${data.length - 11} more rows)\n\n`;
      }
    }
  });

  return aiContext;
}
```

#### Analysis Actions

**File:** `lib/ai/actions/analyze-document.ts`

```typescript
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

export async function analyzeSpreadsheet(xlsxContent: string) {
  const result = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    schema: z.object({
      summary: z.string(),
      keyInsights: z.array(z.string()),
      dataTypes: z.array(z.string()),
      recommendations: z.array(z.string()),
    }),
    prompt: `Analyze this spreadsheet data and provide insights:\n\n${xlsxContent}`,
  });

  return result.object;
}

export async function extractEntities(docxContent: string) {
  const result = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    schema: z.object({
      people: z.array(z.string()),
      organizations: z.array(z.string()),
      dates: z.array(z.string()),
      amounts: z.array(z.object({
        value: z.number(),
        currency: z.string(),
        context: z.string(),
      })),
      locations: z.array(z.string()),
    }),
    prompt: `Extract all named entities from this document:\n\n${docxContent}`,
  });

  return result.object;
}
```

**Phase 2 Deliverables:**
- ✅ Excel processing (xlsx library integration)
- ✅ DOCX processing (use existing mammoth)
- ✅ Document analysis actions (entities, insights, summaries)
- ✅ API endpoint: POST /api/ai/analyze/[contentId]
- ✅ UI: "Analyze Document" button in file viewer

---

### Phase 3: Polish & Production Features (Week 3)

**Goal:** Production-ready with full feature set

#### Conversation Management UI

**File:** `components/ai/ConversationList.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, Trash2, Pin } from 'lucide-react';

export function ConversationList() {
  const [conversations, setConversations] = useState([]);

  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    const res = await fetch('/api/ai/conversations');
    const data = await res.json();
    setConversations(data.conversations);
  }

  return (
    <div className="space-y-2">
      {conversations.map(conv => (
        <div
          key={conv.id}
          className="p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-medium">{conv.title || 'Untitled'}</h4>
              <p className="text-sm text-gray-500">
                {conv._count.messages} messages
              </p>
            </div>
            <div className="flex gap-2">
              {conv.pinnedAt && <Pin className="w-4 h-4 text-blue-500" />}
              <button
                onClick={() => deleteConversation(conv.id)}
                className="text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

#### Usage Tracking UI

**File:** `components/ai/UsageIndicator.tsx`

```typescript
'use client';

import { useSettingsStore } from '@/stores/settings-store';
import { Progress } from '@/components/ui/progress';

export function UsageIndicator() {
  const { ai } = useSettingsStore();

  const percentUsed = (ai.tokensUsedThisMonth / ai.monthlyTokenQuota) * 100;
  const costEstimate = (ai.tokensUsedThisMonth / 1_000_000) * 9; // Avg $9 per 1M tokens

  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Token Usage</span>
        <span className="text-xs text-gray-500">
          ${costEstimate.toFixed(2)} this month
        </span>
      </div>

      <Progress value={percentUsed} className="mb-2" />

      <div className="text-xs text-gray-500">
        {ai.tokensUsedThisMonth.toLocaleString()} / {ai.monthlyTokenQuota.toLocaleString()} tokens
        ({percentUsed.toFixed(1)}%)
      </div>

      {percentUsed > 80 && (
        <p className="text-xs text-orange-600 mt-2">
          ⚠️ Approaching monthly quota
        </p>
      )}
    </div>
  );
}
```

#### AI Settings UI

**File:** `app/(authenticated)/settings/ai/page.tsx`

```typescript
'use client';

import { useSettingsStore } from '@/stores/settings-store';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export default function AISettingsPage() {
  const { ai, setAISettings } = useSettingsStore();

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">AI Settings</h1>

      {/* Model Selection */}
      <div className="space-y-2">
        <Label>AI Model</Label>
        <Select
          value={ai.model}
          onValueChange={(model) => setAISettings({ model })}
        >
          <option value="claude-sonnet-4-5">Claude Sonnet 4.5 (Best)</option>
          <option value="claude-sonnet-3-5">Claude Sonnet 3.5 (Fast)</option>
          <option value="claude-haiku-3-5">Claude Haiku 3.5 (Cheap)</option>
          <option value="gpt-4-turbo">GPT-4 Turbo (Fallback)</option>
        </Select>
      </div>

      {/* Privacy Mode */}
      <div className="space-y-2">
        <Label>Privacy Mode</Label>
        <Select
          value={ai.privacyMode}
          onValueChange={(privacyMode) => setAISettings({ privacyMode })}
        >
          <option value="full">Full - AI sees entire note</option>
          <option value="balanced">Balanced - AI sees title + excerpt</option>
          <option value="minimal">Minimal - AI sees only title</option>
          <option value="off">Off - No context shared</option>
        </Select>
      </div>

      {/* Conversation History */}
      <div className="flex items-center justify-between">
        <div>
          <Label>Save Conversation History</Label>
          <p className="text-sm text-gray-500">
            Store AI conversations for future reference
          </p>
        </div>
        <Switch
          checked={ai.conversationHistory}
          onCheckedChange={(conversationHistory) => setAISettings({ conversationHistory })}
        />
      </div>

      {/* Auto-Suggest */}
      <div className="flex items-center justify-between">
        <div>
          <Label>Auto-Suggest</Label>
          <p className="text-sm text-gray-500">
            Show AI suggestions automatically while editing
          </p>
        </div>
        <Switch
          checked={ai.autoSuggest}
          onCheckedChange={(autoSuggest) => setAISettings({ autoSuggest })}
        />
      </div>

      {/* Monthly Quota */}
      <div className="space-y-2">
        <Label>Monthly Token Quota</Label>
        <input
          type="number"
          value={ai.monthlyTokenQuota}
          onChange={(e) => setAISettings({ monthlyTokenQuota: parseInt(e.target.value) })}
          className="w-full px-3 py-2 border rounded-lg"
        />
        <p className="text-xs text-gray-500">
          Default: 100,000 tokens (~$1.80/month)
        </p>
      </div>
    </div>
  );
}
```

**Phase 3 Deliverables:**
- ✅ Conversation history UI
- ✅ Usage tracking & quota enforcement
- ✅ AI settings page
- ✅ Rate limiting (10 messages/minute)
- ✅ Export conversations (JSON)
- ✅ Error handling & retry logic
- ✅ Debounced auto-save
- ✅ Toast notifications

---

## Dependencies

### NPM Packages

```bash
npm install ai @ai-sdk/anthropic @ai-sdk/openai xlsx gpt-tokenizer
```

**Package Sizes:**
- `ai` - 500KB (Vercel AI SDK)
- `@ai-sdk/anthropic` - 50KB (Anthropic provider)
- `xlsx` - 1.2MB (Excel processing)
- `gpt-tokenizer` - 800KB (Token counting)

### Environment Variables

```env
# AI Provider Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...  # Fallback

# Feature Flags
AI_ENABLED=true
AI_DEFAULT_MODEL=claude-sonnet-4-5
AI_DEFAULT_QUOTA=100000
```

---

## Integration with M8 Phase 1 (Settings)

M10 uses the unified settings system from M8 Phase 1:

```typescript
// Settings structure (already in place from M8)
{
  ai: {
    enabled: true,
    model: "claude-sonnet-4-5",
    conversationHistory: true,
    contextWindow: 4096,
    monthlyTokenQuota: 100000,
    tokensUsedThisMonth: 0,
    autoSuggest: true,
    privacyMode: "full"
  }
}
```

**No new settings infrastructure needed** - just use existing `setAISettings()` from unified store!

---

## Success Criteria

M10 is complete when:

- [ ] User can open AI chat panel from tool belt
- [ ] User can send messages and receive streaming responses
- [ ] AI has access to current note context (based on privacy mode)
- [ ] AI can analyze DOCX/XLSX files
- [ ] Conversations saved to database
- [ ] Token usage tracked and displayed
- [ ] Monthly quota enforced
- [ ] Settings UI exists for AI preferences
- [ ] User can view/delete conversation history
- [ ] Rate limiting prevents abuse
- [ ] Error handling works (network errors, quota exceeded, etc.)
- [ ] Documentation complete
- [ ] Tests passing

---

## Known Limitations

### Not Included in M10

**Deferred to Future Milestones:**
- ❌ RAG (vector search across all notes) - M11
- ❌ Model Context Protocol (MCP) server - M12
- ❌ Voice input/output - M13
- ❌ Multi-turn conversations with memory - M11
- ❌ AI-powered semantic search - M11
- ❌ Auto-tagging suggestions - M11
- ❌ Writing style analysis - M12
- ❌ OCR for scanned documents - M13
- ❌ Local model support (Ollama) - M12

**Why Deferred:**
- M10 focuses on core chat functionality
- RAG/vector search requires additional infrastructure (Pinecone/Qdrant)
- Advanced features can be added incrementally
- Get core UX right first

### Technical Debt to Address

**Security:**
- [ ] Add API key rotation mechanism
- [ ] Implement request signing
- [ ] Add abuse detection (flagged content)

**Performance:**
- [ ] Add streaming cancellation cleanup
- [ ] Implement conversation pagination
- [ ] Add Redis caching for hot paths

**UX:**
- [ ] Add debounced auto-suggest
- [ ] Implement message editing
- [ ] Add conversation branching

---

## Testing Strategy

### Unit Tests

```typescript
// lib/ai/token-counter.test.ts
describe('countTokens', () => {
  it('counts tokens accurately', () => {
    expect(countTokens('Hello world')).toBe(3);
  });
});

// lib/ai/context-builder.test.ts
describe('buildNoteContext', () => {
  it('respects privacy mode', async () => {
    const context = await buildNoteContext(noteId, 'minimal');
    expect(context).not.toContain(fullContent);
    expect(context).toContain('Title:');
  });
});
```

### Integration Tests

```bash
# Test streaming API
curl -N -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "contentId": "note-id"
  }'
```

### E2E Tests

```typescript
test('AI chat flow', async () => {
  // 1. Open AI panel
  await page.click('[data-testid="ai-chat-button"]');

  // 2. Send message
  await page.fill('[data-testid="chat-input"]', 'Summarize this note');
  await page.click('[data-testid="send-button"]');

  // 3. Wait for streaming response
  await page.waitForSelector('[data-testid="assistant-message"]');

  // 4. Verify response
  const response = await page.textContent('[data-testid="assistant-message"]');
  expect(response).toBeTruthy();
});
```

---

## Documentation Deliverables

**Created During M10:**
1. `M10-AI-CHAT-IMPLEMENTATION.md` - Implementation guide
2. `AI-API-REFERENCE.md` - Complete API documentation
3. `AI-PRIVACY-GUIDE.md` - Privacy controls explained
4. `AI-USAGE-TRACKING.md` - Cost management guide

**Updated:**
- `IMPLEMENTATION-STATUS.md` - Add M10 as complete
- `CLAUDE.md` - Add AI chat section
- `04-api-specification.md` - Document AI endpoints

---

## Cost Management

### Per-User Cost Estimates

**Monthly Active User (100K tokens):**
- Input: 50K tokens × $3/1M = $0.15
- Output: 50K tokens × $15/1M = $0.75
- **Total: ~$0.90/month**

**Heavy User (500K tokens):**
- Input: 250K tokens × $3/1M = $0.75
- Output: 250K tokens × $15/1M = $3.75
- **Total: ~$4.50/month**

**Power User (1M tokens):**
- Input: 500K tokens × $3/1M = $1.50
- Output: 500K tokens × $15/1M = $7.50
- **Total: ~$9.00/month**

### Cost Controls

1. **Monthly Quotas** (default: 100K tokens)
2. **Rate Limiting** (10 messages/minute)
3. **Model Tiering** (Haiku for cheap, Opus for quality)
4. **Admin Controls** (adjust quotas per user)
5. **Usage Alerts** (80% quota warning)

---

## Migration Path (Existing Users)

**No migration needed!** M10 is a new feature with no breaking changes.

**Optional:** Migrate existing chat-related notes to new system
```bash
node scripts/migrate-chat-notes.ts
```

---

## Rollout Strategy

**Week 1: Internal Testing**
- Deploy to staging
- Test with sample data
- Verify streaming works
- Check quota enforcement

**Week 2: Beta Users**
- Enable for 10 beta users
- Collect feedback
- Monitor costs
- Fix bugs

**Week 3: General Availability**
- Enable for all users
- Announce feature
- Publish documentation
- Monitor usage

---

## Future Enhancements (Post-M10)

### M11: RAG & Semantic Search
- Vector embeddings for all notes
- Semantic search ("find notes about X")
- Multi-document synthesis
- Smart context selection

### M12: MCP Integration
- Build Notes MCP server
- Let Claude Desktop access notes
- Let VS Code use notes as context
- Integrate with other MCP tools

### M13: Advanced Features
- Voice input/output
- Image understanding
- OCR for scanned docs
- Multi-modal attachments

### M14: Optimization
- Redis caching
- Response streaming optimization
- Conversation compression
- Smart context pruning

---

## Key Files Created

**Database:**
- `prisma/schema.prisma` (updated)
- `prisma/migrations/XXXXXX_add_ai_tables/` (new)

**API Routes:**
- `app/api/ai/chat/route.ts` (POST - streaming)
- `app/api/ai/conversations/route.ts` (GET, POST)
- `app/api/ai/conversations/[id]/route.ts` (GET, DELETE)
- `app/api/ai/analyze/[id]/route.ts` (POST)

**Services:**
- `lib/ai/chat-service.ts` (Anthropic integration)
- `lib/ai/context-builder.ts` (Note context extraction)
- `lib/ai/token-counter.ts` (Usage tracking)
- `lib/ai/document-processors/xlsx-processor.ts` (Excel)
- `lib/ai/actions/analyze-document.ts` (Analysis)

**UI Components:**
- `components/ai/AIChatPanel.tsx` (Main chat UI)
- `components/ai/ConversationList.tsx` (History)
- `components/ai/UsageIndicator.tsx` (Quota display)
- `components/ai/MessageBubble.tsx` (Individual messages)

**Settings:**
- `app/(authenticated)/settings/ai/page.tsx` (Settings UI)

**Total New Files:** ~15
**Total Modified Files:** ~5
**Lines of Code:** ~3,500

---

## Timeline

**Week 1 (Phase 1):**
- Days 1-2: Database schema + migration
- Days 3-4: API routes + streaming
- Day 5: Basic UI + testing

**Week 2 (Phase 2):**
- Days 1-2: Excel/DOCX processing
- Days 3-4: Analysis actions
- Day 5: Testing + bug fixes

**Week 3 (Phase 3):**
- Days 1-2: Conversation management UI
- Days 3-4: Settings UI + polish
- Day 5: Documentation + deployment

**Total: 15 working days (3 weeks)**

---

## References

**Research Documents:**
- [M8-AI-INTEGRATION-RESEARCH.md](./M8-AI-INTEGRATION-RESEARCH.md) - Complete technical research (10K+ words)
- [M8-PHASE-2-OVERVIEW.md](./M8-PHASE-2-OVERVIEW.md) - Phase 2 overview

**External Documentation:**
- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- [Anthropic API Reference](https://docs.anthropic.com/en/api)
- [xlsx Library Docs](https://docs.sheetjs.com/)

**Related Milestones:**
- M8 Phase 1: Unified Settings System (prerequisite)
- M11: RAG & Semantic Search (follow-up)
- M12: MCP Integration (follow-up)

---

**End of M10 Specification** 🚀
