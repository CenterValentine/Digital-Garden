# M8 Phase 2 - AI Chat Integration (Overview)

**Status:** 📋 **PLANNED** (Not Started)
**Prerequisites:** M8 Phase 1 (Unified Settings) ✅ Complete
**Estimated Time:** 1-2 weeks
**Complexity:** High

**📘 Research Complete:** See [M8-AI-INTEGRATION-RESEARCH.md](./M8-AI-INTEGRATION-RESEARCH.md) for:
- Modern AI extensibility libraries (Vercel AI SDK, LangChain, Assistant UI)
- Multi-provider support (Claude, OpenAI, local models)
- Document processing (DOCX, XLSX with code examples)
- Future-proof database architecture
- Model Context Protocol (MCP) integration strategy
- AI capabilities beyond summarization
- UI/UX best practices & component libraries

---

## What is Phase 2?

Phase 2 integrates an AI assistant directly into the Notes IDE, accessible via the tool belt. Users can ask questions about their notes, get writing suggestions, and have context-aware conversations with AI that understands the current file.

**Key Features:**
- 🤖 AI chat panel in right sidebar
- 💬 Persistent conversation history per note
- 🧠 Context-aware responses (AI knows current file content)
- 📊 Token usage tracking and quotas
- 🔒 Privacy controls (user chooses what AI sees)
- ⚡ Streaming responses for real-time feedback

---

## Why Phase 2 Depends on Phase 1

Phase 2 uses the unified settings system from Phase 1 for:

**AI Settings (from `settings.ai.*`):**
```typescript
{
  enabled: true,                        // Turn AI on/off globally
  model: "claude-sonnet-3-5",          // Which model to use
  conversationHistory: true,            // Save conversations
  contextWindow: 4096,                  // How much text to send
  monthlyTokenQuota: 100000,           // Usage limit
  tokensUsedThisMonth: 0,              // Current usage
  autoSuggest: true,                    // Show suggestions automatically
  privacyMode: "full"                   // What AI can access
}
```

Without Phase 1, we'd have to manage AI settings separately, creating fragmentation.

---

## Architecture Overview

### 1. Database Layer

**New Models:**
```prisma
model AIConversation {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  contentId   String?  @db.Uuid  // Optional: linked to specific note
  title       String?              // Auto-generated from first message
  context     Json?    @db.JsonB  // Snapshot of file context
  createdAt   DateTime
  updatedAt   DateTime
  messages    AIMessage[]
  user        User     @relation(fields: [userId], references: [id])
  content     ContentNode? @relation(fields: [contentId], references: [id])
}

model AIMessage {
  id             String   @id @default(uuid()) @db.Uuid
  conversationId String   @db.Uuid
  role           String   // "user" or "assistant"
  content        String   @db.Text
  tokensUsed     Int?     // Track cost
  createdAt      DateTime
  conversation   AIConversation @relation(fields: [conversationId], references: [id])
}
```

### 2. API Routes

**Streaming Chat API:**
```typescript
POST /api/ai/chat
- Accepts: { conversationId?, message, context }
- Returns: Server-Sent Events (SSE) stream
- Tracks tokens used
- Enforces quotas
```

**Conversation Management:**
```typescript
GET    /api/ai/conversations        // List all conversations
POST   /api/ai/conversations        // Create new conversation
GET    /api/ai/conversations/[id]   // Get specific conversation
DELETE /api/ai/conversations/[id]   // Delete conversation
```

**Context-Based Suggestions:**
```typescript
POST /api/ai/suggestions
- Accepts: { contentId, contentType, excerpt }
- Returns: Contextual suggestions (e.g., "Continue writing", "Improve clarity")
```

### 3. Service Layer

**Core Services:**

**`lib/ai/chat-service.ts`**
- Anthropic Claude SDK integration
- Streaming response handling
- Error handling and retries
- Model selection

**`lib/ai/context-builder.ts`**
- Extracts relevant context from current file
- Respects privacy settings
- Limits context to token budget
- Formats context for AI

**`lib/ai/token-counter.ts`**
- Counts tokens before sending (prevent quota overruns)
- Tracks usage per user
- Updates monthly quota
- Alerts when nearing limit

**`lib/ai/rate-limiter.ts`**
- Prevents spam/abuse
- Per-user rate limits
- Enforces monthly quotas
- Graceful degradation

### 4. State Management

**`stores/ai-chat-store.ts`**
```typescript
{
  // Current conversation
  activeConversationId: string | null,
  messages: AIMessage[],
  isStreaming: boolean,
  streamingContent: string,

  // Actions
  sendMessage(message: string),
  loadConversation(id: string),
  createNewConversation(),
  deleteConversation(id: string),

  // Context
  setContext(fileId: string, excerpt: string),
}
```

**`stores/ai-settings-store.ts`** (uses unified settings)
```typescript
// Reads from settings.ai.*
const { ai } = useSettingsStore();

// No separate store needed!
```

### 5. UI Components

**ToolBelt Integration:**
```typescript
<ToolBelt>
  <ToolBeltButton icon="Sparkles" onClick={openAIChat}>
    Ask AI
  </ToolBeltButton>
</ToolBelt>
```

**AI Chat Panel (Right Sidebar):**
```typescript
<RightSidebar>
  <Tab name="AI Chat">
    <AIChatPanel />
  </Tab>
</RightSidebar>

<AIChatPanel>
  <ConversationList />
  <MessageList />
  <ChatInput />
  <UsageIndicator /> {/* Shows tokens used */}
</AIChatPanel>
```

**Message Components:**
```typescript
<MessageList>
  <UserMessage content="How do I structure this note?" />
  <AssistantMessage content="Here's a suggested outline..." />
  <SuggestionCard action="Apply" />
</MessageList>
```

---

## Implementation Phases

### Phase 2A: Core Infrastructure (Week 1)

**Goal:** Get basic AI chat working

**Tasks:**
1. Database schema (AIConversation, AIMessage models)
2. API routes (POST /api/ai/chat with streaming)
3. Chat service (Anthropic SDK integration)
4. Token counter (usage tracking)
5. Basic UI (chat panel, message list, input)

**Deliverables:**
- Can send message to AI and get response
- Responses stream in real-time
- Conversations saved to database
- Token usage tracked

### Phase 2B: Context Integration (Week 1-2)

**Goal:** Make AI context-aware

**Tasks:**
1. Context builder service
2. File content extraction
3. Privacy mode implementation
4. Context injection into API calls
5. Context display in UI

**Deliverables:**
- AI knows current file content
- AI can answer questions about the file
- User controls what AI sees
- Context shown in chat panel

### Phase 2C: Polish & Features (Week 2)

**Goal:** Production-ready features

**Tasks:**
1. Conversation history UI
2. Usage quota enforcement
3. Rate limiting
4. Auto-suggestions
5. Model selection UI
6. Export conversations

**Deliverables:**
- Complete conversation management
- Quota warnings and enforcement
- Settings UI for AI preferences
- Polished, production-ready experience

---

## Key Technical Decisions

### 1. Streaming Responses (SSE vs WebSocket)

**Chosen:** Server-Sent Events (SSE)

**Reasoning:**
- ✅ Built into Next.js API routes
- ✅ Simpler than WebSocket
- ✅ HTTP/2 compatible
- ✅ Auto-reconnect on disconnect
- ❌ One-way only (fine for our use case)

**Implementation:**
```typescript
// API route
export async function POST(request: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      // Stream AI response chunks
      for await (const chunk of aiResponse) {
        controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

### 2. Anthropic Claude vs OpenAI

**Chosen:** Anthropic Claude (primary), OpenAI (fallback)

**Reasoning:**
- ✅ Claude excels at long-form writing (perfect for notes)
- ✅ Better instruction-following
- ✅ Larger context window (200K tokens)
- ✅ More accurate for research/analysis
- ⚠️ Allow user to choose via settings

### 3. Token Tracking

**Chosen:** Count tokens client-side BEFORE sending

**Reasoning:**
- ✅ Prevents quota overruns
- ✅ Show cost preview before sending
- ✅ Fast (no API call)
- ❌ Approximate (but close enough)

**Libraries:**
- `js-tiktoken` for OpenAI models
- Anthropic's tokenizer for Claude

### 4. Context Strategy

**Privacy Modes:**
- **Full:** AI sees entire file content
- **Balanced:** AI sees current paragraph + metadata
- **Minimal:** AI sees only file type + metadata
- **Off:** No context, general assistant only

**Implementation:**
```typescript
function buildContext(file: ContentNode, mode: PrivacyMode) {
  switch (mode) {
    case "full":
      return file.content;
    case "balanced":
      return extractParagraph(file.content, cursorPosition);
    case "minimal":
      return { type: file.contentType, title: file.title };
    case "off":
      return null;
  }
}
```

---

## Settings Integration

Phase 2 uses settings from Phase 1:

```typescript
import { useSettingsStore } from "@/stores/settings-store";

function AIChatPanel() {
  const { ai, setAISettings } = useSettingsStore();

  // Read settings
  const isEnabled = ai.enabled;
  const model = ai.model;
  const quota = ai.monthlyTokenQuota;
  const used = ai.tokensUsedThisMonth;

  // Update settings
  async function changeModel(newModel: string) {
    await setAISettings({ model: newModel });
  }

  // Track usage
  async function trackTokens(tokensUsed: number) {
    await setAISettings({
      tokensUsedThisMonth: ai.tokensUsedThisMonth + tokensUsed,
    });
  }
}
```

**Settings UI Location:** `/settings/preferences` (AI tab)

---

## Cost Management

### Token Quotas

**Default Quota:** 100,000 tokens/month per user

**Approximate Costs:**
- Claude Sonnet 3.5: $3/million input tokens, $15/million output
- 100K tokens ≈ $0.30 input + $1.50 output = ~$1.80/month/user

**Quota Enforcement:**
1. Count tokens before sending
2. Check if user is within quota
3. If exceeded, show warning or block
4. Reset monthly on user.createdAt anniversary

### Usage Tracking

```typescript
// After each AI response
await prisma.user.update({
  where: { id: userId },
  data: {
    settings: {
      ...settings,
      ai: {
        ...settings.ai,
        tokensUsedThisMonth: settings.ai.tokensUsedThisMonth + tokensUsed,
      },
    },
  },
});
```

### Usage UI

```typescript
<UsageIndicator>
  <ProgressBar value={used} max={quota} />
  <Text>{used.toLocaleString()} / {quota.toLocaleString()} tokens</Text>
  <Text>~{remainingDays} days until reset</Text>
</UsageIndicator>
```

---

## Privacy & Security

### User Controls

1. **Privacy Mode** (settings.ai.privacyMode)
   - User chooses what AI can see
   - Enforced at context-building layer

2. **Conversation History** (settings.ai.conversationHistory)
   - User can disable saving conversations
   - Conversations deleted after session if disabled

3. **AI Toggle** (settings.ai.enabled)
   - Master switch to disable AI entirely
   - Hides AI button from tool belt

### Data Protection

- ✅ Conversations encrypted at rest (PostgreSQL JSONB)
- ✅ API keys stored in environment variables (never client-side)
- ✅ Rate limiting prevents abuse
- ✅ User owns conversation data (can export/delete)
- ✅ Compliance: conversations are user data, not training data

---

## Testing Strategy

### Unit Tests

```typescript
// lib/ai/context-builder.test.ts
test("respects privacy mode", () => {
  const context = buildContext(file, "minimal");
  expect(context).not.toContain(file.content);
  expect(context).toHaveProperty("type");
});

// lib/ai/token-counter.test.ts
test("counts tokens accurately", () => {
  const count = countTokens("Hello world", "claude-3-5-sonnet");
  expect(count).toBe(3);
});
```

### Integration Tests

```bash
# Test API routes
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Summarize this note",
    "context": { "content": "..." }
  }'
```

### E2E Tests

```typescript
test("AI chat flow", async () => {
  // 1. Open AI panel
  await page.click('[data-testid="ai-chat-button"]');

  // 2. Send message
  await page.fill('[data-testid="chat-input"]', "What is this note about?");
  await page.click('[data-testid="send-button"]');

  // 3. Wait for response
  await page.waitForSelector('[data-testid="assistant-message"]');

  // 4. Verify response
  const response = await page.textContent('[data-testid="assistant-message"]');
  expect(response).toContain("This note");
});
```

---

## Success Criteria

Phase 2 is complete when:

- [ ] User can open AI chat panel from tool belt
- [ ] User can send messages and receive streaming responses
- [ ] AI has access to current file context (based on privacy mode)
- [ ] Conversations are saved to database
- [ ] Token usage is tracked and displayed
- [ ] Monthly quota is enforced
- [ ] Settings UI exists for AI preferences
- [ ] User can view/delete conversation history
- [ ] Rate limiting prevents abuse
- [ ] Documentation is complete

---

## Risks & Mitigations

### Risk 1: API Costs

**Risk:** Users spam AI, causing high costs
**Mitigation:**
- Monthly token quotas per user
- Rate limiting (max 10 messages/minute)
- Admin controls to adjust quotas
- Usage alerts at 80% quota

### Risk 2: Privacy Concerns

**Risk:** Users share sensitive data with AI
**Mitigation:**
- Clear privacy mode UI
- Warning when enabling "full" context
- User owns conversation data
- Can export/delete anytime

### Risk 3: AI Hallucinations

**Risk:** AI gives incorrect information
**Mitigation:**
- Disclaimer: "AI can make mistakes"
- Show sources (which file AI is referencing)
- User can verify AI suggestions
- Feedback mechanism for bad responses

### Risk 4: Performance

**Risk:** Streaming responses slow down UI
**Mitigation:**
- Lazy load conversation history
- Virtual scrolling for long conversations
- Cancel streaming if user navigates away
- Optimize API route response time

---

## Documentation Deliverables

Phase 2 will include:

1. **M8-PHASE-2-IMPLEMENTATION-SUMMARY.md** - Detailed implementation guide
2. **M8-AI-CHAT-API-SPEC.md** - Complete API documentation
3. **M8-AI-PRIVACY-GUIDE.md** - Privacy controls and data handling
4. **M8-AI-COST-MANAGEMENT.md** - Token tracking and quota system

---

## Next Steps After Phase 2

**Phase 3:** Settings UI Enhancement
- Build comprehensive settings management UI
- Add admin controls for AI quotas
- User profile with usage statistics

**Phase 5:** Advanced AI Features
- Multi-turn conversations with memory
- AI-powered search (semantic search)
- Auto-tagging suggestions
- Note summarization
- Writing style analysis

---

## Full Architecture Reference

For complete technical specifications, see:
- [M8-AI-CHAT-ARCHITECTURE.md](./M8-AI-CHAT-ARCHITECTURE.md) - Complete architecture plan

---

**Ready to Start Phase 2?** Let me know when you'd like to begin! 🚀
