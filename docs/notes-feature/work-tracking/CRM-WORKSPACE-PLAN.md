---
last_updated: 2026-11-17
status: milestone 1 built (branch feat/crm-workspace)
first_user: Barefoot Yard Co. (fictional demo data)
---

# CRM Workspace — Plan and Milestone 1

An optional CRM for service businesses, inside the Garden workbench. Barefoot
Yard Co. (goathead burr extraction, Southern Utah) is the first business; the
model is built so other service businesses bring their own words, fields and
record layouts.

## The design in one paragraph

The CRM is a **lens over a folder of ordinary databases** (product principle 1:
project the structure the user owns, never a parallel store). Setting up a
business creates a folder plus five linked tables in one transaction
(`applyLinkedSchema`): Contacts, the **service subject** (Properties,
Vehicles…), Opportunities (Quotes), Messages, Activity. A small config on the
folder (`FolderPayload.viewPrefs.crm`, beside `treeSort`) names the business's
terms and binds the CRM's roles to **column and option ids** — so renaming
"Gate instructions" or the "Paused" option in the grid never detaches the CRM.
Every view projects one shared snapshot through one pure module
(`lib/domain/crm/model.ts`), so the inbox, pipeline and records cannot
disagree. **No schema change, no migration, no TipTap change.**

## Where things live

| Concern | Path |
|---|---|
| Tab ids, config, presets, read model (pure, client-safe) | `lib/domain/crm/{ids,config,presets,model}.ts` |
| Extension (opt-in: `enabledByDefault: false`) | `extensions/crm/` — manifest, client runtime, components, `state/crm-store.ts` |
| Server: load + access, setup, events, actions, writes | `extensions/crm/server/` |
| Automation seam (simulator default, n8n adapter) | `extensions/crm/server/automation/` |
| Routes (thin) | `app/api/crm/businesses`, `app/api/crm/[folderId]{,/drafts,/stage,/events}` |
| Gate (pure, in `build` ⇒ CI) | `scripts/validate-crm.ts` — `pnpm crm:check` |
| Demo fixtures (localhost only) | `scripts/seed-crm-demo.ts` — `pnpm crm:demo` |

## Configurability (kept as small as milestone 1 allows)

- **Terms** — subject / opportunity / contact, singular + plural; shown in
  navigation, headings, actions.
- **Which table is the subject** — `tables.subjects`. When it equals
  `tables.contacts` the business serves people directly (the contact IS the
  subject); the record view, pipeline and history all work unchanged.
- **Subject fields** — the record view renders *every* subject column through
  the database's own field renderer (`DataRowFields`); `subjectFields` picks the
  compact set shown in the inbox sidebar.
- Presets: `property-service` (Address, Gate instructions, Lot size, Field
  notes), `vehicle-service` (Make, Model, Year, Parking notes, Field notes),
  `person-service` (contact as subject). One builder makes all three.

## Access boundaries

The folder must be viewable by the caller, and **every table the config
names is re-resolved** with `resolveDataTableAccess` (owner, or a ViewGrant).
The config is user-writable folder state and confers nothing. Failing either →
404 (the data routes' stance: never confirm existence). Field edits go through
the database's own rows route, with its own check. Writes need `write` on each
table they touch.

## n8n's role

Digital Garden owns the records, drafts and the visible follow-up status (the
Follow-up / Follow-up note columns). The executor carries out timed work and
is told when DG's decision changes — `CrmAutomationAdapter.pauseFollowUp`,
the same registry shape as the workflows extension's `WorkflowEngineAdapter`.
The local **simulator** is the default; the **n8n** adapter reuses
`postToN8nUrl` (env `N8N_BASE_URL`, `CRM_N8N_WEBHOOK_PATH`) and is unverified
against a live n8n. Inbound events have ONE seam — `POST /api/crm/[id]/events`
→ `ingestCrmEvent` — used by the inbox simulator and the demo seed today, and
by an n8n webhook later.

**Idempotency.** One advisory lock per (folder, eventId) serialises
deliveries; each effect has its own key — message `External id = sms:<id>`,
activity `Event key = msg:<id>` / `pause:<id>` — so a replay completes a
half-applied event and is otherwise a no-op. Verified: two concurrent replays
→ one message, one "received" entry, one pause.

**Which quote does a reply concern?** (`matchReplyToOpportunity`) — the last
outbound text we sent that names an opportunity; else the contact's single
open opportunity with a follow-up in flight; else none (never guessed — a
wrong guess pauses the wrong property's follow-up).

## Known limits (milestone 1)

- **A CRM tab opened beside the inbox is not restored to its pane on
  reload.** Workplaces deliberately never persist extension virtual tabs
  (`extensions/workplaces/server/service.ts`, "not content, so never
  persisted"); the last-selected tab comes back via localStorage. The record
  is one click away in the CRM nav. Changing this is a workplaces decision
  (it affects the reader's tabs too).
- One snapshot page per table (500 rows); the nav says when it truncates.
- Contacts are CRM rows, not People-extension `Person` records — a `person`
  column (`personSource: "person"`) linking them is the obvious next step.
- No live SMS, calling, invoicing or workflow editor; the follow-up timer
  itself is not run by the simulator (DG records the state; nothing sends).
- The events route uses the operator's session; n8n will need the workflows
  extension's service-token auth (`dgwf_…`) on it.

## Next milestones

1. Live channel: an SMS provider → n8n → `/events` with service-token auth;
   "Send" on drafts through the executor.
2. Follow-up execution: n8n owns the timers; DG schedules/cancels through the
   adapter (`scheduleFollowUp`), and a due follow-up becomes an outbound row.
3. Bring-your-own tables: bind an existing folder's databases (a binding UI
   over the same config) instead of only the starter presets.
4. People link, invoicing, calls.
