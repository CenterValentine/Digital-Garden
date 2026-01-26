# M8 Settings Architecture Audit

**Date:** January 24, 2026
**Purpose:** Identify duplications, inconsistencies, and gaps in settings management before M8 implementation
**Scope:** Settings, Preferences, AI Chat, Conversation History

---

## Executive Summary

**Verdict:** 🟡 **MIXED - Good foundation with architectural debt**

**Strengths:**
- ✅ Zustand stores with localStorage persistence (7 stores)
- ✅ Settings UI already exists (`/settings/*` pages)
- ✅ Storage provider configuration system in place
- ✅ Migration system for store versions

**Critical Issues:**
- ❌ **NO unified settings architecture** - Each concern uses different pattern
- ❌ **NO backend persistence for user preferences** - Only localStorage
- ❌ **Inconsistent localStorage usage** - Some via Zustand, some direct
- ❌ **NO settings sync across devices** - All local-only
- ❌ **NO AI/chat infrastructure** - Needs complete buildout

**Recommendation:** Refactor before adding new features. Build unified settings system first.

---

## Current State Analysis

### Layer 1: Frontend State Management

**Zustand Stores (7 total):**

1. **`upload-settings-store.ts`** ✅
   - Purpose: File upload preferences
   - Fields: `uploadMode`, `officeViewerMode`, `onlyofficeServerUrl`
   - Storage: localStorage (`upload-settings` key)
   - Versioning: v3 with migration
   - Pattern: ✅ **GOOD** - Proper Zustand persist pattern

2. **`panel-store.ts`** ✅
   - Purpose: UI layout preferences
   - Fields: Sidebar widths, visibility flags
   - Storage: localStorage (`notes-panel-layout` key)
   - Versioning: v3 with migration
   - Pattern: ✅ **GOOD** - Proper Zustand persist pattern

3. **`content-store.ts`** ⚠️
   - Purpose: Current selection state
   - Fields: `selectedContentId`, `multiSelection`
   - Storage: localStorage + URL params
   - Versioning: None
   - Pattern: ⚠️ **MIXED** - Dual persistence (localStorage + URL)

4. **`search-store.ts`** ✅
   - Purpose: Search preferences
   - Fields: Case sensitivity, regex mode
   - Storage: localStorage
   - Pattern: ✅ **GOOD**

5. **`tree-state-store.ts`** ✅
   - Purpose: Tree expansion state
   - Fields: Expanded node IDs
   - Storage: localStorage
   - Pattern: ✅ **GOOD**

6. **`outline-store.ts`** ❌
   - Purpose: Outline headings
   - Fields: Heading hierarchy, active heading
   - Storage: **NONE** - Ephemeral state only
   - Pattern: ❌ **MISSING** - Should persist activeHeading

7. **`editor-stats-store.ts`** ❌ **NEW (Jan 24)**
   - Purpose: Editor statistics (word count, etc.)
   - Fields: `fileType`, `wordCount`, `lineCount`, `objectCount`
   - Storage: **NONE** - Ephemeral state only
   - Pattern: ✅ **CORRECT** - Stats should NOT persist

**Direct localStorage Usage (Outside Zustand):**

1. **`RightSidebar.tsx`** ❌
   - Key: `rightSidebarActiveTab`
   - Purpose: Active tab selection
   - Pattern: ❌ **BAD** - Should use Zustand store
   - Issue: Bypasses migration system, no TypeScript safety

2. **`MainPanelContent.tsx`** ⚠️
   - Key: `lastSelectedContentId`
   - Purpose: Last opened note (backup to URL params)
   - Pattern: ⚠️ **ACCEPTABLE** - Fallback only, content-store is primary

**Findings:**
- **Inconsistency #1:** RightSidebar uses direct localStorage, LeftSidebar uses props (no persistence)
- **Inconsistency #2:** Some state persists (panel widths), some doesn't (active tabs)
- **Inconsistency #3:** Mixed patterns: Zustand persist vs direct localStorage

### Layer 2: Backend Persistence

**Database Models:**

1. **`User`** model exists - **NO settings field**
   - Fields: id, username, email, role, timestamps
   - Relations: accounts, sessions, storageConfigs, tags, etc.
   - **MISSING:** `settings` JSON field for user preferences

2. **`StorageProviderConfig`** model exists ✅
   - Fields: provider, config (JSON), credentials (encrypted)
   - Pattern: ✅ **GOOD** - Proper backend persistence

**API Routes:**

1. **Storage config API** ✅ `/api/notes/storage/*`
   - GET, POST, PATCH, DELETE all implemented
   - Pattern: ✅ **GOOD** - Full CRUD

2. **User preferences API** ❌ **MISSING**
   - No `/api/user/preferences` route
   - No `/api/user/settings` route
   - Issue: Can't sync settings across devices

**Findings:**
- **Gap #1:** No backend persistence for UI preferences (panel widths, upload mode, etc.)
- **Gap #2:** No settings API routes
- **Gap #3:** No cross-device sync capability
- **Gap #4:** Settings only in localStorage (lost on browser clear, device switch)

### Layer 3: Settings UI

**Existing Pages:**

1. **`/settings`** - Settings index ✅
2. **`/settings/general`** - General settings page ✅
3. **`/settings/account`** - Account settings ✅
4. **`/settings/storage`** - Storage providers (3 tabs) ✅
5. **`/settings/preferences`** - File viewer preferences ✅
6. **`/settings/api`** - API settings ✅
7. **`/settings/mcp`** - MCP settings ✅

**Findings:**
- **Good:** Settings UI infrastructure exists
- **Issue:** No unified settings store backing these pages
- **Issue:** Each page manages state differently
- **Issue:** No "save" confirmation across pages

---

## AI Chat & Conversation Architecture Gap Analysis

**Current State:** ❌ **NOTHING EXISTS**

**What's Missing:**

### 1. Database Schema ❌

No tables for AI conversations:
```prisma
// MISSING: AIConversation model
// MISSING: AIMessage model
// MISSING: AI context tracking
```

### 2. AI API Routes ❌

No API infrastructure:
```
MISSING: /api/ai/chat
MISSING: /api/ai/conversations
MISSING: /api/ai/context
MISSING: /api/ai/suggestions
```

### 3. AI State Management ❌

No Zustand stores:
```
MISSING: ai-chat-store.ts
MISSING: conversation-store.ts
MISSING: ai-settings-store.ts
```

### 4. AI UI Components ❌

No chat interface:
```
MISSING: AIChat.tsx
MISSING: AIChatPanel.tsx
MISSING: AIMessage.tsx
MISSING: AIActionSuggestion.tsx
```

### 5. Tool Belt Integration ⚠️

**Partial:** Tool belt architecture exists (created Jan 24), but no AI providers:
```
EXISTS: ToolBelt.tsx ✅
EXISTS: json-provider.tsx ✅
MISSING: markdown-ai-provider.tsx ❌
MISSING: code-ai-provider.tsx ❌
```

---

## Critical Architectural Issues

### Issue #1: No Unified Settings System

**Problem:** Each store operates independently

**Current Pattern:**
```
upload-settings-store.ts   → localStorage only
panel-store.ts             → localStorage only
search-store.ts            → localStorage only
User model                 → Database only (no settings field)
StorageProviderConfig      → Database only
```

**Impact:**
- ❌ Settings lost on browser clear
- ❌ No cross-device sync
- ❌ No server-side defaults
- ❌ Inconsistent migration strategies
- ❌ Hard to add new settings

**Recommended Pattern:**
```
Frontend Store (Zustand) ←→ API Route ←→ Database (User.settings JSON)
        ↓
   localStorage (cache only)
```

### Issue #2: Inconsistent localStorage Keys

**Current Keys:**
```
upload-settings               // Zustand persist
notes-panel-layout            // Zustand persist
rightSidebarActiveTab         // Direct access ❌
lastSelectedContentId         // Direct access (fallback)
tree-state                    // Zustand persist
search-state                  // Zustand persist
```

**Problem:** No naming convention, mix of patterns

**Recommendation:** Standardize to `notes:{feature}:{setting}` format

### Issue #3: No Settings Migration Strategy

**Current State:**
- Each store has own version number
- No coordinated migrations
- No way to migrate between major app versions

**Recommendation:** Global settings version with coordinated migrations

### Issue #4: Settings Scattered Across Concerns

**Current State:**
```
Upload settings    → upload-settings-store.ts
UI layout          → panel-store.ts
Search prefs       → search-store.ts
Tree state         → tree-state-store.ts
Right sidebar tab  → Direct localStorage ❌
```

**Problem:** No single source of truth

**Recommendation:** Unified settings store with sections

---

## Recommended Architecture (M8)

### Phase 1: Unified Settings System

**Database Schema:**
```prisma
model User {
  id             String  @id @default(uuid())
  // ... existing fields ...

  // NEW: Unified settings JSON
  settings       Json?   @db.JsonB
  settingsVersion Int    @default(1)

  // ... existing relations ...
}
```

**Settings Structure:**
```typescript
interface UserSettings {
  version: number;

  // UI Preferences
  ui: {
    panelLayout: {
      leftSidebarWidth: number;
      leftSidebarVisible: boolean;
      rightSidebarWidth: number;
      rightSidebarVisible: boolean;
      rightSidebarActiveTab: string;
    };
    theme: "light" | "dark" | "system";
    fontSize: number;
  };

  // File Handling
  files: {
    uploadMode: "automatic" | "manual";
    officeViewerMode: "google-docs" | "onlyoffice" | "microsoft-viewer";
    onlyofficeServerUrl: string | null;
  };

  // Search Preferences
  search: {
    caseSensitive: boolean;
    useRegex: boolean;
    defaultFilters: string[];
  };

  // AI Settings
  ai: {
    enabled: boolean;
    model: "claude-opus-4" | "claude-sonnet-3-5" | "gpt-4";
    conversationHistory: boolean;
    contextWindow: number;
  };

  // Editor Preferences
  editor: {
    autoSave: boolean;
    autoSaveDelay: number;
    spellCheck: boolean;
  };
}
```

**Zustand Store Pattern:**
```typescript
// stores/settings-store.ts
export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      // Sync with backend
      syncWithBackend: async () => {
        const response = await fetch("/api/user/settings");
        const data = await response.json();
        set(data.settings);
      },

      // Save to backend
      saveToBackend: async () => {
        const settings = get();
        await fetch("/api/user/settings", {
          method: "PATCH",
          body: JSON.stringify({ settings }),
        });
      },

      // Individual setters
      setUIPreferences: (ui) => {
        set({ ui });
        get().saveToBackend(); // Auto-save
      },

      // ... more setters
    }),
    {
      name: "notes:settings",
      version: 1,
      // localStorage as cache only
    }
  )
);
```

**API Routes:**
```
GET    /api/user/settings           # Fetch all settings
PATCH  /api/user/settings           # Update settings (partial)
POST   /api/user/settings/reset     # Reset to defaults
GET    /api/user/settings/export    # Export settings JSON
POST   /api/user/settings/import    # Import settings JSON
```

### Phase 2: AI Chat Architecture

**Database Schema:**
```prisma
model AIConversation {
  id          String      @id @default(uuid())
  userId      String      @db.Uuid
  contentId   String?     @db.Uuid  // Optional: tied to specific note
  title       String?     @db.VarChar(200)
  context     Json?       @db.JsonB  // File context, metadata
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  user        User        @relation(fields: [userId])
  content     ContentNode? @relation(fields: [contentId])
  messages    AIMessage[]

  @@index([userId, createdAt(sort: Desc)])
  @@index([contentId])
}

model AIMessage {
  id               String         @id @default(uuid())
  conversationId   String         @db.Uuid
  role             AIMessageRole  // "user" | "assistant" | "system"
  content          String         @db.Text
  tokens           Int?
  model            String?        @db.VarChar(50)
  createdAt        DateTime       @default(now())

  conversation     AIConversation @relation(fields: [conversationId])

  @@index([conversationId, createdAt])
}

enum AIMessageRole {
  user
  assistant
  system
}
```

**Zustand Store:**
```typescript
// stores/ai-chat-store.ts
interface AIChatStore {
  // Current conversation
  activeConversationId: string | null;
  messages: AIMessage[];
  isStreaming: boolean;

  // Context
  currentFileContext: FileContext | null;

  // Actions
  startConversation: (fileContext?: FileContext) => Promise<string>;
  sendMessage: (content: string) => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  clearConversation: () => void;

  // Suggestions
  getSuggestions: () => Promise<AISuggestion[]>;
}
```

**API Routes:**
```
POST   /api/ai/chat                           # Send message, get response
GET    /api/ai/conversations                  # List user's conversations
GET    /api/ai/conversations/[id]             # Get specific conversation
POST   /api/ai/conversations                  # Create new conversation
DELETE /api/ai/conversations/[id]             # Delete conversation
GET    /api/ai/conversations/[id]/messages    # Get messages
POST   /api/ai/suggestions                    # Get AI suggestions for current file
GET    /api/ai/settings                       # Get AI configuration
PATCH  /api/ai/settings                       # Update AI config
```

**Component Architecture:**
```
RightSidebar (existing)
  ├─ RightSidebarHeader
  │   └─ Tab: "chat" (NEW)
  │
  └─ RightSidebarContent
      └─ AIChatPanel (NEW)
          ├─ ConversationHistory
          ├─ MessageList
          │   └─ AIMessage (user/assistant bubbles)
          ├─ AISuggestions
          │   └─ ActionSuggestionCard
          └─ ChatInput
              └─ SendButton
```

---

## Migration Strategy

### Step 1: Create Unified Settings Schema (Week 1)

1. Add `settings` JSON field to User model
2. Create migration to add field
3. Create settings validation schema (Zod)
4. Build settings API routes (GET, PATCH, reset)

### Step 2: Migrate Existing Stores (Week 1)

1. Create unified `settings-store.ts`
2. Migrate data from individual stores:
   - `upload-settings-store` → `settings.files.*`
   - `panel-store` → `settings.ui.panelLayout.*`
   - `search-store` → `settings.search.*`
3. Add backend sync logic
4. Test migration with existing users

### Step 3: Fix Inconsistencies (Week 1)

1. Move `RightSidebar` tab state to unified store
2. Remove direct localStorage access
3. Standardize localStorage keys
4. Add settings versioning

### Step 4: Build AI Infrastructure (Week 2-3)

1. Create AI database schema (Conversation, Message)
2. Build AI API routes (chat, conversations, suggestions)
3. Create AI chat stores
4. Build AI chat UI components
5. Integrate with tool belt

### Step 5: AI Tool Belt Integration (Week 3)

1. Add `markdown-ai-provider.tsx`
2. Add `json-ai-provider.tsx`
3. Add `code-ai-provider.tsx`
4. Add "Ask AI" action to all providers
5. Wire AI button to open chat panel

---

## Success Criteria

**Phase 1 Complete When:**
- ✅ All settings stored in unified `User.settings` JSON field
- ✅ All settings accessible via `/api/user/settings` API
- ✅ Settings sync across devices
- ✅ No direct localStorage access (except as cache)
- ✅ Unified settings UI with save confirmation
- ✅ Migration from old stores completed

**Phase 2 Complete When:**
- ✅ AI conversations persist in database
- ✅ Chat interface accessible from tool belt
- ✅ AI provides context-aware suggestions
- ✅ Conversation history searchable
- ✅ Token usage tracked and displayed
- ✅ AI settings configurable in `/settings/ai`

---

## Risk Assessment

**High Risk:**
- **Data Loss:** Migrating localStorage to backend without proper backups
- **Breaking Changes:** Changing store structure breaks existing deployments
- **API Costs:** Uncontrolled AI usage could incur high API costs

**Mitigation:**
- Create backup/export before migration
- Version stores properly with fallbacks
- Implement token limits and usage tracking from day 1

---

## Conclusion

**Current Settings Architecture: 🟡 5/10**

**Strengths:**
- Good use of Zustand with persist
- Settings UI pages exist
- Storage config system works well

**Weaknesses:**
- No backend persistence for preferences
- Inconsistent patterns (Zustand vs direct localStorage)
- No cross-device sync
- No AI infrastructure exists

**Recommendation:**
1. **Pause new feature development**
2. **Refactor settings architecture first** (Week 1)
3. **Then build AI on solid foundation** (Week 2-3)

Building AI chat on top of current settings architecture will create more debt. Fix the foundation first, then add intelligence layer.

**Next Steps:** Create detailed implementation plan for unified settings system (see M8-UNIFIED-SETTINGS-IMPLEMENTATION.md)
