# M8 AI Integration - Research & Technical Decisions

**Date:** January 25, 2026
**Purpose:** Comprehensive research to inform M8 Phase 2 AI integration decisions
**Status:** Research Complete, Ready for Implementation

---

## Table of Contents

1. [Modern AI Extensibility Libraries](#modern-ai-extensibility-libraries)
2. [AI Model Provider Support](#ai-model-provider-support)
3. [Document Processing (DOCX/XLSX)](#document-processing-docxxlsx)
4. [Database Architecture for Long-Term AI Evolution](#database-architecture-for-long-term-ai-evolution)
5. [Model Context Protocol (MCP) Integration](#model-context-protocol-mcp-integration)
6. [AI Capabilities Beyond Summarization](#ai-capabilities-beyond-summarization)
7. [AI UI/UX Best Practices & Libraries](#ai-uiux-best-practices--libraries)
8. [Recommended Tech Stack](#recommended-tech-stack)

---

## Modern AI Extensibility Libraries

### 1. **Vercel AI SDK** (RECOMMENDED)

**Status:** Industry standard, actively maintained, 97M+ monthly downloads

**Use Cases:**
- ✅ **Streaming chat responses** - Server-Sent Events (SSE) with React hooks
- ✅ **Provider abstraction** - Unified API for OpenAI, Anthropic, Google, etc.
- ✅ **Tool calling** - Function execution with type safety
- ✅ **Structured outputs** - Typed JSON responses with Zod
- ✅ **Generative UI** - React Server Components for dynamic UIs

**Key Features (AI SDK 6 - Latest):**
- **ToolLoopAgent class** - Production-ready agent with 20-step execution loops
- **Human-in-the-loop** - Tool approval with single `needsApproval` flag
- **Streaming** - Token-level streaming with partial updates
- **Multi-modal** - Text, images, files, voice
- **Chat SDK** - Message persistence, auth, shareable chats

**Why Choose:**
- Perfect fit for Next.js App Router (our stack)
- Built-in React hooks (`useChat`, `useCompletion`)
- First-class TypeScript support
- No vendor lock-in (swap providers easily)
- Active development + Vercel backing

**Installation:**
```bash
npm install ai @ai-sdk/anthropic @ai-sdk/openai
```

**Basic Usage:**
```typescript
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const result = streamText({
  model: anthropic('claude-3-5-sonnet-20241022'),
  messages: [{ role: 'user', content: 'Hello!' }],
});

// With React
import { useChat } from 'ai/react';
const { messages, input, handleSubmit } = useChat();
```

**Sources:**
- [AI SDK 6 Release](https://vercel.com/blog/ai-sdk-6)
- [Official Docs](https://ai-sdk.dev/docs/introduction)
- [Streaming Guide](https://www.9.agency/blog/streaming-ai-responses-vercel-ai-sdk)

---

### 2. **LangChain.js** (For Advanced RAG)

**Status:** Leading framework for RAG (Retrieval-Augmented Generation), constant updates

**Use Cases:**
- ✅ **RAG pipelines** - Document Q&A with vector search
- ✅ **Document loaders** - PDF, DOCX, CSV, web scraping
- ✅ **Vector stores** - Pinecone, Chroma, Qdrant integration
- ✅ **Chains** - Complex multi-step workflows
- ✅ **Agents** - Tool-using autonomous agents

**When to Use:**
- Need document retrieval (search notes before answering)
- Want semantic search over note content
- Building knowledge base chatbot
- Need advanced memory/context management

**Integration with Vercel AI SDK:**
The `@ai-sdk/langchain` package has been rewritten to support modern LangChain/LangGraph features with tool calling, partial input streaming, and Human-in-the-Loop workflows.

**RAG Pipeline Components:**
1. **Document ingestion** - Load notes from database
2. **Text splitting** - Chunk notes into semantic blocks
3. **Embedding generation** - Create vector embeddings
4. **Vector store** - Store in Pinecone/Qdrant
5. **Retrieval** - Find relevant notes for context
6. **Generation** - Pass context to LLM

**Example RAG Flow:**
```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";

// 1. Load documents
const documents = await loadNotesFromDatabase();

// 2. Create embeddings and vector store
const vectorStore = await MemoryVectorStore.fromDocuments(
  documents,
  new OpenAIEmbeddings()
);

// 3. Retrieve relevant docs
const retriever = vectorStore.asRetriever();
const relevantDocs = await retriever.getRelevantDocuments(query);

// 4. Generate answer with context
const llm = new ChatAnthropic({ model: "claude-3-5-sonnet" });
const answer = await llm.invoke([
  { role: "system", content: `Context: ${relevantDocs}` },
  { role: "user", content: query },
]);
```

**Sources:**
- [LangChain RAG Tutorial 2026](https://langchain-tutorials.github.io/langchain-rag-tutorial-2026/)
- [RAG with TypeScript](https://medium.com/@anoopp998/building-a-rag-application-using-langchain-and-typescript-4a2fd3def04e)
- [Production RAG System](https://dev.to/glaucia86/building-a-production-ready-rag-system-zero-to-hero-with-typescript-docker-google-gemini--50nh)

---

### 3. **Assistant UI** (UI Library)

**Status:** Open-source, Y Combinator-backed, 200K+ monthly downloads

**Use Cases:**
- ✅ **Pre-built chat components** - Message bubbles, input, streaming
- ✅ **Streaming support** - Real-time token display
- ✅ **Multi-provider** - Works with OpenAI, Anthropic, etc.
- ✅ **Accessibility** - WCAG compliant
- ✅ **File attachments** - Drag-and-drop support

**Key Features:**
- Composable primitives (not monolithic component)
- Auto-scrolling, markdown rendering, code highlighting
- Keyboard shortcuts, real-time updates
- TypeScript-first with full type safety
- Integrates with Vercel AI SDK, LangGraph

**Adoption:**
Used by LangChain, Athena Intelligence, Stack AI, and Browser Use.

**Example:**
```typescript
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@assistant-ui/react-ui";

function ChatInterface() {
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

**Sources:**
- [Assistant UI](https://www.assistant-ui.com/)
- [GitHub Repo](https://github.com/assistant-ui/assistant-ui)
- [Y Combinator Launch](https://www.ycombinator.com/companies/assistant-ui)

---

### 4. **Vercel AI Elements** (shadcn-based)

**Status:** New (2026), official Vercel components, built on shadcn/ui

**Use Cases:**
- ✅ **Production-ready AI components** - 20+ components
- ✅ **shadcn/ui compatibility** - Matches your existing design system
- ✅ **AI-specific patterns** - Reasoning blocks, tool calls
- ✅ **Full customization** - Components copy to your codebase

**Components:**
- `Conversation` / `ConversationContent` - Message container
- `Message` / `MessageContent` - Individual messages
- `PromptInput` - Auto-resizing textarea with attachments
- `Response` - Markdown rendering
- `Tool` - Tool call displays
- `Reasoning` - Collapsible thinking blocks

**Why Choose:**
- Perfect fit if using shadcn/ui (we are!)
- Owns the code (no external dependency)
- Understands AI SDK data structures
- Handles streaming, tool calls, reasoning automatically

**Installation:**
```bash
npx shadcn add ai-elements
```

**Sources:**
- [AI Elements Announcement](https://vercel.com/changelog/introducing-ai-elements)
- [shadcn/ui AI Components](https://www.shadcn.io/ai)
- [GitHub Repo](https://github.com/vercel/ai-elements)

---

## Comparison Matrix

| Library | Best For | Learning Curve | Provider Support | UI Components | TypeScript |
|---------|----------|---------------|------------------|---------------|------------|
| **Vercel AI SDK** | Streaming chat, tool calling | Low | All major (OpenAI, Anthropic, Google, etc.) | React hooks | ✅ Excellent |
| **LangChain.js** | RAG, document Q&A, complex chains | Medium-High | All major + local models | None (headless) | ✅ Good |
| **Assistant UI** | Chat UI, ready-to-use interface | Low | Works with any SDK | ✅ 20+ components | ✅ Excellent |
| **AI Elements** | shadcn/ui projects, customization | Low | Vercel AI SDK | ✅ 20+ components | ✅ Excellent |

---

## AI Model Provider Support

### Recommended Stack: Multi-Provider with Fallbacks

**Primary:** Anthropic Claude (best for long-form writing)
**Secondary:** OpenAI (fallback, API compatibility)
**Future:** Local models (Ollama for privacy-focused users)

### Anthropic Claude (PRIMARY CHOICE)

**Models Available:**
- `claude-opus-4-5` - Most capable, best reasoning (Mar 2026)
- `claude-sonnet-4-5` - Best balance of speed/quality (Jan 2026)
- `claude-3-5-sonnet-20241022` - Fast, excellent for chat
- `claude-haiku-3-5` - Cheapest, fast responses

**Why Claude for Notes:**
- ✅ **200K context window** - Can see entire notes
- ✅ **Excellent instruction-following** - Better at structured outputs
- ✅ **Long-form writing** - Superior prose generation
- ✅ **Research/analysis** - Better at synthesizing information
- ✅ **Tool use** - More reliable function calling
- ⚠️ **Cost:** $3 input / $15 output per 1M tokens (Sonnet)

**Usage with Vercel AI SDK:**
```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

const result = streamText({
  model: anthropic('claude-sonnet-4-5'),
  messages: [...],
  tools: {...}, // Function calling
});
```

**Market Position (2026):**
- 32% enterprise LLM market share
- Donated Model Context Protocol (MCP) to Linux Foundation
- Strong governance + ethics focus

**Sources:**
- [Claude vs OpenAI 2026](https://learn.ryzlabs.com/ai-development/comparative-analysis-anthropic-vs-openai-vs-claude-2026)
- [Anthropic vs OpenAI](https://www.lilbigthings.com/post/anthropic-vs-openai)

---

### OpenAI (FALLBACK)

**Models Available:**
- `gpt-4-turbo` - Most capable
- `gpt-4o` - Optimized multimodal
- `gpt-3.5-turbo` - Cheap, fast

**Why OpenAI as Fallback:**
- ✅ **Widespread adoption** - More community resources
- ✅ **Strong multimodal** - Better image understanding
- ✅ **API maturity** - Very stable
- ⚠️ **Cost:** $5 input / $15 output per 1M tokens (GPT-4 Turbo)
- ❌ **80% consumer market** but only 25% enterprise (2026)

**Usage:**
```typescript
import { openai } from '@ai-sdk/openai';

const result = streamText({
  model: openai('gpt-4-turbo'),
  messages: [...],
});
```

---

### Local/Open Source Models

**Ollama Integration:**
```typescript
import { ollama } from 'ollama-ai-provider';

const result = streamText({
  model: ollama('llama-3.1-70b'),
  messages: [...],
});
```

**Popular Open Models (2026):**
- **Llama 3.1** - Meta's open model (8B, 70B, 405B)
- **Mistral** - European alternative
- **Qwen** - Strong multilingual support
- **DeepSeek** - Excellent coding model

**Use Cases:**
- Privacy-focused users (local inference)
- Offline mode support
- Cost reduction (no API fees)
- Custom fine-tuning

---

### Provider Switching Strategy

**Vercel AI SDK makes this trivial:**

```typescript
// settings-store.ts
const modelConfig = {
  'claude-sonnet-4-5': anthropic('claude-sonnet-4-5'),
  'gpt-4-turbo': openai('gpt-4-turbo'),
  'llama-3.1': ollama('llama-3.1-70b'),
};

// In API route
const model = modelConfig[settings.ai.model];
const result = streamText({ model, messages });
```

**User Settings:**
```typescript
{
  ai: {
    model: "claude-sonnet-4-5", // User selects in UI
    fallbackModel: "gpt-4-turbo", // Auto-switch on failure
    enableLocalModels: false, // Privacy mode
  }
}
```

**Sources:**
- [AI SDK Providers Docs](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)
- [Provider Comparison](https://is4.ai/blog/our-blog-1/openai-api-vs-anthropic-api-comparison-117)

---

## Document Processing (DOCX/XLSX)

### DOCX Processing (ALREADY HAVE)

**Current Stack:** Mammoth.js

**What We Extract:**
- Plain text content
- Paragraph structure
- Basic formatting (bold, italic)
- Lists and tables (as text)

**For AI Context:**
```typescript
import mammoth from 'mammoth';

async function extractDocxForAI(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value; // Clean text for AI
}
```

**Limitations:**
- No embedded images (just alt text)
- Tables become plain text (lose structure)
- Complex formatting lost

**Enhancement Opportunity:**
```typescript
// Extract structured data
const result = await mammoth.convertToHtml({ buffer });
// Gives HTML which preserves more structure for AI
```

---

### XLSX Processing (NEW REQUIREMENT)

**Recommended Library:** `xlsx` (SheetJS)

**Why:**
- ✅ Most popular (industry standard)
- ✅ TypeScript support out-of-box
- ✅ Can read formulas, values, formatting
- ✅ Handles multiple sheets
- ✅ Active maintenance

**Installation:**
```bash
npm install xlsx
```

**Basic Text Extraction:**
```typescript
import * as XLSX from 'xlsx';

async function extractXlsxForAI(buffer: Buffer): Promise<string> {
  // 1. Parse workbook
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  let textContent = '';

  // 2. Process each sheet
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];

    // Convert to CSV (preserves structure)
    const csv = XLSX.utils.sheet_to_csv(sheet);
    textContent += `\n--- Sheet: ${sheetName} ---\n${csv}\n`;
  });

  return textContent;
}
```

**Structured Data Extraction (Better for AI):**
```typescript
async function extractXlsxStructured(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheets = workbook.SheetNames.map(sheetName => {
    const sheet = workbook.Sheets[sheetName];

    // Get as JSON (preserves structure)
    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1, // Array of arrays
      defval: '', // Default for empty cells
    });

    // Extract headers and rows
    const [headers, ...rows] = data as string[][];

    return {
      name: sheetName,
      headers,
      rows,
      rowCount: rows.length,
      columnCount: headers.length,
    };
  });

  return {
    fileName: 'example.xlsx',
    sheets,
    sheetCount: sheets.length,
    totalRows: sheets.reduce((sum, s) => sum + s.rowCount, 0),
  };
}
```

**AI Context Format:**
```typescript
async function formatXlsxForAI(buffer: Buffer): Promise<string> {
  const data = await extractXlsxStructured(buffer);

  // Format as markdown table for AI
  let aiContext = `# Excel File: ${data.fileName}\n\n`;
  aiContext += `Contains ${data.sheetCount} sheets with ${data.totalRows} total rows.\n\n`;

  data.sheets.forEach(sheet => {
    aiContext += `## Sheet: ${sheet.name}\n\n`;
    aiContext += `| ${sheet.headers.join(' | ')} |\n`;
    aiContext += `|${sheet.headers.map(() => '---').join('|')}|\n`;

    // Include first 10 rows (limit for AI context)
    sheet.rows.slice(0, 10).forEach(row => {
      aiContext += `| ${row.join(' | ')} |\n`;
    });

    if (sheet.rowCount > 10) {
      aiContext += `\n... (${sheet.rowCount - 10} more rows)\n\n`;
    }
  });

  return aiContext;
}
```

**Advanced: Formula and Metadata Extraction:**
```typescript
function extractXlsxAdvanced(buffer: Buffer) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: true, // Include formulas
    cellStyles: true, // Include formatting
  });

  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Access individual cells
  const cellA1 = sheet['A1'];

  return {
    value: cellA1.v, // Computed value
    formula: cellA1.f, // Formula (if any)
    type: cellA1.t, // Type (s=string, n=number, b=boolean)
    format: cellA1.z, // Number format
  };
}
```

**Alternative Libraries (If Needed):**

1. **read-excel-file** - Simpler API, less features
2. **exceljs** - More features (write support, styling)
3. **office-text-extractor** - Unified API for DOCX/XLSX/PPTX

**Storage Strategy:**
```typescript
// In FilePayload processing
async function processSpreadsheet(fileId: string, buffer: Buffer) {
  // 1. Extract text for search
  const textContent = await extractXlsxForAI(buffer);

  // 2. Update FilePayload.searchText
  await prisma.filePayload.update({
    where: { contentId: fileId },
    data: { searchText: textContent },
  });

  // 3. Store structured metadata
  const metadata = await extractXlsxStructured(buffer);

  await prisma.filePayload.update({
    where: { contentId: fileId },
    data: {
      storageMetadata: {
        ...existing,
        xlsx: metadata, // Sheet names, row counts, headers
      },
    },
  });
}
```

**Sources:**
- [xlsx npm package](https://www.npmjs.com/package/xlsx)
- [Read Excel TypeScript Guide](https://blog.tericcabrel.com/read-excel-file-nodejs-typescript/)
- [Building with Node + TypeScript](https://andrewallison.medium.com/building-a-nodejs-typescript-project-for-reading-excel-files-part-2-dfa8fda1eaf7)

---

## Database Architecture for Long-Term AI Evolution

### Current Database Issues to Avoid

**Anti-Patterns:**
- ❌ Storing conversation JSON in single column (not queryable)
- ❌ Coupling to specific AI provider (OpenAI-specific fields)
- ❌ No versioning (can't migrate old conversations)
- ❌ Mixed concerns (settings + conversations in one table)

### Recommended Schema (Future-Proof)

**Core Principle:** Separate concerns, normalize, make queryable

```prisma
// ============================================
// AI Conversations (Multi-Provider Support)
// ============================================

model AIConversation {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  contentId   String?  @db.Uuid  // Optional: linked to note

  // Metadata
  title       String?  @db.VarChar(200)  // Auto-generated
  description String?  @db.Text          // Optional summary
  tags        String[] @default([])       // Categorization

  // Provider info (for migration/compatibility)
  provider    String   @default("anthropic")  // "anthropic" | "openai" | "ollama"
  model       String   @db.VarChar(100)       // "claude-sonnet-4-5"
  modelVersion String? @db.VarChar(50)        // Version snapshot

  // Context snapshot (what user could see at time of chat)
  contextSnapshot Json?  @db.JsonB  // { fileType, excerpt, metadata }
  privacyMode     String @default("balanced")  // "full" | "balanced" | "minimal" | "off"

  // Conversation state
  status      ConversationStatus @default(active)
  pinnedAt    DateTime?          // User can pin important chats
  archivedAt  DateTime?          // Soft delete

  // Timestamps
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)
  lastMessageAt DateTime? @db.Timestamptz(6)  // Denormalized for sorting

  // Relations
  messages    AIMessage[]
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  content     ContentNode? @relation(fields: [contentId], references: [id], onDelete: SetNull)

  // Indexes for performance
  @@index([userId, lastMessageAt(sort: Desc)])  // User's recent chats
  @@index([contentId])                          // Chats for specific note
  @@index([status, archivedAt])                 // Active vs archived
}

enum ConversationStatus {
  active
  archived
  deleted  // Soft delete for compliance
}

// ============================================
// AI Messages (Flexible, Provider-Agnostic)
// ============================================

model AIMessage {
  id             String   @id @default(uuid()) @db.Uuid
  conversationId String   @db.Uuid

  // Message content
  role           MessageRole  // "user" | "assistant" | "system" | "tool"
  content        String       @db.Text

  // Provider-specific data (flexible)
  providerData   Json?        @db.JsonB  // Store tool calls, reasoning, etc.

  // Usage tracking
  tokensInput    Int?         // Prompt tokens
  tokensOutput   Int?         // Completion tokens
  tokensCached   Int?         // Cached tokens (Claude feature)
  cost           Decimal?     @db.Decimal(10, 6)  // Cost in USD

  // Performance metrics
  latencyMs      Int?         // Response time
  modelUsed      String?      @db.VarChar(100)  // Actual model (fallback tracking)

  // Error handling
  error          String?      @db.Text   // If message failed
  retryCount     Int          @default(0)

  // Timestamps
  createdAt      DateTime     @default(now()) @db.Timestamptz(6)
  editedAt       DateTime?    @db.Timestamptz(6)  // If user edited

  // Relations
  conversation   AIConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([conversationId, createdAt])  // Message ordering
  @@index([role])                        // Filter by role
}

enum MessageRole {
  user
  assistant
  system
  tool
}

// ============================================
// AI Usage Tracking (Separate from Messages)
// ============================================

model AIUsageLog {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid

  // What happened
  action      AIAction  // "chat" | "summarize" | "search" | "suggest"
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

  // Timestamps
  timestamp   DateTime  @default(now()) @db.Timestamptz(6)

  // Relations
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Indexes for analytics
  @@index([userId, timestamp(sort: Desc)])     // User's usage history
  @@index([timestamp(sort: Desc), provider])   // Provider stats
  @@index([userId, action])                    // Action breakdown
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

// ============================================
// AI Feature Configurations (Future Features)
// ============================================

model AIFeatureConfig {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  featureName String   @db.VarChar(100)  // "auto-suggest" | "semantic-search" | etc.

  // Feature-specific config
  config      Json     @db.JsonB
  enabled     Boolean  @default(true)

  // Timestamps
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)

  // Relations
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, featureName])
}

// ============================================
// Update User Model
// ============================================

model User {
  // ... existing fields ...

  // AI Relations
  aiConversations  AIConversation[]
  aiUsageLogs      AIUsageLog[]
  aiFeatureConfigs AIFeatureConfig[]

  // Settings (already added in Phase 1)
  settings         Json?    @db.JsonB
  settingsVersion  Int      @default(1)
}
```

### Key Design Decisions

**1. Separate AIUsageLog from AIMessage**
- **Why:** Usage analytics don't need conversation context
- **Benefit:** Fast aggregation queries for billing
- **Example:** "Show me total tokens used this month" → single table scan

**2. Provider + Model Fields**
- **Why:** AI landscape changes fast
- **Benefit:** Can migrate old conversations to new models
- **Example:** "Rerun this conversation with Claude Opus 4.5"

**3. providerData JSONB Column**
- **Why:** Each provider has unique features (tool calls, reasoning blocks)
- **Benefit:** Don't need schema migration for new features
- **Example:** Claude adds "thinking" mode → store in providerData

**4. Conversation vs Message Split**
- **Why:** Conversations are long-lived, messages are append-only
- **Benefit:** Can paginate messages efficiently
- **Example:** Load conversation metadata fast, lazy-load messages

**5. Cost Tracking per Message**
- **Why:** Different models have different costs
- **Benefit:** Show user "This answer cost $0.02"
- **Future:** Rate limiting based on cost, not just tokens

### Query Patterns (Optimized)

**Get User's Recent Conversations:**
```typescript
await prisma.aIConversation.findMany({
  where: {
    userId,
    status: 'active',
    archivedAt: null,
  },
  orderBy: { lastMessageAt: 'desc' },
  take: 20,
  select: {
    id: true,
    title: true,
    lastMessageAt: true,
    _count: { select: { messages: true } },
  },
});
// Fast: Uses index on (userId, lastMessageAt)
```

**Get Conversation with Messages (Paginated):**
```typescript
const conversation = await prisma.aIConversation.findUnique({
  where: { id: conversationId },
  include: {
    messages: {
      orderBy: { createdAt: 'asc' },
      skip: page * 50,
      take: 50,
    },
  },
});
// Fast: Uses index on (conversationId, createdAt)
```

**Monthly Usage Report:**
```typescript
const usage = await prisma.aIUsageLog.groupBy({
  by: ['provider', 'action'],
  where: {
    userId,
    timestamp: {
      gte: startOfMonth,
      lte: endOfMonth,
    },
  },
  _sum: {
    tokensInput: true,
    tokensOutput: true,
    cost: true,
  },
});
// Fast: Uses index on (userId, timestamp)
```

**Find Conversations About Specific Note:**
```typescript
const chats = await prisma.aIConversation.findMany({
  where: { contentId: noteId },
  include: {
    messages: {
      take: 1,
      orderBy: { createdAt: 'desc' },
    },
  },
});
// Fast: Uses index on (contentId)
```

### Migration Strategy

**Phase 2A:** Basic schema (Conversation + Message)
**Phase 2B:** Add UsageLog table
**Phase 3:** Add FeatureConfig for advanced features

**Backward Compatibility:**
```typescript
// When migrating old conversations
async function migrateConversation(oldFormat: any) {
  return prisma.aIConversation.create({
    data: {
      ...oldFormat,
      provider: 'openai', // Default for old data
      model: oldFormat.model || 'gpt-3.5-turbo',
      modelVersion: 'unknown',
      messages: {
        create: oldFormat.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          providerData: msg, // Store entire old format
        })),
      },
    },
  });
}
```

---

## Model Context Protocol (MCP) Integration

### What is MCP?

**Model Context Protocol** is Anthropic's open standard (now managed by Linux Foundation) for connecting AI systems to external tools and data sources.

**Status (2026):**
- ✅ De facto industry standard
- ✅ Supported by OpenAI, Google, Microsoft, AWS
- ✅ 97M+ monthly SDK downloads (Python + TypeScript)
- ✅ Official registry with 75+ connectors
- ✅ Thousands of community-built servers

**Three Core Primitives:**
1. **Resources** - Data sources (databases, files, APIs)
2. **Tools** - Actions AI can take (search, create, update)
3. **Prompts** - Pre-configured interaction patterns

**Sources:**
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [Anthropic Announcement](https://www.anthropic.com/news/model-context-protocol)
- [MCP GitHub](https://github.com/modelcontextprotocol)

---

### Building an MCP Server for Notes

**Goal:** Let external AI tools (Claude Desktop, VS Code, etc.) access your notes

**Architecture:**
```
┌─────────────────────┐
│  Claude Desktop     │
│  VS Code Copilot    │
│  Custom AI Tools    │
└──────────┬──────────┘
           │ MCP Protocol
           ↓
┌─────────────────────┐
│  Notes MCP Server   │
│  (TypeScript)       │
└──────────┬──────────┘
           │ API Calls
           ↓
┌─────────────────────┐
│  Notes API          │
│  /api/notes/...     │
└─────────────────────┘
```

**Implementation:**

```typescript
// lib/mcp/notes-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  {
    name: "digital-garden-notes",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

// 1. RESOURCES: Expose notes as readable data
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  // Fetch notes from database
  const notes = await prisma.contentNode.findMany({
    where: { contentType: 'note' },
    include: { notePayload: true },
  });

  return {
    resources: notes.map(note => ({
      uri: `note://${note.id}`,
      name: note.title,
      description: note.notePayload?.excerpt,
      mimeType: "text/markdown",
    })),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const noteId = request.params.uri.replace('note://', '');
  const note = await getNoteContent(noteId);

  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "text/markdown",
      text: note.markdownContent,
    }],
  };
});

// 2. TOOLS: Let AI perform actions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_notes",
        description: "Search through user's notes",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", default: 10 },
          },
          required: ["query"],
        },
      },
      {
        name: "create_note",
        description: "Create a new note",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["title", "content"],
        },
      },
      {
        name: "get_backlinks",
        description: "Find notes that link to this note",
        inputSchema: {
          type: "object",
          properties: {
            noteId: { type: "string" },
          },
          required: ["noteId"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "search_notes":
      const results = await searchNotes(args.query, args.limit);
      return {
        content: [{ type: "text", text: JSON.stringify(results) }],
      };

    case "create_note":
      const note = await createNote(args.title, args.content, args.tags);
      return {
        content: [{ type: "text", text: `Created note: ${note.id}` }],
      };

    case "get_backlinks":
      const backlinks = await getBacklinks(args.noteId);
      return {
        content: [{ type: "text", text: JSON.stringify(backlinks) }],
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// 3. PROMPTS: Pre-configured workflows
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "summarize_note",
        description: "Summarize a specific note",
        arguments: [
          { name: "noteId", description: "Note to summarize", required: true },
        ],
      },
      {
        name: "find_related",
        description: "Find notes related to a topic",
        arguments: [
          { name: "topic", description: "Topic to search", required: true },
        ],
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "summarize_note") {
    const note = await getNoteContent(args.noteId);
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please summarize this note:\n\n${note.markdownContent}`,
          },
        },
      ],
    };
  }

  // ... other prompts
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Usage from Claude Desktop:**

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "digital-garden": {
      "command": "node",
      "args": ["/path/to/notes-mcp-server.js"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "API_URL": "http://localhost:3000"
      }
    }
  }
}
```

Now Claude Desktop can:
- List your notes
- Search your notes
- Create new notes
- Get backlinks
- All while chatting!

---

### MCP Competing with Built-in AI Chat

**Q:** If MCP lets external tools access notes, why build our own AI chat?

**A:** They complement each other:

**MCP Server (External Access):**
- ✅ Let Claude Desktop access notes
- ✅ Let VS Code Copilot reference notes while coding
- ✅ Integrate with other AI tools
- ❌ Can't customize UI
- ❌ Can't track usage per-tool
- ❌ Depends on external apps

**Built-in AI Chat (Our Implementation):**
- ✅ Custom UI tailored to note-taking
- ✅ Deep integration (inline suggestions, auto-tagging)
- ✅ Usage tracking and billing
- ✅ Privacy controls
- ✅ Works without external apps
- ❌ Limited to our app

**Best Strategy:** Build both!
- **Phase 2:** Build internal AI chat (primary UX)
- **Phase 3:** Add MCP server (power users + integrations)

**Example Use Cases:**
- **Internal Chat:** Quick note summarization, writing suggestions
- **MCP:** "Claude, search my notes for information about X" (from anywhere)

---

### MCP Registry Integration

**Consuming Existing MCP Servers:**

```typescript
// Use existing MCP servers in our AI chat
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Connect to GitHub MCP server
const githubMCP = new Client({
  name: "github",
  version: "1.0.0",
});

// Now AI can access GitHub
const tools = [
  {
    name: "search_github",
    description: "Search GitHub repositories",
    execute: async (query: string) => {
      return await githubMCP.callTool("search_repositories", { query });
    },
  },
];

// In AI chat
const result = await streamText({
  model: anthropic('claude-sonnet-4-5'),
  messages: [...],
  tools,
});
```

**Popular MCP Servers to Integrate:**
- **Google Drive** - Access documents
- **Slack** - Search messages, send notifications
- **GitHub** - Search code, create issues
- **Postgres** - Query database directly
- **Puppeteer** - Web scraping

**Sources:**
- [MCP Servers Repo](https://github.com/modelcontextprotocol/servers)
- [Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)

---

## AI Capabilities Beyond Summarization

### Document Analysis Capabilities

Based on research, modern AI can do much more than summarize:

**1. Information Extraction**
- **Named Entity Recognition** - Extract people, places, organizations
- **Key-Value Pairs** - Extract structured data (dates, amounts, parties)
- **Tables to JSON/CSV** - Convert tables to structured data
- **Formula Extraction** - Extract calculations from Excel

**Example:**
```typescript
async function extractEntities(content: string) {
  const result = await streamText({
    model: anthropic('claude-sonnet-4-5'),
    messages: [{
      role: 'user',
      content: `Extract all people, dates, and amounts from:\n\n${content}`
    }],
    tools: {
      extract_entities: {
        description: 'Extract structured entities',
        parameters: z.object({
          people: z.array(z.string()),
          dates: z.array(z.string()),
          amounts: z.array(z.object({
            value: z.number(),
            currency: z.string(),
          })),
        }),
      },
    },
  });
}
```

---

**2. Document Classification**
- **Content Type** - Invoice, contract, report, email, etc.
- **Sentiment Analysis** - Positive, negative, neutral
- **Topic Categorization** - Automatically tag notes
- **Language Detection** - Support multilingual notes

**Example:**
```typescript
async function classifyDocument(content: string) {
  const result = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    schema: z.object({
      type: z.enum(['invoice', 'contract', 'report', 'email', 'note']),
      sentiment: z.enum(['positive', 'neutral', 'negative']),
      topics: z.array(z.string()),
      language: z.string(),
      confidence: z.number(),
    }),
    prompt: `Classify this document:\n\n${content}`,
  });

  return result.object;
}
```

---

**3. Content Generation**
- **Auto-completion** - Continue writing based on context
- **Rewriting** - Improve clarity, fix grammar, change tone
- **Translation** - Support multiple languages
- **Templating** - Generate meeting notes, reports from structured data

**Example:**
```typescript
async function rewriteForClarity(content: string) {
  const result = await streamText({
    model: anthropic('claude-sonnet-4-5'),
    messages: [{
      role: 'user',
      content: `Rewrite this for clarity while preserving meaning:\n\n${content}`
    }],
  });
}
```

---

**4. Question Answering (RAG)**
- **Document QA** - "What is the total cost in this invoice?"
- **Comparison** - "Compare these two contracts"
- **Multi-document** - "Find all mentions of X across my notes"
- **Temporal** - "What changed between v1 and v2?"

**Example (with LangChain):**
```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { createRetrievalChain } from "langchain/chains/retrieval";

async function answerQuestion(query: string, noteIds: string[]) {
  // 1. Load relevant notes
  const notes = await loadNotes(noteIds);

  // 2. Create vector store
  const vectorStore = await createVectorStore(notes);

  // 3. Answer question
  const chain = await createRetrievalChain({
    retriever: vectorStore.asRetriever(),
    llm: new ChatAnthropic({ model: "claude-sonnet-4-5" }),
  });

  return await chain.invoke({ input: query });
}
```

---

**5. Spreadsheet Analysis (Excel/Google Sheets)**
- **Financial Analysis** - Calculate totals, averages, trends
- **Data Validation** - Find errors, inconsistencies
- **Chart Generation** - Suggest visualizations
- **Formula Explanation** - Explain complex formulas

**Example:**
```typescript
async function analyzeSpreadsheet(xlsxData: any) {
  const result = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    schema: z.object({
      summary: z.string(),
      keyInsights: z.array(z.string()),
      recommendations: z.array(z.string()),
      errors: z.array(z.object({
        sheet: z.string(),
        row: z.number(),
        issue: z.string(),
      })),
    }),
    prompt: `Analyze this spreadsheet data:\n\n${JSON.stringify(xlsxData)}`,
  });

  return result.object;
}
```

---

**6. OCR + Understanding (for PDFs)**
- **Extract text** from scanned documents
- **Table detection** - Find and extract tables
- **Handwriting recognition** - Read handwritten notes
- **Multi-column layout** - Preserve document structure

**Tools:**
- **Azure Document Intelligence** - OCR + structure
- **Tesseract.js** - Open-source OCR
- **pdf.js** - PDF parsing

**Example:**
```typescript
import { createWorker } from 'tesseract.js';

async function extractTextFromImage(imageBuffer: Buffer) {
  const worker = await createWorker('eng');
  const { data: { text } } = await worker.recognize(imageBuffer);
  await worker.terminate();
  return text;
}

// Then pass to AI for understanding
async function understandScannedDoc(text: string) {
  const result = await streamText({
    model: anthropic('claude-sonnet-4-5'),
    messages: [{
      role: 'user',
      content: `Extract key information from this scanned document:\n\n${text}`
    }],
  });
}
```

---

**7. Code Analysis (for code files)**
- **Explain code** - What does this function do?
- **Find bugs** - Detect potential issues
- **Suggest improvements** - Performance, readability
- **Generate tests** - Create unit tests

**Example:**
```typescript
async function analyzeCode(code: string, language: string) {
  const result = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    schema: z.object({
      explanation: z.string(),
      complexity: z.enum(['low', 'medium', 'high']),
      bugs: z.array(z.object({
        line: z.number(),
        issue: z.string(),
        severity: z.enum(['low', 'medium', 'high']),
      })),
      suggestions: z.array(z.string()),
    }),
    prompt: `Analyze this ${language} code:\n\n${code}`,
  });

  return result.object;
}
```

---

### Implementation Roadmap

**Phase 2A (Core Chat):**
- ✅ Summarization
- ✅ Q&A about current note
- ✅ Writing assistance (continue, rewrite)

**Phase 2B (Document Analysis):**
- ✅ Entity extraction (DOCX, PDF)
- ✅ Spreadsheet analysis (XLSX)
- ✅ Auto-tagging/classification

**Phase 2C (Advanced Features):**
- ✅ RAG (multi-note search)
- ✅ Comparison (diff notes)
- ✅ Code analysis (for code files)

**Phase 3 (Power Features):**
- ✅ OCR for scanned docs
- ✅ Formula explanation (Excel)
- ✅ Multi-document synthesis
- ✅ Custom workflows

**Sources:**
- [Azure Document Intelligence](https://azure.microsoft.com/en-us/products/ai-services/ai-document-intelligence)
- [AI Document Analysis Tools](https://anara.com/blog/ai-for-document-analysis)
- [Linnk.ai Document AI](https://linnk.ai/)

---

## AI UI/UX Best Practices & Libraries

### Best Practices (2026)

**Based on research, here are the top UX principles:**

**1. Streaming is Non-Negotiable**
> "Streaming makes AI feel instant (something happens immediately), alive (the model types back in real time), and trustworthy (users can see the reasoning unfold)."

- ✅ Use Server-Sent Events (SSE) for streaming
- ✅ Show tokens as they arrive (no waiting for full response)
- ✅ Include stop/abort button while streaming
- ✅ Show cursor/typing indicator

---

**2. Simplicity & Clarity**
> "Most users decide within the first five seconds whether a chatbot is worth engaging."

- ✅ Minimal layout, clear spacing, limited colors
- ✅ Avoid long welcome messages
- ✅ Show example prompts (quick actions)
- ❌ Don't clutter with too many options

---

**3. Human-Like Tone**
> "Phrases like 'Let me check that for you…' perform better than 'Retrieving requested data…'."

- ✅ Use conversational language
- ✅ Show personality (but professional)
- ✅ Acknowledge mistakes ("I apologize, let me try again")
- ❌ Avoid robotic phrasing

---

**4. Context Awareness**
> "The best chatbot UI/UX design allows for fluidity, uses persistent context showing what step the user is on."

- ✅ Show what file AI is looking at
- ✅ Display context sources ("Based on 3 notes")
- ✅ Let user adjust context (privacy mode)
- ✅ Resume from where they left off

---

**5. Multimodal Support (2026 Trend)**
> "Multimodal technologies create cohesive user experiences by combining input and output methods like voice and touch."

- ✅ Text input + voice input
- ✅ File attachments (drag-and-drop)
- ✅ Code blocks with syntax highlighting
- ✅ Embedded images/charts

---

**6. User Control**
> "The useChat hook provides... abort functionality, which improves the UX of your chatbot application."

- ✅ Stop button (abort streaming)
- ✅ Regenerate response
- ✅ Edit previous messages
- ✅ Branch conversations
- ✅ Copy/export responses

---

**7. Transparency**
> "Show the reasoning process, sources, and confidence levels."

- ✅ Show token usage ("This answer used 500 tokens")
- ✅ Display sources ("Based on note X, Y")
- ✅ Reasoning blocks (thinking process)
- ✅ Confidence indicators

**Sources:**
- [AI Chatbot UX Best Practices 2026](https://www.letsgroto.com/blog/ux-best-practices-for-ai-chatbots)
- [Chatbot UI Examples](https://www.jotform.com/ai/agents/best-chatbot-ui/)
- [AI SDK UI: Chatbot](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot)

---

### Recommended UI Libraries

**Primary Recommendation: Vercel AI Elements + shadcn/ui**

**Why:**
- ✅ We already use shadcn/ui (design system consistency)
- ✅ AI Elements built on top of shadcn
- ✅ 20+ production-ready components
- ✅ Full TypeScript support
- ✅ We own the code (copies to our codebase)
- ✅ Understands AI SDK data structures

**Components Included:**
```typescript
// Conversation containers
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';

// Messages
import { Message, MessageContent } from '@/components/ai-elements/message';

// Input
import { PromptInput } from '@/components/ai-elements/prompt-input';

// Markdown rendering
import { Response } from '@/components/ai-elements/response';

// Tool calls
import { Tool } from '@/components/ai-elements/tool';

// Reasoning blocks
import { Reasoning } from '@/components/ai-elements/reasoning';
```

**Example Chat UI:**
```typescript
'use client';

import { useChat } from 'ai/react';
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { PromptInput } from '@/components/ai-elements/prompt-input';
import { Response } from '@/components/ai-elements/response';

export function AIChatPanel() {
  const { messages, input, handleSubmit, handleInputChange, isLoading, stop } = useChat({
    api: '/api/ai/chat',
  });

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <Conversation className="flex-1 overflow-y-auto">
        <ConversationContent>
          {messages.map(message => (
            <Message key={message.id} role={message.role}>
              <MessageContent>
                <Response>{message.content}</Response>
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
      </Conversation>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t p-4">
        <PromptInput
          value={input}
          onChange={handleInputChange}
          placeholder="Ask about this note..."
          disabled={isLoading}
        />
        {isLoading && (
          <button onClick={stop} type="button">Stop</button>
        )}
      </form>
    </div>
  );
}
```

**Installation:**
```bash
npx shadcn add ai-elements
```

**Sources:**
- [AI Elements Announcement](https://vercel.com/changelog/introducing-ai-elements)
- [shadcn/ui AI Components](https://www.shadcn.io/ai)

---

**Alternative: Assistant UI (If More Customization Needed)**

**Pros:**
- More composable primitives
- Larger feature set (voice, attachments)
- Battle-tested (200K+ downloads)
- Y Combinator-backed

**Cons:**
- Not built on shadcn (different design system)
- External dependency (not copied to codebase)
- Steeper learning curve

**Use When:**
- Need advanced features (voice input, etc.)
- Want more granular control
- Building AI-first app (not note-first)

---

### UI/UX Maintenance Strategy

**Problem:** AI landscape evolves fast (new models, features)

**Solution:** Use abstraction layers

**1. Provider-Agnostic UI**
```typescript
// Don't hardcode provider UI
❌ <ClaudeReasoningBlock />
✅ <Reasoning /> // Works with any provider
```

**2. Feature Detection**
```typescript
// Check if model supports features
const supportsReasoning = model.includes('opus') || model.includes('o1');

{supportsReasoning && <Reasoning>{reasoning}</Reasoning>}
```

**3. Version UI Components**
```typescript
// components/ai-elements/message-v2.tsx
// When AI Elements updates, create new version
// Migrate gradually, don't break existing UI
```

**4. Use AI SDK Abstractions**
```typescript
// AI SDK handles provider differences
import { streamText } from 'ai';

// Works with Claude, OpenAI, Gemini, etc.
const result = streamText({
  model: selectedModel,
  messages,
});
```

**5. Monitor AI SDK Changelog**
- Subscribe to Vercel AI SDK releases
- Test new features in staging
- Update components incrementally

**6. Progressive Enhancement**
```typescript
// Start with basic chat
<BasicChat />

// Add features as they become available
{supportsTools && <ToolCallDisplay />}
{supportsReasoning && <ReasoningBlock />}
{supportsVision && <ImageAttachment />}
```

---

## Recommended Tech Stack

### Final Recommendation

**Core Stack:**
```json
{
  "AI SDK": "Vercel AI SDK 6+ (@ai-sdk/*)",
  "Primary Model": "Anthropic Claude Sonnet 4.5",
  "Fallback Model": "OpenAI GPT-4 Turbo",
  "UI Library": "Vercel AI Elements (shadcn/ui)",
  "RAG (Optional)": "LangChain.js",
  "Vector Store (Future)": "Pinecone / Qdrant",
  "Document Processing": {
    "DOCX": "mammoth (existing)",
    "XLSX": "xlsx (SheetJS)",
    "PDF": "pdf-parse",
    "OCR": "tesseract.js (future)"
  },
  "MCP": "Model Context Protocol SDK (future)"
}
```

**Installation:**
```bash
# Core AI
npm install ai @ai-sdk/anthropic @ai-sdk/openai

# UI Components (via shadcn)
npx shadcn add ai-elements

# Document processing
npm install xlsx pdf-parse

# RAG (Phase 3)
npm install @langchain/anthropic @langchain/openai langchain

# MCP (Phase 3)
npm install @modelcontextprotocol/sdk
```

---

### Why This Stack?

**1. Vercel AI SDK**
- ✅ Perfect for Next.js (our framework)
- ✅ Provider portability (no vendor lock-in)
- ✅ Active development (Vercel backing)
- ✅ Built-in streaming + React hooks
- ✅ TypeScript-first

**2. Claude Sonnet 4.5**
- ✅ Best for long-form writing
- ✅ 200K context window (can see entire notes)
- ✅ Excellent instruction-following
- ✅ Strong tool use
- ✅ Reasonable cost ($3/$15 per 1M tokens)

**3. AI Elements**
- ✅ Matches our design system (shadcn/ui)
- ✅ Production-ready components
- ✅ We own the code (no breaking updates)
- ✅ Understands AI SDK patterns

**4. xlsx for Excel**
- ✅ Industry standard
- ✅ TypeScript support
- ✅ Can extract structured data
- ✅ Active maintenance

**5. LangChain (Optional RAG)**
- ✅ Only add if needed (Phase 3)
- ✅ Best for document search
- ✅ Works with Vercel AI SDK
- ✅ Large community

---

### Architecture Summary

```
┌─────────────────────────────────────────┐
│          UI Layer (React)               │
│  • AI Elements (shadcn-based)           │
│  • useChat hook (Vercel AI SDK)         │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────┴───────────────────────┐
│       API Routes (Next.js)              │
│  • POST /api/ai/chat (streaming SSE)    │
│  • GET /api/ai/conversations            │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────┴───────────────────────┐
│      Service Layer (lib/ai/)            │
│  • Vercel AI SDK (streamText)           │
│  • Context builder (extract note text)  │
│  • Token counter (usage tracking)       │
│  • LangChain (RAG, optional)            │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────┴───────────────────────┐
│         AI Providers                    │
│  • Anthropic Claude API                 │
│  • OpenAI API (fallback)                │
│  • Ollama (future, local)               │
└─────────────────────────────────────────┘
```

---

### Next Steps

1. **Review this document** - Validate technical decisions
2. **Approve tech stack** - Confirm library choices
3. **Update M8-PHASE-2-OVERVIEW.md** - Incorporate research
4. **Begin Phase 2A implementation** - Database schema + API routes
5. **Prototype chat UI** - Test AI Elements components

---

## Sources

**AI SDKs & Libraries:**
- [Vercel AI SDK 6](https://vercel.com/blog/ai-sdk-6)
- [AI SDK Documentation](https://ai-sdk.dev/docs/introduction)
- [LangChain RAG Tutorial 2026](https://langchain-tutorials.github.io/langchain-rag-tutorial-2026/)
- [Assistant UI](https://www.assistant-ui.com/)
- [AI Elements](https://vercel.com/changelog/introducing-ai-elements)

**Model Providers:**
- [Claude vs OpenAI 2026](https://learn.ryzlabs.com/ai-development/comparative-analysis-anthropic-vs-openai-vs-claude-2026)
- [AI SDK Anthropic Provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)

**Document Processing:**
- [xlsx npm package](https://www.npmjs.com/package/xlsx)
- [Azure Document Intelligence](https://azure.microsoft.com/en-us/products/ai-services/ai-document-intelligence)
- [AI Document Analysis](https://anara.com/blog/ai-for-document-analysis)

**Model Context Protocol:**
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [Anthropic MCP Announcement](https://www.anthropic.com/news/model-context-protocol)
- [MCP GitHub](https://github.com/modelcontextprotocol)

**UI/UX Best Practices:**
- [AI Chatbot UX 2026](https://www.letsgroto.com/blog/ux-best-practices-for-ai-chatbots)
- [Best Chatbot UIs](https://www.jotform.com/ai/agents/best-chatbot-ui/)
- [shadcn/ui AI Components](https://www.shadcn.io/ai)
