# Layout Intent / Projection — Behavioral Spec v2 & Infra Plan

**Status:** v2 — owner behavioral requirements encoded (2026-08-14). Supersedes the v1 pure-taxonomy draft; v1's class system and ghost-writer audit remain valid and are folded in below.
**Branch:** `feat/layout-intent-projection`.

## 1. Principle (unchanged from v1)

| Class | Name | Storage | Sync |
|---|---|---|---|
| **I** | **Workspace intent** | Workspace record (server) | ✅ |
| **II** | **Projection** — how a surface renders intent | Pure function, never stored | ❌ |
| **III** | **Device navigation** | Device-local (+ per-device *layout records*, server-listed for adoption) | ❌ (readable by others for inheritance/adoption) |
| **IV** | **User preference** | Settings | ✅ (device-scoped subset local) |

Sync intents, derive projections, keep navigation local. A projection may write nothing.

## 2. Behavioral requirements (owner, 2026-08-14)

**R1 — Tab membership always syncs, per workspace.** Content opened anywhere appears as a tab in every session of that workspace, on every surface. Content closed anywhere (tab ✕ or any close path) disappears everywhere. Membership is **workspace-scoped, not pane-scoped**.

**R2 — Layout + tab order couple across DESKTOP only.** Two desktop windows on the same workspace mirror pane layout and tab order live. Every other surface — native phone, native tablet, web-mobile phone, web-mobile tablet, and **each extension surface individually** (no cross-extension coupling) — keeps an independent layout. Decoupled is the default posture; desktop is the one platform designed to couple, and only on the same workspace.

**R3 — Active view NEVER syncs.** Active tab / active pane never propagate — not even between coupled desktops. Two sessions on one workspace may deviate in what they're looking at. Active view is only **inherited** as a seed when a layout is adopted/inherited (roll over the source's last-active to infer where the user was).

**R4 — New tabs land via a compatibility layer.** A tab opened into a pane on one layout lands in the *closest compatible pane* on each other layout (see §4). Final fallback of the chain: **top-left (main) pane**.

**R5 — Memoryless sessions inherit.** A session opening a workspace with no local layout record adopts: most recent **desktop** layout → else most recent **extension** → else most recent **mobile**. The inherited record's last-active view seeds the initial active view.

**R6 — Workspace selection NEVER syncs.** Which workspace a session has open is strictly per-session/device. (Historical bug; the infra must make it structurally impossible, not just avoided.)

**R7 — Quad allowed everywhere except extensions.** Extensions never render/offer quad. Mobile keeps quad for now (on the chopping block, undecided) — rendered via projection if the layout says so.

**R8 — Order is read-at-open, not actively pushed** (outside the live desktop coupling of R2). Sessions write their own layout records as they change; others consume those records only at workspace-open (R5) or explicit adoption (F2).

### New features

**F1 — Main-workspace-only "adopt into new workspace".** A quick affordance (Main workspace only) that snapshots the current tab layout into a brand-new workspace: quick name + icon assignment. No other workspace offers this.

**F2 — Cross-device layout adoption ("sync affordance").** Any workspace view can adopt another device's layout for the same workspace (e.g. desktop adopts the phone's single-pane + its active tab). The affordance opens a dropdown of **unique per-device layout records, recency < 30 days** (stale layouts are forgotten). A radio selects the **lead layout** — overriding the default inheritance chain (R5) for this workspace; if the lead device's record expires, the default chain wins again.

## 3. Data model

### Workspace intent (Class I — always synced)
```
WorkspaceTabMembership {
  workspaceId
  tabs: [{ contentId, affinity: { h: left|right, v: top|bottom },  // placement hint, from origin pane
           isPinned, addedAt }]
  // NO layoutMode, NO order, NO active fields at workspace level
}
```
Open/close events mutate this set and fan out to all sessions (R1). The existing per-tab `preferredHorizontal`/`preferredVertical` fields in `WorkspaceTabState` are the affinity carriers — already in the codebase.

### Layout records (Class III — per surface family, server-listed for R5/F2)
```
WorkspaceLayoutRecord {
  workspaceId
  family: "desktop" | "native-phone" | "native-tablet" | "web-phone" | "web-tablet"
        | "ext:<extensionSurfaceId>"          // every extension surface unique (R2)
  deviceId: string                             // sentinel "shared" for the desktop record —
                                               // NOT nullable: Postgres unique indexes treat
                                               // NULLs as distinct, permitting duplicate rows
  layoutMode, paneOrder: [{ paneOrdinal, tabOrder: contentId[] }]
  lastActive: { paneOrdinal, contentId }       // inheritance seed ONLY (R3)
  updatedAt                                    // 30-day recency filter (F2)
}
```
- **Desktop = one shared record per workspace** (that *is* the coupling; concurrent desktops live-follow it).
- All other families: one record per device, written by that device, read by others only at open/adopt.
- Retention: records older than 30 days drop out of the F2 picker; a lead-layout pointer to an expired record falls back to the R5 chain.

### Explicitly NOT stored anywhere shared
Active tab/pane (except the `lastActive` seed), scroll, focus mode, drawers, sidebar geometry, which workspace is open (R6 — there is simply no field for it in any synced record).

## 4. Pane compatibility matrix (R4)

Panes have **ordinals** (primary=TL, secondary, tertiary, quaternary) per layout:

| Layout | 1º | 2º | 3º | 4º |
|---|---|---|---|---|
| single | TL | — | — | — |
| dual-vertical (side-by-side) | TL | TR | — | — |
| dual-horizontal (stacked) | TL | BL | — | — |
| quad | TL | TR | BL | BR |

**Landing rule** for a tab with origin ordinal *n* arriving at a layout with *k* panes:
1. Land at ordinal **min(n, k)** — so side-by-side *right* (2º) ↔ stacked *bottom* (2º), the owner's canonical example.
2. Quad refines with stored affinity `(h, v)` → exact quadrant; affinity is also back-filled cross-axis (right⇒bottom, left⇒top and inverse) so dual↔dual mappings stay stable.
3. Anything unresolvable → **top-left** (main target pane; R4's worst case).

Projection composes with this: a phone projecting quad→dual applies the same rule against its projected pane count.

## 5. Inheritance & adoption chain (R5, F2)

```
open workspace on a session:
  local layout record for (workspace, family, deviceId)?   → use it
  else lead-layout pointer set AND record fresh (<30d)?    → adopt lead (incl. lastActive seed)
  else most recent desktop record?                         → adopt
  else most recent extension record?                       → adopt      (extension > mobile)
  else most recent mobile record?                          → adopt
  else                                                     → default single, all tabs TL, first tab active
```
Adoption copies the record into the session's own local record; from then on the session diverges freely (R8).

## 6. Ghost-writers to eliminate (v1 audit — all still apply)

1. Phone coercion effect (`MobileNotesLayout` `setLayoutMode`) → delete; projection replaces it.
2. Focus route writes (`FocusContentWorkspace` `restoreWorkspace single` + `setCollapsed`) → projection input.
3. **CONFIRMED:** embed panel mounts the workspace persist controller (`MainPanelWorkspace.tsx:716` gates shell controllers only on `!isFocusMode`; `WorkplacesShellController` registered `extensions/workplaces/client.tsx:13`) — the extension iframe PATCHes workspace state today. Under v2, extension surfaces write **only their own `ext:*` layout records**, never workspace intent fields beyond R1 membership events.
4. Right-sidebar <960px auto-collapse effect → fold into projection when touched.
5. Sync-restore echo (`restoreContentWorkspace` re-applying server payload over live local state) → dissolves: the only always-synced stream is membership (R1); layout arrives solely at open/adopt.

## 7. Settings classification (Class IV split)

Three buckets; "universal" changes propagate passively on next settings fetch.

**Device-scoped (local to the device, never synced):**
sidebar widths & collapse states (already local) · editor font scale / zoom · reduced-motion & animation toggles · phone projection preferences (default-single-pane, hide-quad-in-switcher if D2 lands that way) · landscape nav auto-hide on/off · haptics (shell) · notification sound/vibration per device · on-device media autoplay · dev worktree banner · collapse-handle positions.

**Universal (account-wide, synced):**
AI connections/keys & feature routing · default templates & periodic-notes config · tag colors · flashcard scheduling parameters · publishing config · timestamp/week-start/locale formats · spellcheck/language · trash retention · wiki-link behavior · TTS voice + speed.

**Universal with per-device override (base synced; device may pin its own):**
theme (dark on OLED phone, light on desktop) · editor density/line-width · font family. Override lives device-local; clearing it re-follows the universal base.

## 8. Infra phases (build order, after owner sign-off on this spec)

1. **P1 — Membership split:** extract `WorkspaceTabMembership` (R1) from the layout payload; open/close fan-out; affinity capture on placement. Server accepts+ignores legacy fields during rollout.
2. **P2 — Layout records:** `WorkspaceLayoutRecord` table + per-family write paths; desktop shared record = the coupling (R2); kill ghost-writers 1–3; active-view fields removed from all shared writes (R3); R6 enforced by schema absence.
3. **P3 — Compatibility layer:** ordinal+affinity landing (§4) applied on membership fan-in and layout switches; `useProjectedLayout()` for phone/extension/focus projections (R7 extension quad ban lives here).
4. **P4 — Inheritance chain (R5/R8)** + 30-day recency.
5. **P5 — Features:** F2 sync affordance (dropdown + lead radio) → F1 Main-workspace adopt-into-new-workspace.
6. **P6 — Settings split (§7)** — can run parallel to P4/P5.

### Owner decisions (2026-08-15 — all confirmed)
- ✅ Desktop coupling is platform behavior (not a toggle); live only among concurrently-open desktops. All other families read layout at workspace-open only, **new opens targeting ordinally to preference** (affinity-guided ordinal landing, §4).
- ✅ D2: **mobile keeps quad** — build it, but architect for a cheap future chop (quad availability must be a per-family projection capability flag, not scattered conditionals; chopping = flipping the flag for phone families).
- ✅ D3: pane sizes are device-local geometry.
- F1 icon/name picker: reuse the existing workspace-create dialog components (implementation detail, P5).

## 9. Verification plan (infra PR gate)

- **R1:** open/close on phone ↔ appears/disappears on desktop + extension panel.
- **R2:** two desktop windows mirror layout+order live; phone/extension layout changes never move desktop.
- **R3:** active tab changes propagate nowhere — including desktop↔desktop.
- **R4:** side-by-side right-pane open lands stacked-bottom on the other device; all-miss lands TL.
- **R5/R8:** fresh device inherits per chain (desktop > extension > mobile) incl. lastActive seed, then diverges.
- **R6:** switching workspace on device A provably cannot affect device B (no schema path).
- **F2:** picker lists only <30-day records, one per device; lead radio overrides chain; expiry falls back.
- Embed clobber regression: tab activity in the extension panel never PATCHes desktop-visible state beyond R1 membership.
