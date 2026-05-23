# Collaboration Connection Deferral — Regression Playbook

**Branch:** `lazy-editor-and-stores` (commit `8628dae`)
**Status:** Implemented locally, NOT pushed. This playbook gates the push.

## What changed

`maybePromoteFromCurrentTopology` (in `lib/domain/collaboration/runtime.ts`) used to call `void this.promote(entry, "browser-multi-session")` directly. Now it routes through `queueInitialOrImmediatePromote`, which:

- Detects whether this is the **first promote** for the entry (no provider, no in-flight promotionPromise, no scheduled deferral).
- If yes AND `NEXT_PUBLIC_DEFER_COLLAB_CONNECT !== "false"`, schedules the promote via `requestIdleCallback` with 1500ms timeout (or `setTimeout(300)` on Safari).
- Otherwise (subsequent promotes, reconnects, late escalations), fires `this.promote` immediately — same behavior as before.

The deferred callback is cancelable on entry eviction.

Two new log events appear in console at `info` level:

- `[editor:initial_promote:scheduled]` — fired when the deferral is queued.
- `[editor:initial_promote:firing]` — fired when the deferred callback executes.

## Kill switch

To disable the deferral and confirm a regression isn't caused by it:

```bash
NEXT_PUBLIC_DEFER_COLLAB_CONNECT=false pnpm dev
```

Or set the env var in `.env.local`. When disabled, the code path matches pre-change behavior exactly.

---

## Test matrix

Run every scenario **twice** — once with deferral ON (default), once with it OFF (env var disabled). Compare behaviors. Any difference in OUTCOME (not just timing) between the two is a regression.

### S1 — Single-user autosave works

1. Open `/content`, navigate to a note you can edit.
2. Type 1-2 paragraphs.
3. Wait 2s for autosave to fire.
4. **Expect:** `[editor:autosave:executed]` → PATCH 200 in console. No `autosave:failed`. Note title in tab strip shows no unsaved indicator after save.
5. Reload page.
6. **Expect:** Your typed content is preserved.

**Verdict:** Autosave fires regardless of collab state. Pre-change baseline.

### S2 — Collab provider eventually connects

1. Open `/content`, open a note.
2. Watch console.
3. **Expect, in order:**
   - `[editor:initial_promote:scheduled]` within ~50ms of mount
   - `[page:hydrated]`, `[page:interactive]`
   - `[editor:initial_promote:firing]` somewhere 50-1500ms later
   - `[fetch:requested] GET /api/collaboration/grants` (the token fetch)
   - Provider reaches `connected`/`synced` state shortly after
4. **Expect:** Note still loads content correctly; cursor placement and typing work normally.

**Verdict:** Deferred path completes the same handshake the immediate path did.

### S3 — Multi-tab presence (two windows)

1. Open the **same note** in two browser windows on the same machine.
2. Wait 3-5s.
3. **Expect:** Each window shows the other's presence avatar / cursor color in the tab presence strip.
4. Type in one window.
5. **Expect:** Other window receives the edit within ~500ms.

**Verdict:** Y.Doc sync works. Presence broadcasts. If presence is missing, deferral may have broken `announceBrowserSession` ordering.

### S4 — Live cursor labels render

1. With two windows on the same note, click around in one window.
2. **Expect:** The other window shows a colored cursor label moving in sync.

**Verdict:** `CollaborationCaret` extension is correctly receiving awareness updates after the deferred provider connects.

### S5 — Quick tab cycling doesn't leak providers

1. Open three different notes (each in its own tab in the workspace).
2. Click between them rapidly (10-15 clicks in ~5 seconds).
3. Open DevTools Console.
4. **Expect:** Each unique content_id has at most ONE `[editor:initial_promote:scheduled]` event. Re-clicking a tab does not re-fire it.
5. Use the editor's connection-state indicator (if visible) or check `connectionState` via runtime debug to confirm all three providers are in `synced` state after cycling stops.

**Verdict:** No promote storms; idempotency of `queueInitialOrImmediatePromote` holds under fast acquire/release.

### S6 — Network drop → reconnect

1. Open a note. Wait for `synced`.
2. DevTools → Network → throttle to **Offline**.
3. Type a few characters.
4. **Expect:** Save indicator shows unsaved. Console emits something around `disconnected`.
5. Switch throttle back to **Online**.
6. **Expect:** Provider reconnects automatically. NO new `initial_promote:scheduled` fires (reconnect is a non-initial promote and bypasses the deferral). Edits sync.

**Verdict:** Reconnect path does not double-defer.

### S7 — Page reload mid-session resumes collab

1. Edit a note for ~10 seconds with active changes.
2. Hard-reload (Cmd-Shift-R).
3. **Expect:** After reload, content shows the last persisted state. Collab promote schedules and fires again per S2. No data loss.

**Verdict:** Initial-promote deferral plays nicely with reload.

### S8 — Soft navigation between notes

1. Open note A.
2. Click note B in the file tree to switch.
3. **Expect:** Each note's collab state initializes independently. Console shows `initial_promote:scheduled` for each unique content_id at most once per session.
4. Edit note B briefly.
5. Switch back to note A.
6. **Expect:** A's content shows the version from earlier (already in cache or local Y.Doc), no zombie connections.

**Verdict:** Multiple in-flight deferrals coexist correctly.

### S9 — Embed mode (iframe context)

1. Visit an `/embed/content/[id]` URL if you have access to one.
2. Open the network tab and watch for collab handshake.
3. **Expect:** Same behavior as S2 — deferred promote, eventual connection.

**Verdict:** Embed context still works (the schedulePostPaint helper handles SSR-like contexts).

### S10 — Visitor / read-only access (if applicable)

1. Open a published note via a sharing link (read-only context).
2. **Expect:** No collab promote (capability !== "syncCapable"). Or if collab is intentional, it works.

**Verdict:** Capability gate still suppresses collab when it should.

---

## Performance sanity check (after correctness passes)

With deferral ENABLED:

1. Hard-reload `/content` cold.
2. Watch console for `[page:vitals] LCP <value> (<rating>)`.
3. **Expect:** LCP value should be roughly equal to or slightly better than pre-change baseline (~1800-2400ms range). Not a regression.
4. Watch for `[editor:initial_promote:scheduled]` ms_since_nav and `[editor:initial_promote:firing]` ms_since_nav.
5. **Expect:** firing - scheduled ≈ 50-800ms (the deferral window). If firing is 0ms or matches scheduled exactly, the deferral isn't effective (idle callback fired immediately).

With deferral DISABLED (`NEXT_PUBLIC_DEFER_COLLAB_CONNECT=false`):

1. Hard-reload cold.
2. **Expect:** No `[editor:initial_promote:scheduled]` or `:firing` events. Promote fires synchronously inside `maybePromoteFromCurrentTopology`.
3. **Expect:** LCP value similar to before the change (the deferral is the only mechanism affected; everything else equal).

---

## Pass criteria — all must hold to push

- [ ] S1-S10 all pass with deferral ON
- [ ] S1-S10 all pass with deferral OFF (`NEXT_PUBLIC_DEFER_COLLAB_CONNECT=false`)
- [ ] No new console errors or warnings beyond what main shows today
- [ ] No `provider.destroy is not a function` or similar lifecycle errors during eviction/reload
- [ ] LCP rating: no regression vs main
- [ ] Browser extension's iframe path (if exercised) still works

## If a scenario fails

1. Re-run the same scenario with `NEXT_PUBLIC_DEFER_COLLAB_CONNECT=false`.
2. If it **also fails with deferral off**: pre-existing bug, not caused by this change. File separately, ship the deferral.
3. If it **passes with deferral off, fails with on**: deferral introduced a regression. Do not push. Investigate which scenario's specific event order broke.

## Rollback plan if a regression ships

1. Set `NEXT_PUBLIC_DEFER_COLLAB_CONNECT=false` in production env (Vercel dashboard).
2. Behavior reverts to pre-change immediately, no redeploy needed.
3. Investigate offline, ship a fix, then flip the env var back when ready.

---

## Open questions to revisit

- Should the deferral also wait for `page:interactive` rather than rIC? rIC can fire during hydration's idle bursts which might still be too early for some scenarios. Postponing to a `useEffect` chained off `page:interactive` is safer but adds complexity.
- Should the kill switch be a per-user setting (settings-store) rather than env var? Useful for support: "disable this for your session" without redeploying.

## Known oddities (observed during initial verification, 2026-05-23)

These were noted during the pre-merge playbook run. Each is either pre-existing
or unrelated to the deferral; recorded here so future readers don't re-discover
them as "regressions."

### O1 — Asymmetric tab presence indicator across two windows

**Observed:** With the same content open in two browser windows, the tab presence
disc shows on one window's tab but not the other's. The asymmetry persists for
the duration of the session.

**Suspected unrelated to deferral.** Tab presence renders from REST-polled
`/api/collaboration/presence` data, not from Y.js awareness. The deferral only
affects WebSocket connect timing — the REST heartbeat schedule is unaffected.

**Suspected interaction with workspace-tab-sync.** This codebase has a separate
system that unifies tab open/close state across windows in the same workspace
(close a tab in window A, it closes in window B). The presence indicator may
have a dependency on local tab state that desyncs under multi-window
workspaces.

**To diagnose:**
1. Run with `NEXT_PUBLIC_DEFER_COLLAB_CONNECT=false` and reproduce the
   scenario. If the asymmetry persists, the deferral is innocent.
2. Check `/api/collaboration/presence` response in both windows' Network tab.
   If both responses contain both sessions, the bug is client-side rendering.
   If responses differ, the heartbeat isn't reaching the server from one window.
3. Inspect `TabPresenceDiscs` props at runtime — confirm `sessions` array has
   the missing entry in the affected window.

**Not blocking the PR** — pre-existing behavior; investigate separately.
