# M10 ↔ M11 Swap - Summary

**Date:** January 25, 2026
**Action:** Swapped M10 (AI) and M11 (Editor) in roadmap
**Reason:** Build editor foundation before AI integration

---

## What Changed

### Before

**M10:** AI Chat Integration
**M11:** Templates & Command Palette

### After

**M10:** Advanced TipTap Editor Features (NEW!)
**M11:** AI Chat Integration (renamed from M10)
**M12:** Templates & Command Palette (renamed from M11)

---

## Why the Swap Makes Sense

`★ Insight ─────────────────────────────────────`
**Strategic Advantages:**
1. **AI needs structure** - Content extraction API gives AI better context
2. **Templates first** - Template system enables AI-powered templates
3. **Performance matters** - Large documents must work before adding AI
4. **Clean architecture** - Plugin system lets AI hook in cleanly
5. **Foundation first** - Build strong editor, then add AI intelligence
`─────────────────────────────────────────────────`

### M10 Enables M11

**M10 provides:**
- Content extraction API (structured content for AI)
- Track changes extension (AI suggestions as tracked changes)
- Template system (AI generates templates)
- Plugin architecture (AI hooks into editor commands)
- Performance optimizations (handle large AI-generated content)

**M11 uses:**
```typescript
// In AI chat (M11)
import { ContentExtractor } from '@/lib/domain/editor/content-extraction';

const extracted = ContentExtractor.extractAll(editor.getJSON());
const aiContext = ContentExtractor.formatForAI(extracted);

// AI now has structured context!
```

---

## New M10: Advanced TipTap Editor Features

**Document:** [M10-ADVANCED-EDITOR.md](./M10-ADVANCED-EDITOR.md)

### Phase 1: Core Extensions (Week 1)
- 📝 Comments & suggestions (Google Docs-style)
- 🎨 Enhanced callouts (custom icons, collapsible)
- 🏗️ Custom node architecture

### Phase 2: Advanced Features (Week 2)
- 📋 Template system with variables
- 🎯 Enhanced tables (sorting, styling, header rows/columns)
- 🔗 Link previews with Open Graph

### Phase 3: Architecture & Performance (Week 3)
- 🤖 Content extraction API (for AI)
- 🔌 Plugin system
- ⚡ Performance optimizations (debouncing, virtual scrolling)

### Key Features

**Comments System:**
```typescript
editor.commands.addComment({
  userId: user.id,
  username: user.name,
  content: "Great point!",
  position: { from: 10, to: 50 },
});
```

**Track Changes:**
```typescript
editor.commands.setMark('suggestion', {
  suggestionType: 'insert',
  userId: user.id,
  username: user.name,
});

// Accept or reject
editor.commands.acceptSuggestion(suggestionId);
editor.commands.rejectSuggestion(suggestionId);
```

**Template System:**
```typescript
const template = {
  name: 'Meeting Notes',
  variables: [
    { key: 'meetingTitle', label: 'Meeting Title', type: 'text', required: true },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'attendees', label: 'Attendees', type: 'multiline', required: false },
  ],
  content: tiptapJson,
};

// Insert with values
TemplateSystem.insertTemplate(editor, template, {
  meetingTitle: 'Q1 Planning',
  date: '2026-01-28',
  attendees: 'Alice, Bob, Charlie',
});
```

**Content Extraction (for AI):**
```typescript
const extracted = ContentExtractor.extractAll(editor.getJSON());

// Returns:
{
  text: "Full plain text...",
  structure: {
    headings: [{ level: 1, text: "Introduction", position: 0 }],
    tables: [{ headers: [...], rows: [[...]] }],
    codeBlocks: [{ language: 'typescript', code: '...' }],
    callouts: [{ type: 'warning', content: '...' }],
    links: [{ href: '...', text: '...' }],
  },
  metadata: {
    wordCount: 1234,
    estimatedReadingTime: 6,
    topics: ['Introduction', 'Methods', 'Results'],
  }
}

// Format for AI
const aiContext = ContentExtractor.formatForAI(extracted);
// Returns markdown-formatted content perfect for AI
```

**Plugin System:**
```typescript
const myPlugin: EditorPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  extensions: [CustomExtension],
  commands: {
    myCommand: () => { /* ... */ },
  },
  keyboardShortcuts: {
    'Mod-Shift-x': () => editor.commands.myCommand(),
  },
};

pluginManager.register(myPlugin);
```

---

## Updated Roadmap

### M9: Type System Refactor + New Content Types (In Progress)
- ✅ Phase 1: ContentType discriminant (complete)
- ⏳ Phase 2: ExternalPayload (40% complete) + FolderPayload (pending) + 5 stub viewers

### M10: Advanced TipTap Editor Features (NEW!)
- Comments & suggestions
- Templates with variables
- Enhanced tables & links
- Content extraction API
- Plugin system
- Performance optimizations

### M11: AI Chat Integration (formerly M10)
- Uses M10's content extraction API
- Uses M10's track changes for suggestions
- Uses M10's template system
- Uses M10's plugin architecture

### M12: Templates & Command Palette (formerly M11)
- Uses M10's template system
- Command palette integrates with M10 plugins
- Quick actions for templates

### M13-M17: Other Features
- Collaboration, Performance, Advanced Content Types, Mobile, Testing, Offline

---

## Database Changes (M10)

### New Table: Template

```prisma
model Template {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  name        String   @db.VarChar(200)
  description String?  @db.Text
  category    String   @db.VarChar(50)
  content     Json     @db.JsonB // TipTap JSON
  variables   Json     @default("[]") @db.JsonB
  isPublic    Boolean  @default(false)
  usageCount  Int      @default(0)
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, category])
  @@index([isPublic, usageCount(sort: Desc)])
}
```

### API Endpoints

```
GET    /api/content/templates              # List templates
POST   /api/content/templates              # Create template
GET    /api/content/templates/[id]         # Get specific template
PATCH  /api/content/templates/[id]         # Update template
DELETE /api/content/templates/[id]         # Delete template
```

---

## Implementation Order

### Immediate: Complete M9 (~3 weeks)
- FolderPayload (5 view modes)
- 5 stub payload viewers (Chat, Viz, Data, Hope, Workflow)

### Next: M10 Advanced Editor (3 weeks)
- Week 1: Comments, suggestions, custom nodes
- Week 2: Templates, enhanced tables, link previews
- Week 3: Content extraction API, plugin system, performance

### Then: M11 AI Chat (3 weeks)
- Week 1: Core infrastructure (database, streaming API)
- Week 2: Document analysis (Excel/DOCX processing)
- Week 3: Polish (conversation management, settings UI)

### Finally: M12 Templates & Command Palette (2 weeks)
- Command palette UI
- Template catalog
- Quick actions
- Keyboard shortcuts

**Total Timeline:** ~11 weeks from M9 completion

---

## Key Benefits of the Swap

### 1. Better AI Context

**Before (M10 as AI):**
- AI gets raw text from TipTap JSON
- No structure, just plain text
- Hard to understand document organization

**After (M10 as Editor with extraction API):**
- AI gets headings, lists, tables, code blocks
- Structured metadata (word count, topics)
- Much better context understanding

### 2. AI-Powered Templates

**Before:**
- AI can't generate templates (no system exists)
- Templates come later in M11

**After:**
- M10 builds template system
- M11 AI can generate templates using M10's system
- Users get AI-generated meeting notes, project plans, etc.

### 3. Tracked AI Suggestions

**Before:**
- AI inserts content directly
- No way to accept/reject AI changes

**After:**
- M10 builds track changes system
- M11 AI inserts as "suggestions"
- Users can accept/reject AI edits

### 4. Clean Plugin Architecture

**Before:**
- AI bolted on to editor
- Hard to extend or customize

**After:**
- M10 builds plugin system
- M11 AI is a plugin
- Community can build AI extensions

### 5. Performance First

**Before:**
- AI might struggle with large documents
- No optimizations in place

**After:**
- M10 optimizes for large documents
- M11 AI works smoothly even on 10K+ word docs
- Virtual scrolling, debouncing ready

---

## File Changes

### Renamed
- `docs/notes-feature/M10-AI-CHAT-INTEGRATION.md` → `M11-AI-CHAT-INTEGRATION.md`

### Created
- `docs/notes-feature/M10-ADVANCED-EDITOR.md` (NEW - comprehensive plan)
- `docs/notes-feature/M10-M11-SWAP-SUMMARY.md` (this file)

### Updated
- `docs/notes-feature/IMPLEMENTATION-STATUS.md` (swapped M10 and M11 sections)

### Unchanged
- `docs/notes-feature/M8-AI-INTEGRATION-RESEARCH.md` (still applies to M11)
- `docs/notes-feature/M8-PHASE-2-OVERVIEW.md` (still applies to M11)
- `docs/notes-feature/M10-ROADMAP-UPDATE-SUMMARY.md` (historical reference)

---

## Visual Roadmap

```
M9 (In Progress)
  ├─ Phase 1: ContentType discriminant ✅
  └─ Phase 2: ExternalPayload + FolderPayload + 5 stubs ⏳

      ↓

M10: Advanced TipTap Editor (NEW!)
  ├─ Week 1: Comments, suggestions, custom nodes
  ├─ Week 2: Templates, tables, link previews
  └─ Week 3: Content extraction, plugins, performance
      ↓ (provides structured content API)

M11: AI Chat Integration
  ├─ Week 1: Database, streaming API, basic UI
  ├─ Week 2: Document analysis (uses M10's extraction)
  └─ Week 3: Conversation management, settings
      ↓ (uses M10's template system)

M12: Templates & Command Palette
  ├─ Week 1: Command palette UI
  └─ Week 2: Template catalog, quick actions
      ↓

M13-M17: Advanced Features
  └─ Collaboration, Performance, Content Types, Mobile, Testing, Offline
```

---

## Next Steps

### For User
1. ✅ Review M10-ADVANCED-EDITOR.md
2. ✅ Approve the swap rationale
3. ✅ Complete M9 first (~3 weeks)
4. Start M10 implementation

### For Implementation
1. **M10 Phase 1 Kickoff:**
   - Set up comments extension
   - Build track changes mark
   - Create enhanced callout with UI

2. **M10 Database:**
   - Create Template table migration
   - Build template API routes
   - Test template system

3. **M10 Architecture:**
   - Build content extraction API
   - Create plugin system
   - Add performance optimizations

---

## Success Metrics

**M10 Complete When:**
- [ ] Comments work (add, resolve, delete)
- [ ] Track changes work (suggest, accept, reject)
- [ ] Templates work (create, insert, variables)
- [ ] Content extraction returns structured data
- [ ] Plugin system allows extensions
- [ ] Performance handles 10K+ word documents

**M11 Benefits From M10:**
- [ ] AI gets structured content (not just text)
- [ ] AI suggestions appear as tracked changes
- [ ] AI generates templates using template system
- [ ] AI integrates via plugin architecture

---

**Status:** ✅ Swap complete! M10 (Editor) → M11 (AI) makes architectural sense.

**Next:** Complete M9, then begin M10 Advanced Editor implementation! 🚀
