# M6 Extension Recommendations - Quick Reference

## Your Questions Answered

### "Which TipTap/Novel extensions should we add to M6?"

Based on your Digital Garden's note-taking focus (Obsidian-inspired), here are my top recommendations ranked by value:

---

## 🔥 TOP 5 - Maximum Impact, Minimal Effort

### 1. **Task Lists** ⭐⭐⭐⭐⭐
**Packages:** `@tiptap/extension-task-list` + `@tiptap/extension-task-item`

**Why it's #1:**
- Essential for note-taking and PKM (Personal Knowledge Management)
- Obsidian's killer feature
- Zero backend work - purely UI
- Markdown syntax: `- [ ]` → checkbox

**Example:**
```
- [x] Complete M5 editor
- [ ] Implement search
- [ ] Add backlinks
```

**Effort:** 🟢 Low (30 minutes)

---

### 2. **Placeholder Extension** ⭐⭐⭐⭐⭐
**Package:** `@tiptap/extension-placeholder`

**Why it's important:**
- Huge UX improvement for empty documents
- Guides users on what to type
- Professional feel
- Zero backend work

**Example:**
- Empty doc: "Start writing or type / for commands..."
- Empty heading: "Heading..."
- Empty code block: "Enter code..."

**Effort:** 🟢 Low (15 minutes)

---

### 3. **Link Extension + Dialog** ⭐⭐⭐⭐⭐
**Package:** `@tiptap/extension-link`

**Why it's critical:**
- External links are core to note-taking
- Cmd+K to add links (familiar UX)
- Auto-detect pasted URLs
- Opens external links in new tab

**You already decided:**
- `[[wiki-link]]` for internal (custom extension)
- `[text](url)` for external (this extension)

**Effort:** 🟡 Medium (1-2 hours including dialog UI)

---

### 4. **Character/Word Count** ⭐⭐⭐⭐
**Package:** `@tiptap/extension-character-count`

**Why it's valuable:**
- Writers love seeing word count
- Reading time estimates
- Shows in status bar
- Zero backend work

**Example Status Bar:**
```
[Search] [Backlinks] [Outline]    512 words · 2,341 characters · ~3 min read
```

**Effort:** 🟢 Low (30 minutes)

---

### 5. **Tables** ⭐⭐⭐⭐
**Packages:** `@tiptap/extension-table` + table-row + table-cell + table-header

**Why it's useful:**
- Structured data in notes
- Comparisons, planning, documentation
- Markdown syntax support
- Obsidian has this

**Example:**
```
| Feature | Status |
|---------|--------|
| Search  | Done   |
| Links   | WIP    |
```

**Effort:** 🟡 Medium (1-2 hours including styling)

---

## 🎯 NICE TO HAVE - Great UX, More Effort

### 6. **Slash Commands** ⭐⭐⭐⭐
**Custom implementation using `@tiptap/suggestion`**

**Why it's cool:**
- Type `/` to show command menu
- `/h1` `/h2` `/code` `/table` `/task`
- Modern editor UX (Notion, Novel)
- Very discoverable

**Effort:** 🔴 High (3-4 hours for menu + commands)

---

### 7. **Bubble Menu** ⭐⭐⭐
**Package:** `@tiptap/extension-bubble-menu`

**Why it's polished:**
- Floating toolbar on text selection
- Quick access to bold, italic, link
- Novel.sh uses this heavily
- Professional feel

**Effort:** 🟡 Medium (2 hours including styling)

---

### 8. **@Mentions** ⭐⭐⭐
**Package:** `@tiptap/extension-mention`

**Why it's interesting:**
- Alternative to `[[wiki-links]]`
- `@note-title` autocomplete
- Could mention users (future collab)

**Note:** You already chose `[[]]` for internal links, so this is lower priority.

**Effort:** 🟡 Medium (2 hours)

---

### 9. **Typography** ⭐⭐
**Package:** `@tiptap/extension-typography`

**Why it's nice:**
- Smart quotes: `"hello"` → `"hello"`
- Em dashes: `--` → `—`
- Ellipsis: `...` → `…`
- Professional text

**Effort:** 🟢 Low (15 minutes)

---

### 10. **Highlight & Color** ⭐⭐
**Packages:** `@tiptap/extension-highlight` + `@tiptap/extension-color`

**Why it's useful:**
- Yellow highlight for important text
- Color-code notes (red = urgent, green = done)
- Annotation support

**Effort:** 🟡 Medium (1-2 hours for color picker UI)

---

## ⏭️ SAVE FOR LATER (M7+)

### Collaboration Extensions
- Real-time editing (Google Docs style)
- Needs Y.js backend + Hocuspocus server
- Complex, save for M8+

### Image Extension
- You already said M7 for file uploads
- Makes sense to do images then

### Focus/Typewriter Mode
- Nice for distraction-free writing
- Lower priority for MVP

---

## 📦 My Recommended M6 Package

### Core Extensions (Must-Have):
```bash
pnpm add @tiptap/extension-task-list \
         @tiptap/extension-task-item \
         @tiptap/extension-placeholder \
         @tiptap/extension-link \
         @tiptap/extension-character-count \
         @tiptap/extension-table \
         @tiptap/extension-table-row \
         @tiptap/extension-table-cell \
         @tiptap/extension-table-header
```

**Total effort:** 4-6 hours
**Value:** 🔥🔥🔥🔥🔥

### Polish Extensions (Nice-to-Have):
```bash
pnpm add @tiptap/suggestion \          # For slash commands
         @tiptap/extension-bubble-menu \
         @tiptap/extension-typography
```

**Total effort:** +4-6 hours
**Value:** 🔥🔥🔥

---

## 🎨 Custom Extensions to Build

### 1. Wiki Link Extension (Must-Have)
**Syntax:** `[[note-slug]]` or `[[slug|Display Text]]`

**Features:**
- Auto-complete as you type
- Click to navigate
- Highlight in editor
- Extract for backlinks

**Effort:** 🔴 High (4-6 hours)
**Value:** 🔥🔥🔥🔥🔥 (Core feature)

### 2. Tag Extension (Nice-to-Have)
**Syntax:** `#tag` or `[[#tag]]`

**Features:**
- Inline hashtag support
- Auto-complete from tag table
- Click to filter by tag

**Effort:** 🟡 Medium (2-3 hours)
**Value:** 🔥🔥🔥

---

## My Recommendation: Phased Approach

### Phase 1: Core Editor Polish (Week 1)
**Focus:** Make the editor feel professional

1. ✅ Placeholder extension (15 min)
2. ✅ Character count (30 min)
3. ✅ Task lists (30 min)
4. ✅ Link extension + dialog (2 hours)

**Total:** ~3-4 hours
**Impact:** Massive UX improvement

### Phase 2: Core M6 Features (Week 2)
**Focus:** Search, backlinks, outline

5. ✅ Selection persistence (1 hour)
6. ✅ Search API + UI (4-6 hours)
7. ✅ Wiki link extension (4-6 hours)
8. ✅ Backlinks extraction (3-4 hours)
9. ✅ Outline real-time updates (2 hours)

**Total:** ~14-19 hours

### Phase 3: Advanced Features (Week 3)
**Focus:** Tables, tags, polish

10. ✅ Tags table + panel (3-4 hours)
11. ✅ Table extension (2 hours)
12. ✅ Typography (15 min)
13. 💡 Slash commands (optional, 4-6 hours)
14. 💡 Bubble menu (optional, 2 hours)

**Total:** ~5-7 hours (core) + 6-8 hours (optional)

---

## Quick Decision Matrix

| Extension | Effort | Value | Priority |
|-----------|--------|-------|----------|
| Task Lists | Low | ⭐⭐⭐⭐⭐ | Must-Have |
| Placeholder | Low | ⭐⭐⭐⭐⭐ | Must-Have |
| Link + Dialog | Med | ⭐⭐⭐⭐⭐ | Must-Have |
| Character Count | Low | ⭐⭐⭐⭐ | Must-Have |
| Tables | Med | ⭐⭐⭐⭐ | Should-Have |
| Wiki Links (custom) | High | ⭐⭐⭐⭐⭐ | Must-Have |
| Slash Commands | High | ⭐⭐⭐⭐ | Nice-to-Have |
| Bubble Menu | Med | ⭐⭐⭐ | Nice-to-Have |
| Typography | Low | ⭐⭐ | Optional |
| @Mentions | Med | ⭐⭐ | Optional |
| Highlight/Color | Med | ⭐⭐ | Optional |

---

## Your Call: What to Include in M6?

Based on your feedback, I recommend:

### Minimal M6 (Focus on core features):
- Selection persistence
- Search, backlinks, outline
- Wiki links (`[[]]`)
- External links
- Tags table
- **Skip** extra TipTap extensions for now

### Balanced M6 (My recommendation):
- All minimal features +
- Task lists
- Placeholder
- Character count
- Link dialog (Cmd+K)
- Tables

### Maximal M6 (Full-featured):
- All balanced features +
- Slash commands
- Bubble menu
- Typography
- Tag hashtag syntax

**Which approach do you prefer?**

Let me know and I'll adjust the M6 plan accordingly! 🚀
