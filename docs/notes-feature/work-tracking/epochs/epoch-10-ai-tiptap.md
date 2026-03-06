---
epoch: 10
title: AI TipTap
duration: 5 sprints (43-47)
status: planned
theme: AI responses, agent tools, edit highlighting, chat outlines, image generation
---

# Epoch 10: AI TipTap

## Goal
Integrate AI deeply into the TipTap editing experience — rich AI responses, agent-powered text editing tools, human/AI content distinction, chat content outlines, and AI image generation.

## Prerequisites
- Epoch 8 (Editor Stabilization) complete
- Epoch 9 (Editor Enhancements) complete — especially Sprint 37 (images) and Sprint 39 (autofocus)
- Existing AI infrastructure: `lib/domain/ai/` (providers, tools, middleware)

## Sprint Execution Protocol
**Before commencing any sprint**, always ask the user for input before planning and executing — there may be additions or modifications.

---

## Sprint 43: Pretty Bot Response Enhancements

- [ ] **Visual parity with OpenAI/Claude across ALL AI experiences**
  - Chat panel (right sidebar)
  - Side panel chats
  - Inline AI responses
  - All get rich rendering: headers, rich text, code blocks with syntax highlighting, lists, tables, inline code
- [ ] Model-agnostic formatting (works for all providers, fork where needed for best results)
- [ ] Research best practices for state-of-the-art AI chat UX (updatable as trends evolve)

### Key Files
- `components/content/ai/ChatMessage.tsx` — message rendering
- `components/content/ai/ChatPanel.tsx` — sidebar chat
- `components/content/ai/ChatViewer.tsx` — main panel chat

---

## Sprint 44: AI Text-Editing Tools (Agent Integration) — GATED BUILD

**Meticulous, gated approach: each tool is built and tested individually before proceeding to the next.**

- [ ] **Gate 1**: `read_first_chunk` — test: agent reads beginning of document
- [ ] **Gate 2**: `read_next_chunk` — test: agent paginates through document
- [ ] **Gate 3**: `read_previous_chunk` — test: agent navigates backward
- [ ] **Gate 4**: `apply_diff` — test: agent makes targeted edits with before/after matching
- [ ] **Gate 5**: `replace_document` — test: agent replaces entire document content
- [ ] **Gate 6**: `plan` — test: agent generates step-by-step markdown plans
- [ ] **Gate 7**: `ask_user` — test: agent prompts user for clarification mid-task
- [ ] **Gate 8**: `finish_with_summary` — test: agent completes task with summary
- [ ] Built-in commands: summarize, rephrase, translate (with streaming)
- [ ] Tab-triggered autocompletion
- [ ] Bubble menu AI integration (AI writing tools button)
- [ ] Meld with existing `lib/domain/ai/` — no infrastructure duplication

### References
- https://tiptap.dev/docs/content-ai/capabilities/agent/custom-llms/overview
- https://tiptap.dev/docs/content-ai/capabilities/agent/custom-llms/get-started
- https://tiptap.dev/docs/content-ai/capabilities/agent/custom-llms/tools

### Key Files
- `lib/domain/ai/tools/registry.ts` — extend with editor tools
- `lib/domain/ai/tools/metadata.ts` — client-safe tool metadata
- `components/content/editor/BubbleMenu.tsx` — AI tools button
- `app/api/ai/chat/route.ts` — tool execution

---

## Sprint 45: AI Edit Highlighting + AI Image Insert

- [ ] Mark content as human vs machine generated (background/highlighting)
- [ ] Copy/paste outside app: AI formatting stripped
- [ ] Copy/paste within app: AI formatting preserved (if setting enabled)
- [ ] Settings toggle: on/off for new content; CSS class for retroactive enable/disable
- [ ] "Paste as AI" special paste option for external AI content
- [ ] Human/machine highlighting never overlaps (typing from AI paragraph = human content)
- [ ] Agent can distinguish human vs AI content (for future knowledge gap features)
- [ ] Images: ephemeral AI icon flag for AI-generated images
- [ ] **User can insert AI-generated images into TipTap notes** — uses Sprint 37 image infrastructure with `source: 'ai-generated'` attribute

### Key Files
- New: AI content mark/decoration extension
- `lib/domain/editor/extensions-client.ts` — AI mark registration
- `components/settings/` — AI highlighting settings

---

## Sprint 46: Chat Content Outlines

- [ ] Content outline sidebar for ChatPayload nodes
- [ ] Compact outline: agent <-> user prompts (first line + "..." overflow)
- [ ] Agent content: headers, OL/UL previews (first few words per bullet)
- [ ] Graphically rich sidebar for easy chat history scanning
- [ ] Click outline item → autofocus with same CSS animations as TipTap autofocus (Sprint 39 infrastructure)
- [ ] Image captions in chat outlines

### Key Files
- `components/content/OutlinePanel.tsx` — extend for chat content
- `state/outline-store.ts` — chat outline extraction
- `components/content/ai/ChatViewer.tsx` — outline integration

---

## Sprint 47: AI Image Generation

- [ ] AI image generation inside chat content nodes and side panel chats
- [ ] Generated images → REFERENCED FilePayload content (visible in parent folder)
- [ ] Referenced content follows parent on move (Sprint 37 infrastructure)
- [ ] Drag AI content from chat → file tree (new copy, non-referenced) or → TipTap note (as referenced content)

### Key Files
- `lib/domain/ai/tools/registry.ts` — image generation tool
- `components/content/ai/ChatMessage.tsx` — image rendering in chat
- `app/api/content/content/move/route.ts` — referenced content follow (Sprint 37)

---

**Last Updated**: Mar 5, 2026
