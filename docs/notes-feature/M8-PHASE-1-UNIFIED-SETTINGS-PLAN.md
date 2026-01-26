# M8 Phase 1: Unified Settings System - Implementation Plan

**Date:** January 24, 2026
**Priority:** HIGH - Foundation for all M8 work
**Estimated Duration:** 3-5 days
**Dependencies:** None (foundational work)

---

## Executive Summary

Build a unified settings system that:
1. **Stores user preferences in database** (cross-device sync)
2. **Maintains localStorage as fast cache** (instant load)
3. **Provides single API** for all settings access
4. **Supports graceful migration** from existing stores
5. **Enables future AI settings** without schema changes

**Key Principle:** Use PostgreSQL JSONB for settings - flexible, queryable, migration-friendly.

---

## Database Analysis: Current State

### User Model Status

**Current User Model:**
```prisma
model User {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  username       String   @unique @db.VarChar(50)
  passwordHash   String?  @db.Char(60)
  email          String   @unique @db.VarChar(255)
  role           UserRole @default(guest)
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @db.Timestamptz(6)

  // Relations
  accounts       Account[]
  categories     Category[]
  contentHistory ContentHistory[]
  contentNodes   ContentNode[]
  sessions       Session[]
  storageConfigs StorageProviderConfig[]  // ← Settings pattern already exists!
  tags           Tag[]
  trashedContent TrashBin[]
  viewGrants     ViewGrant[]
}
```

**Key Observation:** ✅ **NO `settings` field exists - clean slate**

### Existing Settings Pattern (Reference)

**StorageProviderConfig Model:**
```prisma
model StorageProviderConfig {
  id          String          @id @default(uuid()) @db.Uuid
  userId      String          @db.Uuid
  provider    StorageProvider
  isDefault   Boolean         @default(false)
  displayName String?         @db.VarChar(100)
  config      Json            // ← JSONB pattern already proven
  isActive    Boolean         @default(true)
  createdAt   DateTime        @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime        @updatedAt @db.Timestamptz(6)
  user        User            @relation(fields: [userId])

  @@unique([userId, provider])
  @@index([userId, isDefault])
}
```

**Why This Matters:**
- ✅ JSONB `config` field already in use
- ✅ Pattern validated and working
- ✅ Team familiar with this approach
- ✅ Can follow same migration strategy

---

## Proposed Database Schema

### Option A: Single JSONB Field (RECOMMENDED)

**Pros:**
- ✅ Simple, single migration
- ✅ Flexible schema (add new settings without migrations)
- ✅ PostgreSQL JSONB queryable and indexable
- ✅ Matches existing `StorageProviderConfig.config` pattern
- ✅ Easy rollback (just drop column)

**Cons:**
- ⚠️ Can't enforce field-level constraints
- ⚠️ Requires validation in application layer

**Schema Change:**
```prisma
model User {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  // ... existing fields ...

  // NEW: Settings storage (JSONB)
  settings       Json?    @db.JsonB  // Optional - null for users who haven't customized
  settingsVersion Int     @default(1) // For future migrations

  // ... existing relations ...
}
```

**Migration:**
```sql
-- Migration: add_user_settings
ALTER TABLE "User"
  ADD COLUMN "settings" JSONB,
  ADD COLUMN "settingsVersion" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "User_settings_gin" ON "User" USING GIN ("settings");
```

**Settings JSON Structure:**
```typescript
interface UserSettings {
  version: number; // 1

  ui?: {
    theme?: "light" | "dark" | "system";
    fontSize?: number;
    panelLayout?: {
      leftSidebarWidth?: number;
      leftSidebarVisible?: boolean;
      rightSidebarWidth?: number;
      rightSidebarVisible?: boolean;
      rightSidebarActiveTab?: string;
      statusBarVisible?: boolean;
    };
  };

  files?: {
    uploadMode?: "automatic" | "manual";
    officeViewerMode?: "google-docs" | "onlyoffice" | "microsoft-viewer";
    onlyofficeServerUrl?: string | null;
  };

  search?: {
    caseSensitive?: boolean;
    useRegex?: boolean;
    defaultFilters?: string[];
  };

  editor?: {
    autoSave?: boolean;
    autoSaveDelay?: number;
    spellCheck?: boolean;
    wordWrap?: boolean;
  };

  ai?: {
    enabled?: boolean;
    model?: "claude-opus-4" | "claude-sonnet-3-5" | "gpt-4";
    conversationHistory?: boolean;
    contextWindow?: number;
    monthlyTokenQuota?: number;
    tokensUsedThisMonth?: number;
    autoSuggest?: boolean;
    privacyMode?: "full" | "minimal" | "none";
  };
}
```

### Option B: Separate Settings Table

**Pros:**
- ✅ Cleaner separation of concerns
- ✅ Can add indexes per setting type
- ✅ Easier to query specific settings

**Cons:**
- ❌ More complex (extra table, extra queries)
- ❌ Overkill for this use case
- ❌ Two migrations instead of one

**Schema (NOT RECOMMENDED):**
```prisma
model UserSettings {
  id        String   @id @default(uuid())
  userId    String   @unique @db.Uuid
  settings  Json     @db.JsonB
  version   Int      @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId])
}
```

### Option C: Individual Columns

**Pros:**
- ✅ Type safety at database level
- ✅ Easy to query and index

**Cons:**
- ❌ 20+ new columns on User table
- ❌ Migration nightmare for every new setting
- ❌ Not flexible for AI settings expansion
- ❌ Schema bloat

**Example (NOT RECOMMENDED):**
```prisma
model User {
  // ... existing ...
  theme                  String?  @db.VarChar(20)
  fontSize               Int?     @default(14)
  leftSidebarWidth       Int?     @default(200)
  leftSidebarVisible     Boolean? @default(true)
  // ... 15 more columns ... ❌ NO!
}
```

---

## Recommendation: Option A (Single JSONB Field)

**Why:**
1. **Migration-friendly:** One column, one migration, easy rollback
2. **Flexible:** Add AI settings later without schema changes
3. **Proven pattern:** Matches `StorageProviderConfig.config`
4. **PostgreSQL optimized:** JSONB is native, queryable, indexable
5. **Future-proof:** Can evolve settings structure without migrations

**Risk Mitigation:**
- Use Zod validation schemas in application layer
- Create TypeScript types for all settings
- Add `settingsVersion` for future migrations
- GIN index for JSONB queries if needed

---

## Migration Strategy

### Step 1: Database Migration

**File:** `prisma/migrations/20260124_add_user_settings/migration.sql`

```sql
-- Add settings columns to User table
ALTER TABLE "User"
  ADD COLUMN "settings" JSONB,
  ADD COLUMN "settingsVersion" INTEGER NOT NULL DEFAULT 1;

-- Optional: Add GIN index for JSONB queries (if we need to query inside settings)
-- CREATE INDEX "User_settings_gin" ON "User" USING GIN ("settings");

-- Set default empty settings for existing users (optional)
-- UPDATE "User" SET "settings" = '{}'::jsonb WHERE "settings" IS NULL;
```

**Run Migration:**
```bash
cd apps/web
npx prisma migrate dev --name add_user_settings
npx prisma generate
```

### Step 2: Update Prisma Schema

**File:** `apps/web/prisma/schema.prisma`

```prisma
model User {
  id              String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  username        String                  @unique @db.VarChar(50)
  passwordHash    String?                 @db.Char(60)
  email           String                  @unique @db.VarChar(255)
  role            UserRole                @default(guest)

  // NEW: Settings storage
  settings        Json?                   @db.JsonB
  settingsVersion Int                     @default(1)

  createdAt       DateTime                @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime                @updatedAt @db.Timestamptz(6)

  // Relations (unchanged)
  accounts        Account[]
  categories      Category[]
  contentHistory  ContentHistory[]
  contentNodes    ContentNode[]
  sessions        Session[]
  storageConfigs  StorageProviderConfig[]
  tags            Tag[]
  trashedContent  TrashBin[]
  viewGrants      ViewGrant[]

  @@index([email])
}
```

### Step 3: Create Validation Schema

**File:** `apps/web/lib/settings/validation.ts`

```typescript
import { z } from "zod";

// UI Settings
const uiSettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  fontSize: z.number().min(10).max(24).optional(),
  panelLayout: z.object({
    leftSidebarWidth: z.number().min(200).max(600).optional(),
    leftSidebarVisible: z.boolean().optional(),
    rightSidebarWidth: z.number().min(200).max(600).optional(),
    rightSidebarVisible: z.boolean().optional(),
    rightSidebarActiveTab: z.string().optional(),
    statusBarVisible: z.boolean().optional(),
  }).optional(),
}).optional();

// File Settings
const fileSettingsSchema = z.object({
  uploadMode: z.enum(["automatic", "manual"]).optional(),
  officeViewerMode: z.enum(["google-docs", "onlyoffice", "microsoft-viewer"]).optional(),
  onlyofficeServerUrl: z.string().url().nullable().optional(),
}).optional();

// Search Settings
const searchSettingsSchema = z.object({
  caseSensitive: z.boolean().optional(),
  useRegex: z.boolean().optional(),
  defaultFilters: z.array(z.string()).optional(),
}).optional();

// Editor Settings
const editorSettingsSchema = z.object({
  autoSave: z.boolean().optional(),
  autoSaveDelay: z.number().min(1000).max(10000).optional(),
  spellCheck: z.boolean().optional(),
  wordWrap: z.boolean().optional(),
}).optional();

// AI Settings (for M8 Phase 2)
const aiSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  model: z.enum(["claude-opus-4", "claude-sonnet-3-5", "gpt-4"]).optional(),
  conversationHistory: z.boolean().optional(),
  contextWindow: z.number().optional(),
  monthlyTokenQuota: z.number().optional(),
  tokensUsedThisMonth: z.number().optional(),
  autoSuggest: z.boolean().optional(),
  privacyMode: z.enum(["full", "minimal", "none"]).optional(),
}).optional();

// Complete Settings Schema
export const userSettingsSchema = z.object({
  version: z.number().default(1),
  ui: uiSettingsSchema,
  files: fileSettingsSchema,
  search: searchSettingsSchema,
  editor: editorSettingsSchema,
  ai: aiSettingsSchema,
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

// Default settings
export const DEFAULT_SETTINGS: UserSettings = {
  version: 1,
  ui: {
    theme: "system",
    fontSize: 14,
    panelLayout: {
      leftSidebarWidth: 200,
      leftSidebarVisible: true,
      rightSidebarWidth: 300,
      rightSidebarVisible: true,
      rightSidebarActiveTab: "backlinks",
      statusBarVisible: true,
    },
  },
  files: {
    uploadMode: "automatic",
    officeViewerMode: "google-docs",
    onlyofficeServerUrl: null,
  },
  search: {
    caseSensitive: false,
    useRegex: false,
    defaultFilters: [],
  },
  editor: {
    autoSave: true,
    autoSaveDelay: 2000,
    spellCheck: true,
    wordWrap: true,
  },
  ai: {
    enabled: true,
    model: "claude-sonnet-3-5",
    conversationHistory: true,
    contextWindow: 4096,
    monthlyTokenQuota: 100000,
    tokensUsedThisMonth: 0,
    autoSuggest: true,
    privacyMode: "full",
  },
};
```

### Step 4: Create Settings Utilities

**File:** `apps/web/lib/settings/utils.ts`

```typescript
import { prisma } from "@/lib/db";
import { userSettingsSchema, DEFAULT_SETTINGS, type UserSettings } from "./validation";

/**
 * Get user settings from database
 * Returns defaults if not set
 */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true, settingsVersion: true },
  });

  if (!user?.settings) {
    return DEFAULT_SETTINGS;
  }

  // Validate and merge with defaults
  const validated = userSettingsSchema.parse(user.settings);
  return mergeWithDefaults(validated);
}

/**
 * Update user settings (partial update)
 */
export async function updateUserSettings(
  userId: string,
  updates: Partial<UserSettings>
): Promise<UserSettings> {
  // Get current settings
  const current = await getUserSettings(userId);

  // Deep merge updates
  const updated = deepMerge(current, updates);

  // Validate
  const validated = userSettingsSchema.parse(updated);

  // Save to database
  await prisma.user.update({
    where: { id: userId },
    data: { settings: validated as any }, // Prisma Json type
  });

  return validated;
}

/**
 * Reset settings to defaults
 */
export async function resetUserSettings(userId: string): Promise<UserSettings> {
  await prisma.user.update({
    where: { id: userId },
    data: { settings: DEFAULT_SETTINGS as any },
  });
  return DEFAULT_SETTINGS;
}

/**
 * Deep merge helper
 */
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Merge with defaults (for missing keys)
 */
function mergeWithDefaults(settings: UserSettings): UserSettings {
  return deepMerge(DEFAULT_SETTINGS, settings);
}
```

### Step 5: Create API Routes

**File:** `apps/web/app/api/user/settings/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getUserSettings, updateUserSettings } from "@/lib/settings/utils";
import { userSettingsSchema } from "@/lib/settings/validation";
import { getCurrentUser } from "@/lib/auth"; // Your auth utility

/**
 * GET /api/user/settings
 * Fetch current user's settings
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const settings = await getUserSettings(user.id);

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("[Settings API] GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch settings",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user/settings
 * Update user settings (partial)
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate partial settings
    const validated = userSettingsSchema.partial().parse(body);

    // Update
    const updated = await updateUserSettings(user.id, validated);

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("[Settings API] PATCH error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update settings",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
```

**File:** `apps/web/app/api/user/settings/reset/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { resetUserSettings } from "@/lib/settings/utils";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/user/settings/reset
 * Reset settings to defaults
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const settings = await resetUserSettings(user.id);

    return NextResponse.json({
      success: true,
      data: settings,
      message: "Settings reset to defaults",
    });
  } catch (error) {
    console.error("[Settings API] Reset error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to reset settings",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
```

### Step 6: Create Unified Zustand Store

**File:** `apps/web/stores/settings-store.ts`

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserSettings } from "@/lib/settings/validation";
import { DEFAULT_SETTINGS } from "@/lib/settings/validation";

interface SettingsStore extends UserSettings {
  // Sync state
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  hasPendingChanges: boolean;

  // Actions
  fetchFromBackend: () => Promise<void>;
  saveToBackend: () => Promise<void>;
  reset: () => Promise<void>;

  // Section updaters (auto-save to backend)
  setUISettings: (ui: Partial<UserSettings["ui"]>) => Promise<void>;
  setFileSettings: (files: Partial<UserSettings["files"]>) => Promise<void>;
  setSearchSettings: (search: Partial<UserSettings["search"]>) => Promise<void>;
  setEditorSettings: (editor: Partial<UserSettings["editor"]>) => Promise<void>;
  setAISettings: (ai: Partial<UserSettings["ai"]>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      // Default state
      ...DEFAULT_SETTINGS,
      isSyncing: false,
      lastSyncedAt: null,
      hasPendingChanges: false,

      // Fetch from backend
      fetchFromBackend: async () => {
        set({ isSyncing: true });
        try {
          const response = await fetch("/api/user/settings");
          const data = await response.json();

          if (data.success) {
            set({
              ...data.data,
              lastSyncedAt: new Date(),
              hasPendingChanges: false,
            });
          }
        } catch (error) {
          console.error("[Settings Store] Fetch failed:", error);
        } finally {
          set({ isSyncing: false });
        }
      },

      // Save to backend
      saveToBackend: async () => {
        const { isSyncing, lastSyncedAt, hasPendingChanges, ...settings } = get();

        set({ isSyncing: true });
        try {
          const response = await fetch("/api/user/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings),
          });

          const data = await response.json();

          if (data.success) {
            set({
              lastSyncedAt: new Date(),
              hasPendingChanges: false,
            });
          }
        } catch (error) {
          console.error("[Settings Store] Save failed:", error);
          set({ hasPendingChanges: true }); // Mark as pending retry
        } finally {
          set({ isSyncing: false });
        }
      },

      // Reset to defaults
      reset: async () => {
        set({ isSyncing: true });
        try {
          const response = await fetch("/api/user/settings/reset", {
            method: "POST",
          });
          const data = await response.json();

          if (data.success) {
            set({
              ...data.data,
              lastSyncedAt: new Date(),
              hasPendingChanges: false,
            });
          }
        } catch (error) {
          console.error("[Settings Store] Reset failed:", error);
        } finally {
          set({ isSyncing: false });
        }
      },

      // Section updaters (with auto-save)
      setUISettings: async (ui) => {
        set((state) => ({
          ui: { ...state.ui, ...ui },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },

      setFileSettings: async (files) => {
        set((state) => ({
          files: { ...state.files, ...files },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },

      setSearchSettings: async (search) => {
        set((state) => ({
          search: { ...state.search, ...search },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },

      setEditorSettings: async (editor) => {
        set((state) => ({
          editor: { ...state.editor, ...editor },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },

      setAISettings: async (ai) => {
        set((state) => ({
          ai: { ...state.ai, ...ai },
          hasPendingChanges: true,
        }));
        await get().saveToBackend();
      },
    }),
    {
      name: "notes:settings",
      version: 1,
      // localStorage as cache only
      // Always fetch from backend on mount
    }
  )
);
```

---

## Migration Path for Existing Stores

### Phase 1: Keep Old Stores Working (Week 1)

**Strategy:** Run both systems in parallel during migration

1. Keep `upload-settings-store.ts` working
2. Add new `settings-store.ts` alongside
3. Create migration utility to copy data

### Phase 2: Gradual Component Migration (Week 1-2)

**Migrate components one by one:**

1. **Upload Settings** → `settings.files.*`
2. **Panel Layout** → `settings.ui.panelLayout.*`
3. **Search Prefs** → `settings.search.*`
4. **Right Sidebar Tab** → `settings.ui.panelLayout.rightSidebarActiveTab`

### Phase 3: Remove Old Stores (Week 2)

Once all components migrated:
1. Delete old store files
2. Remove old localStorage keys
3. Clean up imports

---

## Implementation Checklist

**Database (Day 1):**
- [ ] Add `settings` and `settingsVersion` columns to User model
- [ ] Run Prisma migration
- [ ] Regenerate Prisma client
- [ ] Test migration rollback

**Backend (Day 2):**
- [ ] Create `lib/settings/validation.ts` (Zod schemas)
- [ ] Create `lib/settings/utils.ts` (DB helpers)
- [ ] Create `app/api/user/settings/route.ts` (GET, PATCH)
- [ ] Create `app/api/user/settings/reset/route.ts` (POST)
- [ ] Test API routes with Postman/Thunder Client

**Frontend (Day 3):**
- [ ] Create `stores/settings-store.ts`
- [ ] Test store with mock data
- [ ] Add auto-fetch on app load
- [ ] Add auto-save debouncing (1s delay)

**Migration (Day 4):**
- [ ] Create migration utility for old stores
- [ ] Migrate `upload-settings-store` → `settings.files`
- [ ] Migrate `panel-store` → `settings.ui.panelLayout`
- [ ] Update components to use new store

**Testing (Day 5):**
- [ ] Test settings persistence across page reloads
- [ ] Test cross-device sync (two browsers)
- [ ] Test settings reset functionality
- [ ] Test migration from old stores
- [ ] Performance test (settings load time)

---

## Risks & Mitigation

**Risk 1: Data Loss During Migration**
- **Mitigation:** Keep old stores working until migration complete
- **Backup:** Export current localStorage before migration

**Risk 2: Settings Too Large (JSONB performance)**
- **Mitigation:** Limit settings size (< 100KB)
- **Monitoring:** Log settings size on save

**Risk 3: Concurrent Updates (Multiple Tabs)**
- **Mitigation:** Implement optimistic locking (version check)
- **Fallback:** Last-write-wins with warning toast

**Risk 4: Migration Failure**
- **Mitigation:** Test migration on staging first
- **Rollback:** Can drop columns easily

---

## Success Criteria

**Phase 1 Complete When:**
- ✅ User.settings column exists and working
- ✅ API routes return/update settings correctly
- ✅ Settings store syncs with backend
- ✅ Settings persist across browser sessions
- ✅ Settings sync across devices (test with 2 browsers)
- ✅ Old stores still working (backward compatibility)
- ✅ No data loss during migration

---

## Next Steps After Phase 1

1. **Phase 2:** Add AI conversation infrastructure (uses `settings.ai.*`)
2. **Phase 3:** Complete old store migration, remove deprecated code
3. **Phase 4:** Add settings UI pages for all categories

---

## Open Questions for Review

**1. Database Migration Timing:**
- Run migration immediately or wait for user approval?
- Backward compatibility period duration?

**2. Settings Size Limit:**
- Should we enforce max size (e.g., 100KB)?
- What happens if limit exceeded?

**3. Sync Strategy:**
- Auto-save on every change (current plan)?
- Manual save button required?
- Debounce delay (1s recommended)?

**4. Migration Data Loss:**
- Acceptable to lose localStorage if user hasn't logged in?
- Should we prompt users to "migrate settings" on first login?

**5. AI Settings Defaults:**
- Enable AI by default for all users?
- Default token quota: 100k for free tier?
- Default privacy mode: "full" or "minimal"?

---

## Ready for Your Review

**Key Decision Points:**
1. ✅ Single JSONB column approach (vs separate table)
2. ✅ Auto-save strategy (1s debounce)
3. ✅ Migration strategy (parallel systems)
4. ⏳ AI defaults (your call)
5. ⏳ Sync timing (auto vs manual)

**What needs your input:**
- Approve database schema change
- Confirm migration timeline
- Set AI feature defaults
- Decide on settings size limits

Once approved, I can start implementation immediately.
