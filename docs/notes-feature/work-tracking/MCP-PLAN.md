---
title: MCP Integration Plan — Model Context Protocol server + client
status: 🔭 PLANNED (design of record — no implementation yet)
created: 2026-07-29
last_updated: 2026-07-29
owner: davidvalentine
---

# MCP Integration Plan

**Status: 🔭 Planned.** This is the design of record for making the Digital Garden a first-class
citizen of the Model Context Protocol ecosystem — in **both directions**:

1. **MCP server** — external agents (Claude Desktop, Claude Code, IDE agents, other MCP clients)
   operate on the garden: search it, read and write notes, run playbooks and workflows.
2. **MCP client** — the garden's own chat engine consumes *external* MCP servers, so its agents
   can use third-party tools alongside the native tool registry.

Nothing here ships until it clears the standard gates. The README links this doc from its
roadmap; when milestones land, promote them there per the showcase maintenance guide.

---

## 1. Protocol grounding (what we're building against)

MCP is a JSON-RPC 2.0 protocol with capability negotiation at `initialize`. The concepts this
plan relies on:

- **Server primitives:** `tools` (model-invocable functions with JSON Schema inputs), `resources`
  (URI-addressed content, with templates and optional subscriptions), and `prompts`
  (user-selectable, parameterized instruction sets). Servers emit `list_changed` notifications
  when their offerings change.
- **Client primitives:** `sampling` (server asks the client's model to generate), `roots`
  (client-scoped filesystem/URI boundaries), and `elicitation` (server asks the user for input).
- **Transports:** `stdio` for local processes; **Streamable HTTP** for remote servers — a single
  endpoint accepting POSTed JSON-RPC with an optional SSE response stream and an
  `Mcp-Session-Id` session header. Streamable HTTP superseded the older HTTP+SSE dual-endpoint
  transport and is the only remote transport we target.
- **Authorization:** for HTTP transports, the spec's OAuth 2.1 framework — the MCP server acts as
  a **resource server** advertising protected-resource metadata (RFC 9728), with an external
  authorization server issuing tokens. Simpler bearer-token schemes are permissible for
  first-party clients; we exploit that for M1 (below).
- **SDK/runtime:** the official TypeScript SDK (`@modelcontextprotocol/sdk`) provides
  `McpServer` with `registerTool` / `registerResource` / `registerPrompt`. Vercel's `mcp-handler`
  adapts it to Next.js route handlers, which fits our deployment (Fluid Compute handles SSE and
  long-lived responses; no separate service needed).

Pin the SDK version and record the spec revision it implements at implementation time; MCP
revisions move quickly and auth details have changed between revisions.

## 2. Why this fits the existing architecture (the design's core argument)

Each MCP server primitive maps onto a subsystem the garden already has. The work is mostly
**adapter surface**, not new capability:

| MCP primitive | Existing subsystem | Adapter work |
|---|---|---|
| `tools` | Server tool registry (`lib/domain/ai/tools/registry.ts`) — search, content CRUD, flashcards, workflows already exist as internal AI tools | Wrap a curated subset with MCP JSON Schema definitions + per-token capability filtering |
| `resources` | ContentNode tree + payloads | `garden://note/{id}`, `garden://folder/{id}` URI scheme; markdown serialization via the existing lossless TipTap⇄markdown serializer |
| `prompts` | Playbooks (`lib/domain/ai/playbooks/`) — already named, discoverable, parameterized instruction sets | Expose rendered playbooks as MCP prompts; `search_playbooks` becomes `prompts/list` filtering |
| auth | Session/token infra + tenant model | Personal Access Tokens (M1), OAuth 2.1 resource server (M3) |
| write safety | Output-placement modules (`output-target.ts`, `tools/output-placement.ts`) | All MCP writes route through the same canonical placement path as native AI tools — one write-safety surface, not two |

**Design rule:** the MCP layer never talks to Prisma directly. It calls the same domain services
the native tool registry calls. That keeps authorization, tenancy, soft-delete, and collaboration
semantics (Y.doc-authoritative notes) in one place — and means an MCP write can't corrupt a
collab document any differently than a native tool write could.

## 3. Server design

### 3.1 Transport & mounting

- Route: `app/api/mcp/[transport]/route.ts` via `mcp-handler` (Streamable HTTP; SSE fallback
  handled by the adapter). Stateless-session mode initially: each request authenticates
  independently; `Mcp-Session-Id` supported but no server-side session state beyond auth.
- Deployed with the main Vercel app. No new service, no new infra.

### 3.2 Tool surface (curated, capability-scoped)

M1 (read-only):

| MCP tool | Backs onto | Notes |
|---|---|---|
| `garden_search` | content search service | full-text + tag filters; returns ids + snippets, never full payloads |
| `garden_read_note` | note read + markdown serializer | returns markdown + metadata (tags, backlinks); respects soft-delete |
| `garden_list_tree` | tree endpoint service | scoped to token's root caps; depth-limited |
| `garden_get_backlinks` | backlinks service | knowledge-graph traversal for agents |

M2 (write, gated per token):

| MCP tool | Backs onto | Notes |
|---|---|---|
| `garden_create_note` | create-document service + output placement | parent folder must be inside token scope |
| `garden_append_to_note` | output-placement modules | append-only by default; full replace requires an elevated capability |
| `garden_run_workflow` | workflow trigger service | only workflows explicitly marked externally-triggerable; honors the "Run button is the sanctioned trigger" rule by making MCP an *equivalent sanctioned* entry with its own audit trail |

Everything returns structured content (typed JSON alongside text) so capable clients get machine-
readable results.

### 3.3 Resources & prompts

- `garden://note/{id}` (markdown), `garden://folder/{id}` (listing) via resource templates.
  Subscriptions (`resources/subscribe`) deferred — requires change-feed plumbing; revisit after M3.
- Playbooks exposed as MCP prompts: `prompts/list` returns playbooks the token can see;
  `prompts/get` returns the **rendered** playbook (progressive disclosure is an in-engine
  optimization; external clients get the compiled form). This gives any MCP client one-command
  access to the garden's operating procedures.

### 3.4 Authorization model

- **M1 — Personal Access Tokens.** Created in Settings; stored hashed; each token carries
  **capabilities** (`read` | `write` | `run-workflows`) and an optional **content scope** (a
  folder subtree — reusing the Folder Studio caps model). Sent as `Authorization: Bearer`.
  Sufficient for first-party use (your own Claude Desktop/Code talking to your garden).
- **M3 — OAuth 2.1 resource server** for third-party clients: protected-resource metadata
  (RFC 9728) advertising the authorization server, token audience validation, scope→capability
  mapping. Not before there's a real third-party consumer.
- Every MCP call is audit-logged (actor = token, action, target ids) through the existing
  admin/audit logging.

## 4. Client design (M4 — external tools inside garden chat)

- Settings surface: register external MCP servers (name, URL, auth header), per-server enable.
- Engine integration: AI SDK's MCP client (`experimental_createMCPClient`) converts a server's
  tools into AI SDK tool definitions, merged into the chat tool loop **namespaced by server**
  (e.g. `linear__create_issue`) to avoid collisions with native tools.
- **Trust boundary:** external tool descriptions and outputs are untrusted input (prompt-injection
  surface). Mitigations, in order: per-tool allowlist at registration (user picks which tools the
  agent may see); human approval required for any external tool call that follows reading
  external content in the same run; external tool output wrapped in delimited, provenance-tagged
  blocks in context; `list_changed` re-pins — if a server redefines a tool, it drops to
  unapproved until re-allowlisted (rug-pull defense).
- Runs consuming external tools are metered by the existing run ledger; per-run external-call
  budgets ride the planned resource-governance work (AI 3.7).

## 5. Threat model (summary)

| Threat | Mitigation |
|---|---|
| Token leakage → full-garden read | Scoped tokens (capability + subtree), hashed at rest, revocable, audit-logged |
| Prompt injection via external MCP tools/resources | Allowlists, approval gates, provenance tagging, no chained writes after untrusted reads without approval |
| Confused deputy (garden server invoked with someone else's authority) | Token ↔ tenant binding checked in the domain layer, not the adapter |
| Tool-definition rug-pull on external servers | Pin-and-reapprove on `list_changed` |
| Write amplification / doc corruption | All writes through canonical output-placement + collab-safe paths; append-only default |

## 6. Milestones & gates

| Milestone | Scope | Gate |
|---|---|---|
| **M1 — read-only server** | PAT auth + `garden_search` / `garden_read_note` / `garden_list_tree` / `garden_get_backlinks` + note/folder resources | MCP Inspector clean; Claude Desktop + Claude Code connect and answer questions from garden content; zero write paths exist |
| **M2 — writes** | create/append tools behind `write` capability; audit trail | Round-trip: external agent files a note, it appears correctly in-app incl. collab view |
| **M3 — OAuth 2.1 + playbook prompts** | Resource-server metadata; prompts surface | Third-party MCP client authorizes without a PAT |
| **M4 — MCP client in chat** | Settings registration, namespacing, approval gates | External tool called mid-conversation with approval flow; injection red-team checklist passes |

M1 is deliberately small — it's the showcase slice (demoable from Claude Desktop against a real
garden) and carries no write risk. Testing throughout: MCP Inspector for contract conformance,
Claude Desktop/Code as reference clients, plus route-handler unit tests for auth/scoping.

## 7. Explicitly out of scope (for now)

Resource subscriptions/change feeds; MCP `sampling` from our server (we have our own model
stack); exposing binary `FilePayload` content (presigned-URL dance needs its own design);
multi-tenant third-party marketplace listing (single-owner garden first).
