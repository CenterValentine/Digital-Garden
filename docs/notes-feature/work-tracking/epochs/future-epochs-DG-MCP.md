---
status: stub
last_updated: 2026-03-14
---

# Future Epoch: Digital Garden MCP Server

**Theme:** Expose Digital Garden as an MCP (Model Context Protocol) server, enabling Claude Code and other MCP clients to use your notes, docs, and knowledge base as live context for code editing, documentation management, and agentic workflows.

**Vision:** Your notes become a self-referential context layer — write architecture notes in Digital Garden, then use them as specifications when Claude Code edits this very app. Documentation stays in sync because the same system that holds the docs can feed them to the AI that maintains them.

---

## Phase 1: Core MCP Server

- MCP server process (Node.js, `@modelcontextprotocol/sdk`) as a standalone sidecar
- **Resources:** Expose ContentNodes as searchable resources (notes, files, chats)
- **Tools:** `search_notes(query)`, `get_note(id)`, `get_tree(parentId?)`, `list_tags()`, `get_tagged_content(tagId)`
- Auth: reuse existing session/API key mechanism or local-only mode for dev
- Configuration: `.mcp.json` or env vars for DB connection, port, allowed origins

## Phase 2: Write Operations + Prompts

- **Tools (write):** `create_note(title, content?, parentId?)`, `update_note(id, content)`, `move_node(id, parentId)`, `tag_node(id, tagId)`
- **Prompts:** Pre-built prompt templates (e.g., "summarize my sprint notes", "find all TODOs across notes", "draft a STATUS.md update from recent notes")
- Conflict detection: warn if note was modified since last read

## Phase 3: Documentation Gardener

- Automated doc-sync workflows: notes → CLAUDE.md context, sprint notes → STATUS.md updates
- Watch mode: MCP server detects content changes and can trigger downstream updates
- Export integration: serve formatted markdown/HTML via MCP for external consumption

## Phase 4: Claude Code Integration

- `.claude/mcp.json` configuration to auto-connect Claude Code sessions to the Garden MCP server
- CLAUDE.md generator: export selected notes as project context files
- Bidirectional: Claude Code can read notes for context AND write findings back as new notes

---

## Prerequisites

- Epoch 10 (AI TipTap) complete — establishes AI integration patterns
- Familiarity with MCP SDK (`@modelcontextprotocol/sdk`)
- Decision on auth model (local-only dev vs. multi-user)

## Open Questions

- Should the MCP server run as a separate process (sidecar) or as Next.js API routes with MCP protocol adapter?
- Which content types are most valuable as MCP resources? (Notes first, then files/chats?)
- How to handle large notes — chunked resources or summary + full-text?
- Should the server support SSE transport (remote) or stdio only (local Claude Code)?
- How does this interact with existing AI chat tools (`searchNotes`, `getCurrentNote`, `createNote` in `lib/domain/ai/tools/`)? Shared logic or separate implementations?

---

**Last Updated**: Mar 14, 2026
